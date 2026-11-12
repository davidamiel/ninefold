"""Import official OT order documents, preserving original PDFs and page boundaries.

Dependencies: scripts/requirements-orders.txt. Use a new --cache name for a fresh
snapshot. Importing this module performs no network requests or filesystem writes.
"""

import argparse
import hashlib
import io
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from urllib.parse import urljoin, urlsplit

from application_parsing import normalize
from bs4 import BeautifulSoup
from order_import_support import (
    BASE,
    DIST,
    JSON_SUFFIX,
    PrivateCache,
    add_cache_argument,
    fetch,
    official_url,
    output_path,
    write_json,
)
from pypdf import PdfReader

COURT_ORDERS = "Court orders"
RELATED_OPINIONS = "Opinions relating to orders"
CIRCUIT_ORDERS = "Orders by circuit"
COURT_OPINIONS = "Opinions of the Court"
CIRCUIT_DOCUMENT = "Orders by Circuit"
ORDER_LIST = "Order List"
# Scope ASCII mode to digits, preserving Unicode boundaries and source whitespace.
INDEX_DATE = re.compile(r"\b(?a:\d{1,2}/\d{1,2}/\d{2})\b")
DOCKET = re.compile(r"\b(?a:\d{2})(?:A\s*(?a:\d+)|[-–]\s*(?a:\d+))\b")


def source_indexes(term):
    short = str(term)[-2:]
    return [
        (COURT_ORDERS, f"{BASE}/orders/ordersofthecourt/{short}"),
        (RELATED_OPINIONS, f"{BASE}/opinions/relatingtoorders/{short}"),
        (CIRCUIT_ORDERS, f"{BASE}/orders/ordersbycircuit/{short}"),
        (COURT_OPINIONS, f"{BASE}/opinions/slipopinion/{short}"),
    ]


def index_date(text):
    match = INDEX_DATE.search(text)
    return datetime.strptime(match[0], "%m/%d/%y").date().isoformat() if match else None


def order_entries(soup, index_url):
    entries = []
    for anchor in soup.select("a[href]"):
        url = urljoin(index_url, anchor["href"])
        path = urlsplit(url).path.lower()
        is_order_pdf = path.startswith("/orders/courtorders/") and path.endswith(".pdf")
        if not is_order_pdf and not path.startswith(
            "/orders/ordersbycircuit/ordercasebycircuit/"
        ):
            continue
        official_url(url)
        parent = anchor.parent
        date = None
        while parent is not None and date is None:
            date = index_date(parent.get_text(" ", strip=True))
            parent = parent.parent
        if date is None:
            raise ValueError("Missing publication date: " + url)
        entries.append(
            {
                "sourceUrl": url,
                "date": date,
                "kind": normalize(anchor.get_text(" ", strip=True)),
                "sourceIndex": index_url,
            }
        )
    return entries


def opinion_entries(soup, index_url, kind):
    entries = []
    for row in soup.select("tr"):
        text = normalize(row.get_text(" ", strip=True))
        date = index_date(text)
        if date is None:
            continue
        links = [
            anchor
            for anchor in row.select("a[href]")
            if re.search(r"/opinions/(?a:\d+)pdf/", anchor["href"], re.IGNORECASE)
            and urlsplit(anchor["href"]).path.lower().endswith(".pdf")
        ]
        if not links:
            continue
        dockets = DOCKET.findall(text)
        if kind == COURT_OPINIONS and not any("A" in docket for docket in dockets):
            continue
        url = official_url(urljoin(index_url, links[0]["href"]))
        revision = (
            official_url(urljoin(index_url, links[-1]["href"]))
            if len(links) > 1
            else None
        )
        entries.append(
            {
                "sourceUrl": url,
                "revisionSourceUrl": revision,
                "date": date,
                "kind": "Opinion on an application"
                if kind == COURT_OPINIONS
                else "Opinion relating to an order",
                "name": normalize(links[0].get_text(" ", strip=True)),
                "dockets": dockets,
                "sourceIndex": index_url,
            }
        )
    return entries


