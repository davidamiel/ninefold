# Source review: RiseandShine petition, Appendix B pages 20a–28a

Historical first pass: the current repair ranges are superseded by the broader [source-backed font recovery](riseandshine-font-recovery.md). Counts and ranges below describe the original 36-repair review.

Reviewed on 2026-11-08 against the [official petition for a writ of certiorari in RiseandShine Corp. v. PepsiCo, Inc., No. 24-1016](https://www.supremecourt.gov/DocketPDF/24/24-1016/352514/20250319163025533_24-%20Petition.pdf). Document ID: `24-1016-dffa73766c90`.

## Scope and evidence

This is a bounded visual review of PDF pages 50–58, printed Appendix B pages 20a–28a, not certification of the petition or collection. The exact downloaded PDF has SHA-256 `106009dd595ddabaa805eae20946b77ce3b20f79f70c70928a6ac966e5b474d3`. All nine pages were rendered with Poppler at 1700 pixels and visually inspected. An independent reviewer also compared all 36 repairs with these rendered pages.

Reproduce the source review with:

```sh
curl -L --fail 'https://www.supremecourt.gov/DocketPDF/24/24-1016/352514/20250319163025533_24-%20Petition.pdf' -o /tmp/riseandshine-petition.pdf
sha256sum /tmp/riseandshine-petition.pdf
pdftoppm -f 50 -l 58 -scale-to 1700 -png /tmp/riseandshine-petition.pdf /tmp/riseandshine-page
```

The imported text includes control characters and shifted glyph codes inside ordinary prose, while the PDF visibly displays correct words. For example, the source-or-sponsorship passage, the Int’l Info. Sys. Sec. Certification Consortium citation, and the final Polaroid balancing paragraph are legible in the PDF. The displayed issue is already present in the stored extraction, not introduced by the reader. Other lines have artificial spaces inside words. The repairs use visual source wording, not a global character-shift decoder or dictionary guess.

## Changes

Thirty-six exact display repairs cover 16 corrupted-glyph spans and 20 word-spacing spans on the nine reviewed pages. They restore, among other passages:

- “as to source, but also as to sponsorship, affiliation or” and “Int’l Info. Sys. Sec. Certification Consortium,” on 20a.
- “finding on a” on 21a and both the final-weighing and reasonable-jury phrases on 22a.
- The Saxon Glass parenthetical, the Star Industries quotation, and “the final step of the analysis is to balance the various” on 23a.
- The law-of-the-case and preliminary-injunction passages on 26a–28a.

Exact ranges, original text, replacements, source page numbers, source hash, review method, and date are in `dist/data/document-correction-evidence.json`. Guarded repairs are present in both `scripts/curated-reader-structure.json` and `dist/data/reader-structure.json`. Source page numbers in evidence are physical one-based PDF pages; repair page indexes are zero-based. All affected raw characters are in the BMP, so these offsets equal JavaScript UTF-16 offsets.

The immutable raw document is unchanged (SHA-256 `b04cf6e40f7aef93fc05a1a72f7b35d0d2be46cccc594e1e24a46cf3536d21cd`). Document ID, page ordering, headings, omission metadata, and existing annotation anchors are retained. One citation repair includes the preceding space because typography normalization otherwise mistakes its encoded initial comma for punctuation and removes that space before repairs run.

## Verification and limitations

`tests/riseandshine-glyphs.test.mjs` verifies the raw hash, evidence and guard consistency, bounded scope, actual reading-transform output, neighboring citations, absence of control characters on reviewed pages, monotonic in-bounds source maps through every replacement, and fail-closed behavior when raw text changes. It also verifies that unreviewed adjacent pages are not silently decoded.

The raw petition contains control-character corruption on 74 of its 127 pages. This pass addresses seven of those pages, plus spacing defects on two other pages. The remaining 67 corrupted pages require further source review. Ordinary spacing defects elsewhere in the petition, including the front matter, remain outside this pass. Footnote layout and whole-petition citation resolution have not been certified. A passing structural audit does not establish collection-wide accuracy.

Local validation completed: all 110 unit tests pass; `check_polish.mjs` and `check_term_reader.py` pass; the production build packages successfully; source and packaged audits both report 4,813 documents, 178,247 pages, 142 repairs, zero errors, and 102 pre-existing missing-evidence warnings. Packaged reader coverage also passes. No live-browser verification or deployment is claimed for this repair.
