"""Reconcile a saved official-docket scan with Ninefold's application collection.

Discovery is bounded evidence, not a claim of a complete live Court index.
Malformed docket pages are recorded as unresolved; prior case records are retained.
"""

import argparse
import hashlib
import io
import json
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from application_parsing import application_title, case_name, filing_title, parse_docket
from application_status import final_state
from audit_application_dockets import SCAN_RANGES, docket_url
from order_import_support import (
    DIST,
    JSON_SUFFIX,
    PrivateCache,
    add_cache_argument,
    application_id,
    fetch,
    official_url,
    output_path,
    read_data,
    write_json,
)
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from refresh_collection_coverage import refresh

TERM_START = "2026-10-05"
TERM = 2026
ORDER_KIND = "Miscellaneous Order"
MATERIAL_FIELDS = (
    "textPath",
    "pdfPath",
    "sourceSha256",
    "pageCount",
    "characterCount",
    "scanOnly",
    "pdfPreferred",
    "extractionStatus",
)


def now():
    return datetime.now(timezone.utc).isoformat()


def supplement_proceedings(docket_id, proceedings, orders):
    """A published individual order can precede its docket-page entry."""
    for order in orders:
        app_ids = [identifier for identifier in order["dockets"] if "A" in identifier]
        if (
            app_ids != [docket_id]
            or order["kind"] != ORDER_KIND
            or order["date"] < proceedings[-1]["date"]
        ):
            continue
        match = re.search(r"\bThe application", order["searchText"])
        if match is None:
            continue
        description = order["searchText"][match.start() :]
        if any(proceeding["description"] == description for proceeding in proceedings):
            continue
        proceedings.append(
            {
                "date": order["date"],
                "description": description,
                "links": [{"label": "Order", "url": order["sourceUrl"]}],
                "sourceUrl": order["sourceUrl"],
            }
        )
    return proceedings


def filing_classification(description, label, url):
    lower = description.lower()
    if "/orders/" in url or "/opinions/" in url:
        return "Decision", "Order", "Order of the Court"
    if re.search(r"appendix|appendices|appx", label + " " + url, re.IGNORECASE):
        title = (
            "Appendix to the Application"
            if lower.startswith("application")
            else "Appendix"
        )
        return "Appendices", "Appendix", title
    if re.search(r"amicus|amici", description, re.IGNORECASE):
        return "Amicus", "Amicus brief", filing_title(description)
    if lower.startswith("application"):
        return "Merits", "Application", application_title(description)
    if lower.startswith("response"):
        return "Merits", "Response", "Response to the Application"
    if lower.startswith("reply"):
        return "Merits", "Reply", "Reply in Support of the Application"
    return "Other", "Filing", filing_title(description)


def document_id(docket_id, url):
    return application_id(docket_id) + "-" + hashlib.sha1(url.encode()).hexdigest()[:12]


def filing_candidates(case):
    seen = {document.get("sourceUrl") for document in case["documents"]}
    documents = []
    for proceeding in case["proceedings"]:
        for link in proceeding["links"]:
            url, label = link["url"], link["label"]
            if not re.search(r"\.pdf(?:$|\?)", url, re.IGNORECASE) or url in seen:
                continue
            if re.search(
                r"proof of service|certificate(?: of|$)|word count",
                label,
                re.IGNORECASE,
            ):
                continue
            seen.add(url)
            category, kind, title = filing_classification(
                proceeding["description"], label, url
            )
            documents.append(
                {
                    "id": document_id(case["id"], url),
                    "caseId": case["id"],
                    "title": title,
                    "category": category,
                    "type": kind,
                    "date": proceeding["date"],
                    "sourceUrl": url,
                    "description": proceeding["description"],
                    "linkLabel": label,
                }
            )
    return documents, seen


def attach_published_orders(case, orders, seen):
    excluded = {
        "searchText",
        "dockets",
        "sourceIndex",
        "circuitSourceUrl",
        "kind",
        "term",
    }
    for order in orders:
        if case["id"] not in order["dockets"] or order["sourceUrl"] in seen:
            continue
        seen.add(order["sourceUrl"])
        document = {key: value for key, value in order.items() if key not in excluded}
        document.update(
            id=document_id(case["id"], order["sourceUrl"]),
            caseId=case["id"],
            category="Decision",
            title=order["kind"] + " · " + order["date"],
            type="Order",
        )
        case["documents"].append(document)