def inventory(cache, term):
    entries = {}
    sources = []
    for kind, url in source_indexes(term):
        soup = BeautifulSoup(fetch(cache, url), "html.parser")
        if kind in (COURT_ORDERS, CIRCUIT_ORDERS):
            found = order_entries(soup, url)
        else:
            found = opinion_entries(soup, url, kind)
        entries.update({entry["sourceUrl"]: entry for entry in found})
        sources.append({"url": url, "kind": kind, "documents": len(found)})
    return list(entries.values()), sources


def extract_order(entry, *, cache, term, dist):
    raw = fetch(cache, entry["sourceUrl"])
    reader = PdfReader(io.BytesIO(raw))
    document_id = (
        "court-order-" + hashlib.sha1(entry["sourceUrl"].encode()).hexdigest()[:16]
    )
    pages = [
        {
            "number": number + 1,
            "label": str(reader.page_labels[number]),
            "text": (page.extract_text() or "").replace("\x00", "").strip(),
        }
        for number, page in enumerate(reader.pages)
    ]
    if not any(page["text"] for page in pages):
        raise ValueError("No readable text: " + entry["sourceUrl"])
    text = "\n".join(page["text"] for page in pages)
    # Preserve the established ordering while normalizing extracted whitespace.
    dockets = [
        "".join(docket.split())
        for docket in sorted({d.replace("–", "-") for d in DOCKET.findall(text)})
    ]
    title = entry.get("name") or entry["kind"]
    pdf_path = "data/pdfs/" + document_id + ".pdf"
    text_path = "data/current-docs/" + document_id + JSON_SUFFIX
    output_path(dist, pdf_path).write_bytes(raw)
    write_json(
        output_path(dist, text_path),
        {
            "id": document_id,
            "title": title,
            "sourceUrl": entry["sourceUrl"],
            "pages": pages,
        },
    )
    return {
        **entry,
        "id": document_id,
        "term": term,
        "title": title,
        "caseId": "orders-" + str(term),
        "category": "Other",
        "type": "Order",
        "dockets": dockets,
        "pdfPath": pdf_path,
        "textPath": text_path,
        "pageCount": len(pages),
        "characterCount": len(text),
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "searchText": normalize(text),
        "extractionStatus": "Extracted",
    }


def import_orders(cache, term, *, dist=DIST):
    entries, sources = inventory(cache, term)
    circuits = {
        entry["date"]: entry["sourceUrl"]
        for entry in entries
        if entry["kind"] == CIRCUIT_DOCUMENT
    }
    extractor = partial(extract_order, cache=cache, term=term, dist=dist)
    with ThreadPoolExecutor(max_workers=4) as pool:
        documents = list(
            pool.map(
                extractor,
                (entry for entry in entries if entry["kind"] != CIRCUIT_DOCUMENT),
            )
        )
    if not documents:
        raise ValueError(
            "No order documents found; refusing to replace the existing inventory"
        )
    for document in documents:
        if document["kind"] == ORDER_LIST and document["date"] in circuits:
            document["circuitSourceUrl"] = circuits[document["date"]]
    result = {
        "schema": 1,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "terms": [term],
        "sources": sources,
        "documents": sorted(
            documents,
            key=lambda document: (document["date"], document["id"]),
            reverse=True,
        ),
    }
    write_json(output_path(dist, "data/court-orders" + JSON_SUFFIX), result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--term", type=int, default=2026, choices=range(2000, 2100), metavar="YEAR"
    )
    add_cache_argument(parser)
    args = parser.parse_args()
    result = import_orders(PrivateCache(args.cache), args.term)
    print(
        f"Imported {len(result['documents'])} order documents from {len(result['sources'])} indexes."
    )


if __name__ == "__main__":
    main()
