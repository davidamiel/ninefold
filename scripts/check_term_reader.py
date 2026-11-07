"""Check each public case material against the actual released reader payload."""
from collections import Counter
from functools import lru_cache
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1] / (sys.argv[1] if len(sys.argv) > 1 else "dist")
DATA = ROOT / "data"


def read(name):
    path = DATA / (name + ".json")
    raw = path.read_bytes() if path.exists() else gzip.decompress(path.with_suffix(".json.gz").read_bytes())
    return json.loads(raw)


@lru_cache(maxsize=64)
def lengths(path):
    file = ROOT / path
    raw = file.read_bytes() if file.exists() else gzip.decompress(file.with_suffix(".json.gz").read_bytes())
    return tuple(len(p["text"].strip()) for p in json.loads(raw)["pages"])


def check(doc, docs):
    path = doc.get("textPath")
    if not path:
        # Scanned filings remain faithful PDF-only readers, not invented OCR text.
        # Require a bundled, previously parsed/visually verified original and its
        # recorded checksum so an HTML error page or changed source cannot pass.
        if doc.get("scanOnly") and doc.get("pdfPath") and doc.get("sourceSha256"):
            pdf = ROOT / doc["pdfPath"]
            raw = pdf.read_bytes()
            if (not raw.startswith(b"%PDF-") or b"%%EOF" not in raw[-2048:]
                    or hashlib.sha256(raw).hexdigest() != doc["sourceSha256"]
                    or not isinstance(doc.get("pageCount"), int)
                    or doc["pageCount"] < 1):
                raise ValueError("Invalid or changed bundled scan-only PDF")
            return doc["pdfPath"]
        raise ValueError("Missing reader text")
    pages = lengths(path)
    if not any(pages):
        raise ValueError("Empty reader text")
    if doc.get("sourceRange"):
        r = doc["sourceRange"]
        start, end = r["startPage"], r["endPage"] + bool(r["endOffset"])
        if not (0 <= start < end <= len(pages) and sum(pages[start:end]) > 0):
            raise ValueError(f"Empty or invalid source range {start}..{end}")
        if doc.get("parentDocumentId") not in docs:
            raise ValueError("Missing source document")
    return path


index = read("current-text-index")
supplements = read("record-supplement")
sections = {**read("opinion-sections"), **read("opinion-section-overrides")}
errors = []
for file in ("current-term", "catalog"):
    counts = Counter()
    for case in read(file)["cases"]:
        collection = "emergency" if "A" in case["docket"] else "merits"
        counts[collection + " dockets"] += 1
        base = {d["id"]: {**d, **index.get(d["id"], {})} for d in case["documents"]}
        for d in supplements.get(case["id"], []):
            base[d["id"]] = {**base.get(d["id"], {}), **d}
        for d in sections.get(case["id"], []):
            base[d["id"]] = d
        replaced = {d["parentDocumentId"] for d in sections.get(case["id"], []) if d.get("parentDocumentId")}
        for key, doc in base.items():
            if doc.get("filedFor", case["id"]) != case["id"]:
                continue
            if key in replaced or doc.get("category") == "Other" or doc.get("title", "").lower().strip(". ") == "questions presented":
                continue
            if doc.get("auxiliary") and doc["category"] != "Lower courts":
                continue
            try:
                check(doc, base)
                counts[collection + " reader materials"] += 1
            except (OSError, KeyError, ValueError) as exc:
                errors.append((case["id"], key, str(exc)))
    print(file, dict(counts))
opinions = read("cited-opinions")
for reference in opinions.values():
    check(reference, {})
print("Verified full precedent readers:", len(opinions))
for entry in errors:
    print(*entry, sep=" | ")
if errors:
    raise SystemExit(1)
