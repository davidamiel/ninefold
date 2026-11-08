# Landor running-header review

Reviewed 2026-11-08 against the local excerpts of the [Supreme Court page-proof PDF](https://www.supremecourt.gov/opinions/25pdf/609us1r55_h315.pdf), source ID `23-1197-47c01f9ff679`.

## Defect and correction

The two-line running case title reads `LANDOR v. LOUISIANA DEPT. OF CORRECTIONS AND` followed by `PUBLIC SAFETY`. Removing only its first line leaves a false heading in reading view. A rendered visual inspection of printed page 60 confirms both lines belong to the top margin, above the Syllabus label and body text.

Added 24 exact, source-text-guarded omission ranges for zero-based raw pages 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, and 48. Each range includes the printed page number and both case-title lines. The ranges are in both curated and runtime reader structures; raw source text remains unchanged. The reader checks `expectedText` before applying an omission, so changed source text does not inherit a stale omission.

Beyond the rendered example, PDF text-position checks confirmed `PUBLIC SAFETY` at top-margin baseline y≈653.65 on every affected page, using all three local source excerpts. This is positional verification of the repeated header, not a visual review of every word on all 24 pages. No general rule deletes body occurrences of `PUBLIC SAFETY`.

## Exact source artifacts

- `dist/data/pdfs/23-1197-47c01f9ff679--1-0.pdf`: SHA-256 `5ffd74d169d0b5c4341964a68600bc360a87cefa0560a0518983b95b41367fbb` (starts raw page 1).
- `dist/data/pdfs/23-1197-47c01f9ff679--5-53.pdf`: SHA-256 `fcc9cb55170a34ccc416f4beca57a019c3ce0992b24d2f0bfd72c58a79887005` (starts raw page 5).
- `dist/data/pdfs/23-1197-47c01f9ff679--22-326.pdf`: SHA-256 `3c3c82dd76dc953b9134d4394fd130884747b591231c381b56e1b7a621657aa5` (starts raw page 22).

The renderer check was `pdftoppm -f 2 -l 2 -scale-to 1200 -png` on the first excerpt. Position checks used `pypdf.PdfReader` and its `visitor_text` callback.

## Printed folios

The independent regression review also found that page `label` may be a physical PDF ordinal, not its printed folio. For example, raw page 9 of `23-1197-2ff7db93d400` has label `10` but printed folio `2`; raw page 8 of `23-1197-391b7f603342` has label `9` and printed folio `2`. Numeric folio stripping therefore retains its existing edge-line heuristic, with explicit verified heading metadata taking precedence. It does not depend on equality with the physical label. The heuristic is not a guarantee that every unmarked numeric heading is distinguishable from a folio; source-verified heading metadata remains necessary for ambiguous pages.

Regression tests cover all 24 header ranges, retention of substantive `PUBLIC SAFETY`, both printed-folio examples, and verified numeric headings. No raw text, annotation anchors, or publication state changes.
