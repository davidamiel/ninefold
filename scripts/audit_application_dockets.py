"""Discover application dockets within explicit bounded ranges; retain failures.

Run before reconcile_emergency_applications.py, using the same --cache name.
Choose a new name for a fresh audit; existing snapshots resume successful reads.
"""

import argparse
import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from functools import partial

from application_parsing import parse_docket, substantive_application
from order_import_support import (
    BASE,
    PrivateCache,
    add_cache_argument,
    application_id,
    download,
)

SCAN_RANGES = ("26A1–26A750", "25A1–25A1650")


def docket_url(docket_id):
    return f"{BASE}/search.aspx?filename=/docket/docketfiles/html/public/{application_id(docket_id).lower()}.html"


def scan_row(docket_id, content):
    try:
        _, _, proceedings = parse_docket(content)
    except ValueError as error:
        return {"id": docket_id, "status": "unrecognized", "error": str(error)}
    # Keep the audit's established date representation, independently of reader metadata.
    events = [
        {
            "date": date.fromisoformat(item["date"]).strftime("%b %d %Y"),
            "description": item["description"],
        }
        for item in proceedings
    ]
    substantive = any(
        substantive_application(item["description"]) for item in proceedings
    )
    return {
        "id": docket_id,
        "status": "found",
        "substantive": substantive,
        "first": events[0],
        "last": events[-1],
        "proceedings": events if substantive else [],
    }


def scan_docket(docket_id, *, cache):
    docket_id = application_id(docket_id)
    key = "docket-" + docket_id + ".json"
    saved = cache.read(key)
    snapshot = json.loads(saved) if saved is not None else None
    if snapshot is None or snapshot.get("status") not in ("200", "404"):
        time.sleep(0.15)
        try:
            content, status = download(docket_url(docket_id), timeout=25)
        except (subprocess.SubprocessError, OSError) as error:
            return {"id": docket_id, "status": "error", "error": str(error)}
        snapshot = {"status": status, "html": content.decode("utf-8", errors="replace")}
        cache.write_json(key, snapshot)
    status = snapshot["status"]
    if status == "404":
        return {"id": docket_id, "status": "not-found"}
    if status != "200":
        return {"id": docket_id, "status": "error", "http": status}
    return scan_row(docket_id, snapshot["html"])


def audit(cache):
    identifiers = [f"26A{number}" for number in range(1, 751)] + [
        f"25A{number}" for number in range(1, 1651)
    ]
    results = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [
            pool.submit(partial(scan_docket, cache=cache), docket_id)
            for docket_id in identifiers
        ]
        for future in as_completed(futures):
            results.append(future.result())
            if len(results) % 100 == 0:
                cache.write_json("scan.json", results)
                print(f"Scanned {len(results)} dockets", flush=True)
    cache.write_json("scan.json", results)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    add_cache_argument(parser)
    args = parser.parse_args()
    results = audit(PrivateCache(args.cache))
    print(f"Finished: {len(results)} dockets checked.")


if __name__ == "__main__":
    main()
