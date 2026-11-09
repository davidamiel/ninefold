# Legacy correction evidence review

On November 9, 2026, all 102 existing display repairs in the following two documents were compared with rendered passages of PDFs freshly downloaded from the exact official source URLs stored with the documents. The downloads matched the already tracked PDF artifacts byte for byte. All 102 replacements are supported; no replacement wording, raw page text, page ordering, document IDs, or source offsets changed. Each repair now has an exact `expectedText` guard and an individual correction-evidence record.

## Sources and scope

- Berk v. Choy, AMA amicus brief, `24-440-f0bb42099b11`: 13 repairs on PDF pages 7, 8, 11, 13, 14, 15, and 16. Source: https://www.supremecourt.gov/DocketPDF/24/24-440/368779/20250804145148054_24-440%20Amici%20Brief.pdf. SHA-256: `82a29a330d630e05e4894ece2a6e8551f2ec2d76fac569bd7ccbce5220ab241d`.
- Abouammo v. United States, preliminary print, `25-5146-2ec91392fbac`: 89 repairs on PDF pages 2–13. Source: https://www.supremecourt.gov/opinions/25pdf/608us2r46_2c8f.pdf. SHA-256: `9140c7b88ab4814bbdfff8f268adc297f533157ea47eaf7e52a2d135b307bd08`.

The exact source files remain available as `dist/data/pdfs/{document-id}.pdf`. `dist/data/document-correction-evidence.json` records every zero-based raw page and UTF-16 span, original and replacement text, one-based PDF page, source URL, hash, artifact, method, and verification date.

## Method and findings

PyMuPDF rendered the relevant passages at 2.3 times PDF resolution. PDF text search located candidate passages only; the review checked the rendered pixels, not just the defective text layer. Every matching occurrence of each repaired phrase on its page was inspected, including both halves of line-wrapped words. Repeated occurrences were not assumed equivalent without viewing them.

Berk's repairs remove spurious spaces inside words, for example `th is`, `AOM s`, and `sta te`. The phrase `an` followed by `inordinate` spans a physical line break; the existing replacement preserves that break. Abouammo's repairs restore missing letters in ligatures, including `few` → `flew`, `fled` → `filed`, and `Whitfeld` → `Whitfield`. Two existing repairs retain meaningful compound hyphens removed by line dehyphenation: `conduct-focused` on PDF page 9 and `of-justice` within `obstruction-of-justice` on PDF page 11. Both were checked across the physical line break.

This is a bounded verification of the 102 repair spans. It is not a complete transcription, paragraph/footnote audit, citation-target review, or source-review certification of either document or the collection. Other wording and layout issues may remain. No document is marked fully source-reviewed on the strength of this repair-only review.

## Validation

An independent second reviewer checked all 102 guards, ledger records, source hashes, and all rendered passage sheets, and found no unsupported replacements. The second review also executed the application's `repairReading` function for every repair: each exact source span receives its replacement, while changed or missing raw wording is rejected.

The 170-test suite, strict document audit, document-review gate, polish checks, and term-reader checks pass. The strict audit reports 4,813 extracted files, 178,247 pages, 1,427 repairs, zero structural errors, and zero warnings. The review gate reports zero legacy evidence gaps and zero errors. The 102 recovered baseline allowances were removed; all 10,431 document/alias IDs still have unknown full-source and citation-review status, since this review only verifies specific correction spans.
