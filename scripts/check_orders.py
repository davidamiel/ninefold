"""Check publication inventory integrity and application-status edge cases."""

import hashlib
import json
from pathlib import Path

from application_status import final_state

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist/data"
APPLICATION_DENIED = "Application Denied"


def events(*texts):
    return [
        {"date": f"2026-11-{index + 1:02}", "description": text}
        for index, text in enumerate(texts)
    ]


def check_statuses():
    assert (
        final_state(
            events(
                "Application (26A1) for a stay, submitted to Justice Kagan.",
                "Application (26A1) denied by Justice Kagan.",
                "Application (26A1) refiled and submitted to Justice Alito.",
            )
        )[0]
        == "Pending"
    )
    assert (
        final_state(
            events(
                "Application (26A1) for a stay, submitted to Justice Kagan.",
                "An administrative stay is granted pending further order of the Court.",
            )
        )[0]
        == "Pending"
    )
    for description in (
        "The motion to file an appendix under seal is granted. Application (26A1) denied by Justice Kagan.",
        "Order entered by Justice Thomas: Upon consideration of the application, it is ordered that the application for stay is DENIED.",
    ):
        assert final_state(events(description))[1] == APPLICATION_DENIED
    assert (
        final_state(
            events(
                "The lower court denied a stay. The application for stay presented to Justice Kagan and by her referred to the Court is granted.",
            )
        )[1]
        == "Application Granted"
    )


def check_inventory():
    orders = json.loads((DATA / "court-orders.json").read_text())
    documents = orders["documents"]
    assert len({document["sourceUrl"] for document in documents}) == len(documents)
    for document in documents:
        raw = (ROOT / "dist" / document["pdfPath"]).read_bytes()
        assert raw.startswith(b"%PDF-")
        assert hashlib.sha256(raw).hexdigest() == document["sourceSha256"]
        pages = json.loads((ROOT / "dist" / document["textPath"]).read_text())["pages"]
        assert len(pages) == document["pageCount"]
        assert any(page["text"].strip() for page in pages)
    for source in orders["sources"]:
        if source["kind"] == "Orders by circuit":
            assert source["documents"] == sum(
                bool(document.get("circuitSourceUrl")) for document in documents
            )
        else:
            assert source["documents"] == sum(
                document["sourceIndex"] == source["url"] for document in documents
            )


def check_current_cases():
    current = json.loads((DATA / "current-term.json").read_text())
    cases = {case["id"]: case for case in current["cases"]}
    assert len(cases) == len(current["cases"])
    assert cases["26A661"]["result"] == APPLICATION_DENIED
    assert cases["26A508"]["status"] == "Pending"
    assert cases["26A532"]["status"] == "Pending"


def main():
    check_statuses()
    check_inventory()
    check_current_cases()
    print(
        "Order inventory, source counts, original PDF hashes, reader payloads, and application status cases passed."
    )


if __name__ == "__main__":
    main()
