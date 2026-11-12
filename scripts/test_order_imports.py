"""Boundary and source-parsing regressions; no live network or production writes."""

import argparse
import importlib
import json
import os
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from application_parsing import (
    application_title,
    case_name,
    filing_title,
    parse_docket,
    substantive_application,
)
from application_status import disposition, final_state
from audit_application_dockets import scan_docket, scan_row
from bs4 import BeautifulSoup
from import_court_orders import COURT_OPINIONS, DOCKET, INDEX_DATE, opinion_entries
from order_import_support import (
    BASE,
    ROOT,
    PrivateCache,
    application_id,
    fetch,
    output_path,
)
from reconcile_emergency_applications import Reconciliation, supplement_proceedings

APPLICATION_DENIED = "Application Denied"
DENIED_PROCEEDING = "Application (26A1) denied by Justice Kagan."
PENDING_PROCEEDING = "Application (26A1) refiled and submitted to Justice Alito."
DOCKET_TITLE = "Example, Applicant v. Respondent"


def docket_html(description=DENIED_PROCEEDING):
    return (
        f'<table id="docketinfo"><tr><td>Title:</td><td>{DOCKET_TITLE}</td></tr></table>'
        '<table class="ProceedingItem"><tr><td>Nov 12 2026</td>'
        f'<td>{description}<div class="documentlinks"><a href="/example.pdf">Application</a>'
        "</div></td></tr></table>"
    )


class MemoryCache:
    def __init__(self):
        self.values = {}

    def read(self, key):
        return self.values.get(key)

    def write(self, key, value):
        self.values[key] = value

    def write_json(self, key, value):
        self.write(key, json.dumps(value).encode())


class FilesystemTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        self.cache = PrivateCache(root=self.root)

    def test_docket_ids_cannot_be_paths(self):
        for value in (
            "../26A1",
            "/tmp/26A1",
            "26A1/../../x",
            "26A1\\x",
            "26A1\n",
            "26A0",
            "２６A1",
            "26A1٢",
            None,
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                application_id(value)
        self.assertEqual(application_id("26A661"), "26A661")

    def test_cli_cache_is_a_name_not_an_arbitrary_path(self):
        for name in ("../escape", "/tmp/cache", "a/b", "a\\b", ".", ""):
            with self.subTest(name=name), self.assertRaises(argparse.ArgumentTypeError):
                PrivateCache(name, root=self.root)
        self.assertFalse((self.root / "escape").exists())

    def test_cache_rejects_shared_and_symlink_directories(self):
        shared = self.root / "scripts/cache/shared"
        shared.mkdir(mode=0o755)
        with self.assertRaises(ValueError):
            PrivateCache("shared", root=self.root)
        linked = self.root / "scripts/cache/linked"
        linked.symlink_to(self.cache.path, target_is_directory=True)
        with self.assertRaises(ValueError):
            PrivateCache("linked", root=self.root)
        with patch("order_import_support.os.getuid", return_value=os.getuid() + 1):
            with self.assertRaises(ValueError):
                PrivateCache(root=self.root)

    def test_cache_files_are_private_and_writes_replace_whole_contents(self):
        self.cache.write("scan.json", b"old")
        self.cache.write("scan.json", b"new")
        self.assertEqual(self.cache.read("scan.json"), b"new")
        self.assertEqual((self.cache.path / "scan.json").stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.cache.path.stat().st_mode & 0o777, 0o700)
        self.assertEqual(list(self.cache.path.glob(".pending-*")), [])
        self.assertIsNone(self.cache.read("missing.json"))

    def test_cache_refuses_symlink_reads_and_does_not_write_through_links(self):
        outside = self.root / "outside"
        outside.write_bytes(b"unchanged")
        (self.cache.path / "linked.json").symlink_to(outside)
        with self.assertRaises(OSError):
            self.cache.read("linked.json")
        self.cache.write("linked.json", b"cache only")
        self.assertEqual(outside.read_bytes(), b"unchanged")
        self.assertEqual(self.cache.read("linked.json"), b"cache only")

    def test_cache_rejects_hardlinks_shared_files_and_nonregular_files(self):
        self.cache.write("source.json", b"value")
        os.link(self.cache.path / "source.json", self.cache.path / "hardlink.json")
        with self.assertRaises(ValueError):
            self.cache.read("hardlink.json")
        shared = self.cache.path / "shared.json"
        shared.write_bytes(b"value")
        shared.chmod(0o644)
        with self.assertRaises(ValueError):
            self.cache.read("shared.json")
        os.mkfifo(self.cache.path / "pipe.json", 0o600)
        with self.assertRaises(ValueError):
            self.cache.read("pipe.json")

    def test_paths_are_contained_even_when_the_destination_is_a_link(self):
        for value in ("../escape", "/absolute", "data/../../escape"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                output_path(self.root, value)
        (self.root / "linked").symlink_to(self.cache.path, target_is_directory=True)
        with self.assertRaises(ValueError):
            output_path(self.root, "linked/file.json")
        self.assertEqual(output_path(self.root, "safe.json"), self.root / "safe.json")
        with self.assertRaises(ValueError):
            self.cache.read("../outside")

    def test_interrupted_downloads_are_not_cached(self):
        url = BASE + "/orders/example.pdf"
        with patch(
            "order_import_support.download",
            side_effect=subprocess.TimeoutExpired("curl", 1),
        ):
            with self.assertRaises(subprocess.TimeoutExpired):
                fetch(self.cache, url)
        self.assertEqual(list(self.cache.path.iterdir()), [])
        with patch(
            "order_import_support.download", return_value=(b"%PDF-valid", "200")
        ) as request:
            self.assertEqual(fetch(self.cache, url), b"%PDF-valid")
            self.assertEqual(fetch(self.cache, url), b"%PDF-valid")
            request.assert_called_once()

    def test_error_pages_do_not_become_pdf_cache_entries(self):
        for content, status in (
            (b"Access denied", "403"),
            (b"<html>Error</html>", "200"),
        ):
            with patch("order_import_support.download", return_value=(content, status)):
                with self.assertRaises(ValueError):
                    fetch(self.cache, BASE + "/orders/example.pdf")
        self.assertEqual(list(self.cache.path.iterdir()), [])
        with patch("order_import_support.download") as request:
            with self.assertRaises(ValueError):
                fetch(self.cache, "https://example.com/file.pdf")
            request.assert_not_called()


class ParsingTests(unittest.TestCase):
    def test_digit_shorthand_preserves_ascii_ids_and_unicode_boundaries(self):
        self.assertEqual(INDEX_DATE.findall("11/12/26"), ["11/12/26"])
        self.assertEqual(INDEX_DATE.findall("１１/１２/２６"), [])
        self.assertEqual(INDEX_DATE.findall("é11/12/26é"), [])
        self.assertEqual(DOCKET.findall("26A661 25–1098"), ["26A661", "25–1098"])
        self.assertEqual(DOCKET.findall("２６A661 26A٦٦١ é26A661é"), [])
        self.assertEqual(DOCKET.findall("26A\u00a0661"), ["26A\u00a0661"])

    def test_missing_title_and_malformed_proceedings_are_explicit(self):
        _, title, proceedings = parse_docket(
            docket_html().replace(
                f'<table id="docketinfo"><tr><td>Title:</td><td>{DOCKET_TITLE}</td></tr></table>',
                "",
            )
        )
        self.assertIsNone(title)
        self.assertEqual(proceedings[0]["description"], DENIED_PROCEEDING)
        for html in (
            "<html>Error</html>",
            '<table class="ProceedingItem"><tr><td>Only one cell</td></tr></table>',
            docket_html().replace("Nov 12 2026", "Unknown"),
            docket_html(""),
        ):
            with self.subTest(html=html), self.assertRaises(ValueError):
                parse_docket(html)
        self.assertEqual(
            scan_row("26A1", "<html>Error</html>")["status"], "unrecognized"
        )

    def test_caption_fallback_and_document_links(self):
        html = docket_html().replace('<table id="docketinfo">', "<table>")
        _, caption, proceedings = parse_docket(
            '<h1 class="title">Fallback caption</h1>' + html
        )
        self.assertEqual(caption, "Fallback caption")
        self.assertEqual(
            proceedings[0]["links"],
            [{"label": "Application", "url": BASE + "/example.pdf"}],
        )
        self.assertEqual(proceedings[0]["date"], "2026-11-12")

    def test_plain_text_classification_and_titles(self):
        self.assertTrue(
            substantive_application(
                "Application for a stay, submitted to Justice Kagan."
            )
        )
        self.assertFalse(
            substantive_application("Application to extend the time to seek a stay.")
        )
        self.assertFalse(
            substantive_application(
                "Application for an extension of time relating to an injunction."
            )
        )
        self.assertFalse(
            substantive_application("A stay was entered in the lower court.")
        )
        self.assertEqual(case_name(DOCKET_TITLE), "Example v.")
        self.assertEqual(
            case_name("Alice, Applicant v. Bob, Respondent"), "Alice v. Bob"
        )
        self.assertEqual(filing_title("Reply   filed."), "Reply")
        self.assertEqual(
            application_title(
                "Application (26A1) for a stay, submitted to Justice Kagan."
            ),
            "Application for a stay",
        )

    def test_long_adversarial_text_has_no_ambiguous_whitespace_matching(self):
        whitespace = " " * 100000
        self.assertEqual(filing_title("Reply" + whitespace + "filed."), "Reply")
        self.assertEqual(
            case_name("Alice," + whitespace + "Applicant v. Bob"), "Alice v. Bob"
        )
        self.assertEqual(
            application_title(
                "Application" + whitespace + "for a stay, submitted to Justice Kagan."
            ),
            "Application for a stay",
        )
        self.assertFalse(substantive_application("application extension " * 10000))

    def test_status_qualifiers_and_renewal(self):
        examples = {
            "The application is denied as moot.": "Application Denied as Moot",
            "The application is granted in part.": "Application Granted in Part",
            "The application is dismissed.": "Application Dismissed",
            "The application is withdrawn.": "Application Withdrawn",
            "The application for an administrative stay is granted.": None,
        }
        for text, expected in examples.items():
            with self.subTest(text=text):
                self.assertEqual(disposition(text), expected)
        events = [
            {"date": "2026-11-11", "description": DENIED_PROCEEDING},
            {"date": "2026-11-12", "description": PENDING_PROCEEDING},
        ]
        self.assertEqual(final_state(events), ("Pending", None, None))

    def test_published_order_can_supplement_a_delayed_docket(self):
        proceedings = [{"date": "2026-11-10", "description": "Reply filed."}]
        orders = [
            {
                "dockets": ["26A1"],
                "kind": "Miscellaneous Order",
                "date": "2026-11-12",
                "searchText": "HEADER The application is denied.",
                "sourceUrl": BASE + "/orders/example.pdf",
            }
        ]
        supplement_proceedings("26A1", proceedings, orders)
        supplement_proceedings("26A1", proceedings, orders)
        self.assertEqual(len(proceedings), 2)
        self.assertEqual(
            final_state(proceedings), ("Decided", APPLICATION_DENIED, "2026-11-12")
        )

    def test_revision_link_does_not_replace_the_complete_opinion(self):
        html = '<table><tr><td>11/09/26</td><td>26A560</td><td><a href="/opinions/26pdf/full.pdf">Case</a><a href="/opinions/26pdf/changes.pdf">Revision</a></td></tr></table>'
        entries = opinion_entries(
            BeautifulSoup(html, "html.parser"),
            BASE + "/opinions/slipopinion/26",
            COURT_OPINIONS,
        )
        self.assertEqual(entries[0]["sourceUrl"], BASE + "/opinions/26pdf/full.pdf")
        self.assertEqual(
            entries[0]["revisionSourceUrl"], BASE + "/opinions/26pdf/changes.pdf"
        )

    def test_all_audited_statuses_remain_consistent(self):
        audit = json.loads((ROOT / "dist/data/orders-coverage.json").read_text())
        current = json.loads((ROOT / "dist/data/current-term.json").read_text())
        historical = json.loads((ROOT / "dist/data/catalog.json").read_text())
        cases = {case["id"]: case for case in historical["cases"] + current["cases"]}
        for record in audit["included"]:
            case = cases[record["id"]]
            with self.subTest(docket=record["id"]):
                actual = final_state(case["proceedings"])
                self.assertEqual(actual[0], record["status"])
                expected = case.get("priorTermOrders", {}).get(str(audit["term"]), case)
                self.assertEqual(actual[1:], (expected["result"], expected["decided"]))


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.dist = Path(self.temporary.name)
        data = self.dist / "data"
        data.mkdir()
        self.original = {
            "id": "26A1",
            "docket": "26A1",
            "documents": [],
            "status": "Decided",
            "result": APPLICATION_DENIED,
        }
        for name, value in (
            ("current-term", {"cases": [self.original]}),
            ("catalog", {"cases": []}),
            ("court-orders", {"documents": []}),
        ):
            (data / (name + ".json")).write_text(json.dumps(value))
        self.cache = MemoryCache()
        self.reconciliation = Reconciliation(self.cache, dist=self.dist)

    def test_invalid_scan_id_is_rejected_before_cache_access(self):
        with patch.object(self.cache, "read") as read:
            with self.assertRaises(ValueError):
                self.reconciliation.prepare(
                    [{"id": "../../../escape", "status": "found", "substantive": True}]
                )
            read.assert_not_called()

    def test_malformed_source_preserves_prior_record_and_records_a_gap(self):
        self.cache.write_json(
            "docket-26A1.json", {"status": "200", "html": "<html>Error page</html>"}
        )
        self.reconciliation.prepare(
            [{"id": "26A1", "status": "found", "substantive": True}]
        )
        self.assertEqual(self.reconciliation.current["26A1"], self.original)
        self.assertEqual(self.reconciliation.parse_failures[0]["id"], "26A1")
        self.assertEqual(self.reconciliation.jobs, [])

    def test_docket_cache_holds_status_and_body_together(self):
        with patch(
            "audit_application_dockets.download",
            return_value=(docket_html().encode(), "200"),
        ) as request:
            result = scan_docket("26A1", cache=self.cache)
            self.assertEqual(scan_docket("26A1", cache=self.cache), result)
            request.assert_called_once()
        self.assertEqual(result["status"], "found")
        self.assertEqual(self.cache.values.keys(), {"docket-26A1.json"})
        self.assertEqual(
            date.fromisoformat("2026-11-12").strftime("%b %d %Y"),
            result["first"]["date"],
        )

    def test_importing_commands_does_not_start_network_or_file_work(self):
        with (
            patch("subprocess.run") as run,
            patch("order_import_support.PrivateCache.__init__") as cache,
        ):
            for name in (
                "audit_application_dockets",
                "import_court_orders",
                "reconcile_emergency_applications",
                "check_orders",
            ):
                importlib.reload(importlib.import_module(name))
            run.assert_not_called()
            cache.assert_not_called()


if __name__ == "__main__":
    unittest.main()
