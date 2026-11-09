# Procedural-filing extraction review

Date: November 9, 2026. Base: public main `4d61b38`.

## Finding and bounded change

The importer prioritizes configured categories rather than all non-auxiliary docket entries. These five substantive procedural filings were classified `Other`, had valid official PDF links, and lacked extracted reading assets. All five Court URLs returned valid PDFs containing embedded text. They are not scan-only documents. The existing reader deliberately falls back to Original PDF when `textPath` is absent; that fallback is appropriate, but its disabled Reading control incorrectly described every such filing as scanned. The control now says only that reading view is unavailable for the filing.

This batch adds five reader assets, covering 85 source pages, without changing the existing IDs, docket associations, category, source URLs, or any previously extracted text. The PDF remains linked. `Other` also includes administrative material; this batch does not justify bulk reclassification or extraction of every remaining item.

## Exact sources and scope

`dist/data/procedural-filing-provenance.json` records the exact official URLs, SHA-256 digests, page counts and visually inspected sample pages:

| Reader ID | Filing | Pages | Rendered sample pages |
|---|---|---:|---|
| 24-38-d297c2fd12b4 | Hecox suggestion of mootness, including declaration appendix | 16 | 1, 5, 13, 15, 16 |
| 24-38-f1e265d23730 | Little response to suggestion of mootness, including declaration appendix | 21 | 1, 6, 18, 19, 21 |
| 25-406-2ff36bf3545c | Verizon rehearing petition indexed on related FCC docket | 14 | 1, 5, 13, 14 |
| 25-567-e94071eb7fc8 | Verizon rehearing petition on its own docket | 14 | 1, 5, 13, 14 |
| 25-1083-ef3858304918 | Miot motion to dismiss as improvidently granted, expressly as to 25-1084 | 20 | 1, 6, 19, 20 |

The two Verizon files have distinct source hashes and small text differences, including the final-page printed number. They remain separate. A source cover bearing a related docket number is not grounds to replace the catalog's explicit cross-docket filing association.

Hecox source page 13 and response source page 18 are sparse `APPENDIX` divider pages, confirmed visually. Neither is a missing-text scan. Every source page remains represented, including covers, contents, certificates, declaration pages and appendix dividers. Signatures and other artwork are not transcribed; use the original PDF for those. The response's final declaration page visibly includes a handwritten signature.

The 22 rendered samples establish document identity and basic page correspondence, not word-by-word verification of 85 pages. Citation targets and editions were not independently checked. Extracted data explicitly retains `reviewed: false`; no full source/citation approval is asserted.

## Reproduction and safeguards

Use Poppler pdftotext 25.03.0, pypdf 6.21.4 (page labels only), and the five exact hash-pinned PDFs, named by reader ID, in a local cache:

`python scripts/import_procedural_filings.py /path/to/cache`

The importer performs no network activity. It validates every URL, source digest, page count, and absence of replacement/NUL characters before writing. It refuses to overwrite a differing existing reader asset. Each page's Poppler layout-extracted string is retained unmodified, preserving source-page boundaries and avoiding speculative hyphen, glyph or footnote repairs. Running it again is idempotent. Aggregate coverage retains its original supplemental-record scope and adds only newly imported IDs.

## Extraction quality finding

Independent review rejected the initial pypdf draft because it inserted spaces within words in both Verizon files, including `Pursuant` and `Communications`. Hecox’s declaration also split `transgender`. The final unpublished assets use Poppler layout extraction, which preserves these words and matches the rendered samples. Regression tests cover these concrete failures and preserve line-end hyphens within statute numbers, docket numbers and URLs. Default Poppler mode was not used because it can remove those meaningful hyphens. Independent recheck confirmed all 85 final page strings match raw layout extraction. No previously published text or annotation offsets are changed.

## Validation and limits

- 172 unit tests pass, including page inventory, provenance, sparse-page, distinct-source and neutral availability-label regressions.
- Production build passes.
- `check_polish.mjs` and packaged `check_term_reader.py out` pass.
- Document inventory reports 4,818 extracted files / 178,332 pages, zero structural errors. The public base retains 102 previously known legacy evidence gaps, addressed by a separate pending change, not concealed by this batch.
- Local Chromium cannot start: `socket() failed: Operation not permitted`, including the approved escalated retry. Therefore actual browser rendering, toggling between Reading and Original PDF, and case navigation are **not validated** in this environment. Code-path inspection is not a substitute for that check.

No publication or deployment was performed. This remains a pending batch requiring independent review and browser QA before release.