class Reconciliation:
    def __init__(self, cache, *, dist=DIST):
        self.cache = cache
        self.dist = dist
        self.data = dist / "data"
        self.term = read_data("current-term", data=self.data)
        self.catalog = read_data("catalog", data=self.data)
        self.orders = read_data("court-orders", data=self.data)["documents"]
        self.current = {case["id"]: case for case in self.term["cases"]}
        self.old = {case["id"]: case for case in self.catalog["cases"]}
        self.known = {**self.old, **self.current}
        self.existing = {
            document["sourceUrl"]: document
            for case in self.known.values()
            for document in case.get("documents", [])
            if document.get("sourceUrl")
            and (document.get("textPath") or document.get("pdfPath"))
        }
        self.checks, self.new, self.updated, self.pending = [], [], [], []
        self.failures, self.jobs, self.parse_failures = [], [], []

    def docket(self, docket_id):
        raw = self.cache.read("docket-" + application_id(docket_id) + JSON_SUFFIX)
        if raw is None:
            raise ValueError("No cached docket response")
        snapshot = json.loads(raw)
        if snapshot.get("status") != "200":
            raise ValueError("Cached docket response is not HTTP 200")
        info, caption, proceedings = parse_docket(snapshot["html"])
        if not caption:
            raise ValueError("No official caption for " + docket_id)
        return (
            info,
            caption,
            supplement_proceedings(docket_id, proceedings, self.orders),
        )

    def prepare_case(self, docket_id, info, caption, proceedings):
        status, result, decided = final_state(proceedings)
        if (
            not any(item["date"] >= TERM_START for item in proceedings)
            and status != "Pending"
            and docket_id not in self.current
        ):
            return
        fresh = docket_id not in self.known
        case = self.known.get(
            docket_id,
            {
                "id": docket_id,
                "docket": docket_id,
                "name": case_name(caption),
                "fullName": caption,
                "term": TERM,
                "collection": "Emergency applications",
                "documents": [],
                "advocates": [],
                "amici": [],
                "areas": [],
                "relatedDockets": re.findall(
                    r"[0-9]{2}-[0-9]+", info.get("Linked with", "")
                ),
            },
        )
        case.update(
            sourceUrl=docket_url(docket_id),
            courtBelow=info.get("Lower Ct", case.get("courtBelow")),
            proceedings=proceedings,
            applicationFiled=proceedings[0]["date"],
            docketCheckedAt=now(),
        )
        update = {"status": status, "result": result, "decided": decided}
        if docket_id in self.old and docket_id not in self.current:
            prior = case.setdefault("priorTermOrders", {})
            prior[str(TERM)] = {**prior.get(str(TERM), {}), **update}
        else:
            case.update(update)
            self.current[docket_id] = case
        (self.new if fresh else self.updated).append(docket_id)
        if status == "Pending":
            self.pending.append(docket_id)
        self.checks.append(
            {
                "id": docket_id,
                "status": status,
                "lastActivity": proceedings[-1]["date"],
                "sourceUrl": case["sourceUrl"],
            }
        )
        candidates, seen = filing_candidates(case)
        self.jobs.extend((case, document) for document in candidates)
        attach_published_orders(case, self.orders, seen)

    def prepare(self, scan):
        # Validate the whole scan before opening any docket named by its content.
        identifiers = [application_id(row["id"]) for row in scan]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Duplicate docket IDs in scan")
        for row in scan:
            if row["status"] != "found" or not row.get("substantive"):
                continue
            docket_id = row["id"]
            try:
                info, caption, proceedings = self.docket(docket_id)
            except (ValueError, KeyError) as error:
                self.parse_failures.append(
                    {"id": docket_id, "status": "unrecognized", "error": str(error)}
                )
                continue
            self.prepare_case(docket_id, info, caption, proceedings)

    def extract(self, job):
        case, document = job
        url = document["sourceUrl"]
        try:
            official_url(url)
            if url in self.existing:
                document.update(
                    {
                        key: self.existing[url][key]
                        for key in MATERIAL_FIELDS
                        if key in self.existing[url]
                    }
                )
            else:
                self.extract_pdf(document)
            return case, document, None
        except (OSError, ValueError, subprocess.SubprocessError, PdfReadError) as error:
            return case, document, str(error)

    def extract_pdf(self, document):
        raw = fetch(self.cache, document["sourceUrl"])
        reader = PdfReader(io.BytesIO(raw))
        pages = [
            {
                "number": number + 1,
                "label": str(reader.page_labels[number]),
                "text": (page.extract_text() or "").replace("\x00", "").strip(),
            }
            for number, page in enumerate(reader.pages)
        ]
        if not pages:
            raise ValueError("PDF has no pages")
        characters = sum(len(page["text"]) for page in pages)
        pdf_path = "data/pdfs/" + document["id"] + ".pdf"
        output_path(self.dist, pdf_path).write_bytes(raw)
        document.update(
            pdfPath=pdf_path,
            sourceSha256=hashlib.sha256(raw).hexdigest(),
            pageCount=len(pages),
            characterCount=characters,
        )
        if characters < 80:
            document.update(
                scanOnly=True, pdfPreferred=True, extractionStatus="Scan-only PDF"
            )
        else:
            text_path = "data/current-docs/" + document["id"] + JSON_SUFFIX
            write_json(
                output_path(self.dist, text_path),
                {
                    "id": document["id"],
                    "title": document["title"],
                    "sourceUrl": document["sourceUrl"],
                    "pages": pages,
                },
            )
            document.update(textPath=text_path, extractionStatus="Extracted")

    def import_filings(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            for case, document, error in pool.map(self.extract, self.jobs):
                if "unavailableFilings" in case or error is not None:
                    case["unavailableFilings"] = [
                        item
                        for item in case.get("unavailableFilings", [])
                        if item.get("sourceUrl") != document["sourceUrl"]
                    ]
                if error is None:
                    case["documents"].append(document)
                    continue
                self.failures.append(
                    {
                        "caseId": case["id"],
                        "sourceUrl": document["sourceUrl"],
                        "title": document["title"],
                        "error": error,
                    }
                )
                case["unavailableFilings"].append(
                    {
                        "title": document["title"],
                        "category": document["category"],
                        "date": document["date"],
                        "sourceUrl": document["sourceUrl"],
                        "availability": "Public link could not be retrieved during reconciliation",
                    }
                )

    def save(self, scan):
        self.term["cases"] = list(self.current.values())
        self.term["updatedAt"] = now()
        for name, collection in (
            ("current-term", self.term),
            ("catalog", self.catalog),
        ):
            refresh(collection, data_dir=self.data)
            write_json(
                output_path(self.data, name + JSON_SUFFIX), collection, compact=True
            )
        unresolved = [
            row for row in scan if row["status"] not in ("found", "not-found")
        ]
        audit = {
            "checkedAt": now(),
            "term": TERM,
            "termStart": TERM_START,
            "scanRanges": list(SCAN_RANGES),
            "checkedIds": len(scan),
            "foundDockets": sum(row["status"] == "found" for row in scan),
            "unresolvedDockets": unresolved + self.parse_failures,
            "included": self.checks,
            "newDockets": self.new,
            "updatedDockets": self.updated,
            "pendingDockets": self.pending,
            "addedFilingCandidates": len(self.jobs),
            "unavailablePublicFiles": self.failures,
            "scope": "Substantive applications with activity on or after October 5, 2026, plus unresolved applications carried forward and existing OT26 records. Routine time-extension applications are excluded. Filing imports exclude service and word-count certificates. Discovery is bounded to the recorded docket ranges and published order sources.",
        }
        write_json(output_path(self.data, "orders-coverage" + JSON_SUFFIX), audit)
        return audit

    def run(self):
        raw = self.cache.read("scan" + JSON_SUFFIX)
        if raw is None:
            raise ValueError(
                "Run audit_application_dockets.py with this cache name first"
            )
        scan = json.loads(raw)
        self.prepare(scan)
        self.import_filings()
        return self.save(scan)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_cache_argument(parser)
    args = parser.parse_args()
    audit = Reconciliation(PrivateCache(args.cache)).run()
    print(
        f"Added {len(audit['newDockets'])} dockets; {len(audit['pendingDockets'])} without a final disposition."
    )
    print(
        f"Unresolved docket pages: {len(audit['unresolvedDockets'])}; unavailable files: {len(audit['unavailablePublicFiles'])}."
    )


if __name__ == "__main__":
    main()
