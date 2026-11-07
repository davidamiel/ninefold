"""Import frequently cited federal appellate opinions from Harvard's Caselaw Access Project."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import subprocess

DATA = Path(__file__).resolve().parents[1] / "dist" / "data"
REPORTER = re.compile(r"\b(\d{1,3})\s+F\s*\.\s*(2d|3d)\s+(\d{1,4})\b", re.I)


def read(path):
    return json.loads(path.read_bytes())


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


US_REPORTS = re.compile(r"\b(\d{1,3})\s+U\.?\s*S\.?\s+(\d{1,4})\b")


def citing_documents(term, family):
    counts = Counter()
    catalog = read(DATA / ("current-term.json" if term == "2026" else "catalog.json"))
    text_index = read(DATA / "current-text-index.json")
    seen = set()
    for case in catalog["cases"]:
        for doc in case["documents"]:
            if doc.get("category") not in {"Merits", "Certiorari", "Amicus", "Decision"}:
                continue
            path = text_index.get(doc["id"], {}).get("textPath") or doc.get("textPath")
            if not path or path in seen:
                continue
            seen.add(path)
            mentions = set()
            for page in read(DATA.parent / path)["pages"]:
                if family == "us":
                    mentions.update((v, "us", p) for v, p in US_REPORTS.findall(page["text"]))
                else:
                    mentions.update((v, rep.lower(), p) for v, rep, p in REPORTER.findall(page["text"]))
            counts.update(mentions)
    return sorted(counts, key=lambda cite: (-counts[cite], cite))


def official_citation(cite):
    volume, reporter, first = cite
    series = "U.S." if reporter == "us" else "F." + reporter
    return f"{volume} {series} {first}"


def import_case(cite, cache):
    volume, reporter, first = cite
    citation = official_citation(cite)
    series = "us" if reporter == "us" else "f" + reporter
    slug = f"{series}-{volume}-{first}"
    path = cache / (slug + ".json")
    base = f"https://static.case.law/{series}/{volume}"
    filename = f"{int(first):04d}-01"
    if not path.exists():
        response = subprocess.run(["curl", "--silent", "--show-error", "--fail", "--retry", "2",
                                   "--max-time", "30", f"{base}/cases/{filename}.json"], capture_output=True)
        if response.returncode:
            return None
        path.write_bytes(response.stdout)
    case = read(path)
    if citation not in [item["cite"] for item in case["citations"]]:
        return None
    opinions = [op for op in case["casebody"]["opinions"] if op.get("text", "").strip()]
    if not opinions:
        return None
    majority = next((op for op in opinions if op["type"] == "majority"), opinions[0])
    # Use an intact paragraph from the published opinion, explicitly labelled as an excerpt.
    paragraphs = [s.strip() for s in majority["text"].splitlines()]
    lead = next((s for s in paragraphs if len(s) >= 110 and len(s.split()) >= 18), "")
    if not lead:
        return None
    excerpt = lead if len(lead) <= 850 else lead[:850].rsplit(" ", 1)[0] + "…"
    url = f"{base}/html/{filename}.html"
    pages = [{"label": op["type"].capitalize() + " opinion", "number": i + 1,
              "text": "\n\n".join(line.strip() for line in op["text"].splitlines() if line.strip())}
             for i, op in enumerate(opinions)]
    name = case["name_abbreviation"]
    target = "data/docs/cap-" + slug + ".json"
    write(DATA.parent / target, {"title": name, "sourceUrl": url, "pages": pages})
    return citation, {"kind": "case", "name": name, "citation": citation, "year": case["decision_date"][:4],
                      "court": case["court"]["name_abbreviation"], "sourceUrl": url,
                      "source": "Harvard Law School, Caselaw Access Project", "textPath": target,
                      "excerpt": excerpt, "excerptLabel": "From the opinion"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("term", choices=["2026", "2025"])
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=250)
    parser.add_argument("--reporter", choices=["appeals", "us"], default="appeals")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    output = DATA / "cited-opinions.json"
    records = read(output) if output.exists() else {}
    requested = citing_documents(args.term, args.reporter)[:args.limit]
    missing = [c for c in requested if official_citation(c) not in records]
    with ThreadPoolExecutor(max_workers=3) as pool:
        for item in pool.map(lambda cite: import_case(cite, args.cache), missing):
            if item:
                records[item[0]] = item[1]
    write(output, dict(sorted(records.items())))
    print(f"OT{args.term}: {len(requested)} ranked citations checked; {len(records)} verified opinions in collection.")
