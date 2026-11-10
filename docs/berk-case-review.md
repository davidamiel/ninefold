# Berk v. Choy case review — November 10, 2026

Status: **partial; not a completed visual or citation-target review**.

The machine-readable [case ledger](../reviews/berk-case-review.json) inventories all 70 indexed documents, including 24 extracted documents (1,124 pages), 46 original-only PDFs (94 pages), and three opinion section aliases. All original-only source URLs were reachable. Twenty-three extracted documents match their complete official PDF text layers under the documented normalization. The opposition has casing/ordering differences and remains an explicit exception. Source text layers are not visual proof, and normalization deliberately ignores whitespace/hyphenation.

## Confirmed corrections

- Transcript: 68 printed page labels corrected from 1 to 2–69, matching both stored headers and official PDF headers. Raw page text is unchanged.
- Eleven headings relocated from ordinary prose, summaries, or appendix contents to actual source headings; corrected split words in six heading labels and included two omitted closing quotation marks in heading spans.
- Case overview question text: source-confirmed word-spacing repairs.
- Joint appendix title: removed stray statement-of-costs wording.
- Original slip opinion: replaced truncated generated title; restored the linked word “opinion” omitted from the January 20 docket description.

The prior [opinion glyph repair](berk-opinion-glyph-review.md) remains a separate bounded repair. This review also compared all 827 source text lines of the 28-page preliminary print, but does not convert that into visual certification.

## Verification and publishing

A dedicated Berk regression test checks heading locations and transcript labels. A Chromium smoke script opens the case reader documents and records DOM evidence; it is a smoke test, not line-by-line visual source comparison. The publish workflow temporarily listened only for changes to the case ledger on main to build, test and deploy the authorized fixes through GitHub Actions. Its exact original manual-only blob (`4fc4bea158bd1352a67e3dd777ef2fbe7c4a2e92`) was restored and verified. Workflow results and artifacts are the evidence of execution; the presence of test code is not a passing result.

## Remaining work

All full citation-target reviews and full visual/layout reviews remain open. The opposition cover/counsel casing, appendix spacing, footnotes and link destinations need further review. Sixteen original-only PDFs expose zero text; one has garbled text; these facts do not establish that they are scan-only. No entries were fabricated in the global review ledger, whose source-byte hashes and current audit fingerprints could not be computed here. The case ledger tracks bounded work without upgrading those global statuses.

## Recorded execution

