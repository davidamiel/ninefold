"""Check each public case material against the actual released reader payload."""
from collections import Counter
from functools import lru_cache
import gzip
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
