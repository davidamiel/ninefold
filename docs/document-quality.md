# Document quality and correction standards

Ninefold's extracted reading text is a convenience, not a certified transcription. The original source remains authoritative. A successful automated check establishes only the checks it performs; it does not certify all wording, citations, footnotes, paragraph boundaries, or completeness.

## Preserve source anchors

Keep stored page text, document IDs, page order, and original source references immutable. Saved annotations use page-relative JavaScript UTF-16 code-unit offsets, not Python Unicode character indices or PDF coordinates. Display normalization must maintain a monotonic source-offset map for every displayed code unit, including expanded ligatures and inserted paragraph spacing. Test selection mapping across changes, including non-BMP characters.

Use `reader-structure.json` for reviewed omissions, headings, footnotes, and span repairs, and `reading-layout.json` for coordinate-derived paragraph boundaries. Make persistent curated changes in `scripts/curated-reader-structure.json` as well so regeneration does not erase them. An equal start/end heading is an intentional insertion anchor, not a source-text span. Replacement or omission spans must be nonempty and within their source page. Repairs must not overlap.

Do not infer that repeated words are running headers: verify position, repetition, and the source page. Do not turn every extracted line break into a paragraph, merge meaningful lists or quotations, silently discard footnotes, or infer missing words from context alone. A source PDF's text layer may itself have broken glyphs; re-extracting that layer is not independent visual confirmation.

## Source-verified correction workflow

1. Identify the exact document ID, source URL, PDF page number, raw page-relative span, and defect. Check the official source or the recorded authoritative edition. Do not substitute a different version without documenting it.
2. Retain a SHA-256 of the exact source bytes. Visually inspect the relevant rendered PDF page or compare an authoritative structured source. Record the method and date. For ambiguous OCR, leave the source unchanged and disclose the limitation.
3. Add the smallest display repair, not a broad spelling substitution. Every new repair must include `expectedText` matching the exact immutable raw span; the reader must skip it if that guard no longer matches. Preserve the raw extracted text and offsets. Distinguish a display-glyph normalization from a substantive word correction.
4. Record evidence in `dist/data/document-correction-evidence.json`, an object keyed by document ID with arrays of records: `page` (zero-based raw page), `start`, `end`, `original`, `replacement`, `sourceUrl`, `sourcePage` (one-based PDF page or explicit source locator), `sourceSha256`, `method`, and `verifiedAt` (ISO date). Match the exact span and replacement. This ledger is optional for legacy data but mandatory for new source-verified repair claims.
5. Add regression tests for the observed defect and nearby text that must not change. Check rendering and selection/highlight anchors before and after the repair. Inspect the original alongside reading view at relevant paragraph, citation, footnote, and page boundaries.
6. Run automated checks, review generated changes, and record the scope reviewed. Publishing is a separate action; a local passing build is not a deployed fix.

## References and citation quality

Recognizing a citation is separate from resolving its target. Preserve literal displayed wording and punctuation. Resolve using reporter, volume, starting page, case identity, and edition where applicable, not similar names alone. Pin cites are not starting pages. Short-form citations, statute versions, appendix labels, and cross-page references require contextual checks. Keep unresolved references explicit instead of linking to a guessed authority. Add positive and negative regression cases for every widened recognition rule.

## Repeatable checks

From the repository root:

```sh
node scripts/audit_document_quality.mjs > /tmp/ninefold-document-audit.json
node scripts/audit_document_quality.mjs --strict
node --test tests/document-quality.test.mjs
npm test
node scripts/check_polish.mjs
python scripts/check_term_reader.py
```

An optional positional path audits a different distribution, for example `node scripts/audit_document_quality.mjs out`. The audit is read-only and prints JSON. Normal mode exits unsuccessfully for structural errors; `--strict` also fails on warnings, including legacy repairs without evidence. It discovers plain or gzip-packed JSON documents with page arrays and joins metadata through filename IDs and indexed `textPath` aliases. It checks source-offset bounds, nonempty correction/omission spans, repair overlap, layout offsets, and correction-ledger consistency. It does not fetch sources, establish citation correctness, visually compare PDFs, or automatically repair anything.

## Baseline and limits

The local reconstruction audit against remote-main commit `6282d9d10ec40f994a475bb9c39b214947768176` examined 4,813 extracted JSON files containing 178,247 pages. Structural checks found no out-of-bounds spans. There were 102 existing display repairs without structured correction evidence, across two document IDs. These warnings identify missing provenance, not proven incorrect text. Synthetic zero-width exhibit headings and indexed document aliases are supported by the audit.

Review the current report rather than treating these baseline counts as permanent. The audit does not certify collection-wide accuracy, even when it reports zero errors. Source-by-source visual review, citation-target review, scan-only PDF inspection, and evidence for legacy corrections remain distinct work.