[Publish run 42749401641](https://github.com/davidamiel/ninefold/actions/runs/42749401641) succeeded for commit `bfd9e6ab0acbe5601b8376d3701e47dfe66f39d8`: automated tests, source and packaged audits, build, term reader checks, Chromium smoke across 27 document/section IDs, and Pages deployment. Live-site reader and structural citation checks run separately; their workflow artifacts report actual results. Publication remains manual-only after restoring its trigger. Full source visual and semantic citation reviews remain incomplete.

## Named short-form reference correction

The production structural scan found named short forms that fell back to lookup. Full citations containing the standalone ampersand in “Sibbach v. Wilson & Co.” and spaced initials in “Shady Grove Orthopedic Associates, P . A.” were missing/truncated in the bibliography index. The parser now recognizes those name tokens without changing citation source ranges. Named short forms still require a unique matching full citation in the same document; unnamed or ambiguous forms remain unresolved. The official preliminary print supplies the full citations on PDF pages 2–3 and repeats them on pages 7 and 13. Positive, negative and source-range regressions cover the correction. This does not certify other citation targets or pinpoint accuracy.

The resolver update passed 298 tests, build/audits and the 27-document Chromium check in [run 42751020918](https://github.com/davidamiel/ninefold/actions/runs/42751020918), commit `ddcb43f0d6e5712e0befcdb6961e8c94eb3c41b2`. Built-reader lookup-required occurrences fell from 544 to 514. Counts include opinion aliases; they are not counts of unique authorities. External-source-only links are recorded separately and are not claims of local full text or semantic verification. **The parser correction is committed and tested, but is not verified live.** Both the initial Pages deployment and its single retry timed out after 600 seconds; the retry canceled deployment at 04:04:27 UTC. The earlier document corrections remain successfully published and production-verified. [Production check 42752847569](https://github.com/davidamiel/ninefold/actions/runs/42752847569) completed the document and structural scans but failed the explicit named-short-form assertion. No further publish retries were made. After Pages recovers, run the restored manual Publish Ninefold workflow and then the deployed reader check.

## Production reference queue

The [reference queue](../reviews/berk-reference-queue.json) records every observed production reference without an internal document target, including document, page, source offset, label and any external source URL. The live scan found 771 occurrences: 227 external-source-only and 544 requiring lookup (719 distinct source locations after removing opinion-alias duplication). These are triage records, not findings that each citation is wrong. All 130 referenced internal documents loaded and 221 located target pages were in bounds; zero structurally invalid targets does not establish semantic or pinpoint correctness. The tested new build reduces lookup-required occurrences to 514, but that result must not be substituted for production verification.

Next review should visually compare the opposition cover and appendix spacing/footnotes against official PDFs, inspect the 16 zero-text and one garbled original-only PDFs in a PDF-capable environment, and review queue destinations against their source authorities. No case-wide completion or global review-ledger upgrade is claimed.

## Followthrough integrated, awaiting build and publication

The [original-source visual evidence](../reviews/berk-originals-visual-evidence.json) records actual inspection of all 19 pages across the 16 zero-text and one garbled original-only PDFs, including source and image hashes. These 17 records are now source-only visually reviewed; this does not certify extracted-reader fidelity or citation targets.

The [external-source review](../reviews/berk-external-source-review.json) identifies73 destinations covering227 queued occurrences, with71 case identities corroborated by authoritative PDFs, one by an official index and the appendix identity checked separately. The [common circuit authority review](../reviews/berk-common-circuit-reference-review.json) covers91 Pledger/Gallivan/Young occurrences with explicitly bounded source evidence. Destination identity is not proposition or pinpoint certification.

The [reference correction evidence](../reviews/berk-reference-followthrough.json) supports13 Supreme Court rule-target corrections, suppresses3 ambiguous/other-court rule matches, rejects5 false appendix links and fixes3 split-digit pinpoint spans. Full integrated build and production validation remain pending. The [deployment diagnosis](berk-deployment-diagnosis.md) distinguishes completed file synchronization from completed publication; a fresh validated artifact will be used instead of retrying the canceled one.

Two exact precedent-index entries now route Pledger (5 F.4th 511) and Young (942 F.3d 349) to verified official opinions. The existing unique full-citation matching behavior is unchanged; 59 fixture occurrences were replayed by the delegate. Gallivan remains unresolved. [Routing evidence](../reviews/berk-circuit-source-routing.json).

The [bounded visual exception review](../reviews/berk-exceptions-visual-evidence.json) inspected11 official source pages: appendix PDFpages4–13 and the opposition cover. It supports37 guarded display repairs,12 separated footnotes, and6 same-length cover-casing corrections. Appendix raw text stays unchanged; the earlier23 normalized comparisons remain applicable. Opposition baseline comparison is historical, with source-backed cover casing now corrected; full cover ordering/layout is not certified. Generator tests passed3/3 in [run42756189097](https://github.com/davidamiel/ninefold/actions/runs/42756189097). Integrated browser visual checks remain pending.

## Integrated execution before fresh publication

[Validation 42756784017](https://github.com/davidamiel/ninefold/actions/runs/42756784017) passed 309 tests, source/packaged audits, build, 27 document/alias Chromium checks, and targeted 12-footnote/cover checks. All 12 note bodies remained readable and excluded from main prose. A reviewer actually inspected both captured reader images and confirmed corrected wording, markers and the footnote 1 popup without a new grouping regression. Existing inline folios 2a/3a and the unreviewed appendix PDF 3 asterisk note remain visible gaps. Only 10/60 appendix source pages and 1/41 opposition source pages have been visually inspected; 50 and 40 pages respectively remain unreviewed.

The validated build found 428 lookup-required and 313 external-source-only occurrences; these are built results until the fresh production check confirms them. Preflight found 5,587 files/270,324,856 bytes with no artifact-shape problems. Publication is now being attempted once with a newly built artifact and immutable deployment manifest.
