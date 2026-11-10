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

A dedicated Berk regression test checks heading locations and transcript labels. A Chromium smoke script opens the case reader documents and records DOM evidence; it is a smoke test, not line-by-line visual source comparison. The publish workflow temporarily listens only for changes to the case ledger on main so the already-authorized fixes can be built, tested and deployed through GitHub Actions when this environment has no shell or dispatch tool. The normal manual-only trigger is restored after that run. Workflow results and artifacts are the evidence of execution; the presence of test code is not a passing result.

## Remaining work

All full citation-target reviews and full visual/layout reviews remain open. The opposition cover/counsel casing, appendix spacing, footnotes and link destinations need further review. Sixteen original-only PDFs expose zero text; one has garbled text; these facts do not establish that they are scan-only. No entries were fabricated in the global review ledger, whose source-byte hashes and current audit fingerprints could not be computed here. The case ledger tracks bounded work without upgrading those global statuses.
