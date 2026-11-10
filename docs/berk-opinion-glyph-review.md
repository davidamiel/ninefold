# Berk v. Choy opinion: bounded ligature recovery

Source: https://www.supremecourt.gov/opinions/25pdf/607us1r10_5hek.pdf

Document: `24-440-1bba7e3379d6`, 28 PDF pages, reviewed November 9, 2026.
Source SHA-256: `c6cb3be49576bc5a61e048844aad9876991d9fad0f8b6c66309ffb8ae3a6149f`.
Immutable extracted JSON SHA-256: `7900dfd10bb4592317e58568bac39c2e145c502dede0c1ff92b1f8e2e8112fa1`.

## Defect and proof

The PDF's encoding object 1431 explicitly assigns code 174 (AE) to `/fi` and 175 (AF) to `/fl`. However, ToUnicode objects 57, 58, 59, 61, 1422 and 1424 map both codes to U+0066 (`f`). Ordinary extraction therefore loses the second letter. This is a source text-layer defect, not a spelling inference.

An in-memory copy replaces only those two mappings with distinct temporary Unicode markers. Every page's marked extraction, after mapping the markers back to `f`, exactly matches both the original extraction and the immutable stored page text when whitespace and hard/soft hyphens are ignored for alignment. All other characters must match, in order. Every marked glyph is mapped back to its exact raw offset. No hyphen or whitespace is changed by these repairs. Every raw page contains only BMP characters, so these indices equal JavaScript UTF-16 offsets.

The recovered copy renders pixel-identically to the original on all 28 pages. The original PDF and raw JSON are unchanged. 224 exact, guarded display repairs restore only source-encoded fi/fl glyphs. The evidence ledger records each source page, offset, source artifact and hash. `scripts/berk-opinion-glyph-evidence.json` records counts by page and encoding/CMap objects. This is document-specific recovery, not a global word substitution. Correct literal words such as “fell”, “forced”, and “off” are untouched.

## Visual checks and limits

Rendered source PDF page 5 (printed 190) was visually inspected: “fitted”, “fitting”, “affidavit”, “file”, “files” and “filed” are visible. PDF page 8 (printed 193) was also inspected, including “affidavit”, “satisfies”, and the footnote's repeated “filed”. These support the encoded-glyph recovery. Automated source-glyph verification covers all 28 pages; visual transcription review does not. No claim is made that all other wording, footnotes, paragraph boundaries or citation targets were reviewed or corrected, or that other documents in the collection are error-free.

## Reproduce and verify

- `python tests/berk_glyph_recovery_test.py` (PyMuPDF): validates the exact source encoding, all raw glyph offsets and replacements, and pixel identity on every page.
- `node --test tests/berk-glyphs.test.mjs`: guards immutable source bytes, runtime/curated consistency, evidence, display output, stale repair rejection and source selection maps.
- Run the repository's document audit and public tests before publication.

Validation for this patch: 256 public tests passed, including four new Berk tests; the Python glyph-recovery check passed; strict document audit returned zero errors and warnings; review gates passed for both `dist` and built `out`; polish and term-reader checks passed; production build completed. These checks do not constitute a full-document visual review or a collection-wide accuracy claim.
