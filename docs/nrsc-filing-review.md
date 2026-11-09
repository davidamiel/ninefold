# NRSC jurisdiction-filing extraction review

Date: November 9, 2026. Base: public main `0851fcd`.

## Scope and source identity

Two non-auxiliary filings in National Republican Senatorial Committee v. Federal Election Commission (24-621), categorized Other, linked valid official PDFs but lacked reading assets. This batch adds those assets without changing existing source text, document IDs, categories, docket associations or source URLs. It does not change or validate any citation target.

- `24-621-7b13c24198cf`: Court-appointed amicus's November 24, 2025 motion for leave, proposed supplemental jurisdiction brief, and addendum; 35 PDF pages; SHA-256 `9b2f977f605b033af51170212944b567c9e2eb5c9d60c2cc50b0d29afdf59dba`.
- `24-621-f75392ee825b`: December 3, 2025 reply supporting leave; 3 PDF pages; SHA-256 `9864ae5f0697fbbf0f4af17a16be56a4646b6ec5ae5ba9e5d25d541f6b219187`.

`dist/data/nrsc-filing-provenance.json` records the exact Court URLs, hashes and rendered sample pages. Both PDFs were downloaded directly from those URLs. Every PDF page maps to the same one-based extracted page number. The first file includes two sparse divider pages: PDF page 5 is ATTACHMENT and PDF page 24 is ADDENDUM, not missing scan text. Pages 6–23 contain the supplemental brief and pages 25–35 contain the addendum contents and quoted excerpts. These excerpts remain the filed party's presentation; the underlying media sources have not been independently verified.

## Bounded comparison

The reviewer viewed rendered PDF pages 1, 5, 11, 24, 27 and 35 of the motion and all three reply pages and compared their wording with raw extracted page text. The sample checks include the covers, section transitions, jurisdictional introduction, addendum footnotes 1 and 8, and reply text crossing the final-page boundary. The literal Supreme Court Rule 25.6 reference was preserved; its applicable edition and target have not been checked. No unsupported spelling or citation corrections were introduced.

This is a partial source review, not full transcription, final browser-layout review, or citation certification. Raw text preserves source-page boundaries, line breaks and meaningful hyphens. PDF typeface, italics, superscripts, rules and visual placement are not reproduced in raw extraction. All 38 pages are imported, but only the nine listed pages were visually sampled. Both assets retain `reviewed: false`; the review ledger records `partial` source entries only and leaves citations unknown. Even the three-page reply stays partial because browser display and annotation interactions remain unchecked.

## Reproduction

Use Poppler pdftotext 25.03.0 and pypdf 6.21.4, with the exact PDFs named by reader ID in a local cache:

`python scripts/import_procedural_filings.py /path/to/cache nrsc-filing-provenance.json`

The shared importer retains its original five-file default manifest and accepts only the two named manifests. It verifies every URL, hash and page count before writes, retains each unmodified Poppler layout page string, rejects replacement/NUL characters, refuses to overwrite differing assets, and updates coverage only for newly imported IDs. Existing reader assets and annotation offsets remain untouched. Re-running either manifest is idempotent.

## Validation

- 187 unit tests pass, including both new NRSC regressions.
- Production build, strict structural audit, review-ledger gate, polish checks and packaged term-reader check pass. The inventory has 4,820 extracted files and 178,370 pages, zero structural errors and zero correction-evidence gaps. Source status is partial for these two IDs and unknown for 10,429; citations remain unknown for all 10,431 IDs.
- A second import is idempotent. An independent reviewer confirmed all 38 page strings exactly match fresh Poppler extraction and visually rechecked the nine rendered samples.
- Actual browser QA remains blocked: Chromium aborts with `socket() failed: Operation not permitted`, including an approved escalated launch using a temporary profile. Reading/PDF toggling, final paragraph and footnote display, and annotation interactions remain unverified and are scheduled for live checking after the user-authorized publication. Unit/DOM checks are not a substitute.
- The unrelated generated Firebase bundle was restored to the exact base version; this content-only batch does not ship vendor changes.

No publication or deployment is performed by this change. Collection-wide source and citation review remains unfinished.
