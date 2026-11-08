# Visual review of RiseandShine legacy OCR pages

Follow-up on 2026-11-08 to [font recovery](riseandshine-font-recovery.md), using the same exact official PDF and hash. This pass visually reviewed original physical pages 100, 101, 105–107, 109, 111–112, 118 and 122–124, which the automatic recovery excluded because their stored text came from a legacy OCR replacement. All proposed changes received an independent second visual review.

## Verified corrections

Twenty-two precise corrections address:

- `I-lawkins` → `Hawkins`, `I-lere` → `Here`, and `[Ilt` → `[I]t`.
- Roman-numeral headings `III. LEGAL STANDARD` and `IV. DISCUSSION`, including their outline metadata at unchanged offsets.
- Missing `2015)).` and the superscript footnote marker `²` in the Actavis citation on printed page 75a.
- Missing opening quotation text in the footnote on printed page 76a. The source ends a physical line with `[T]` and starts the next with `he`; reading text rejoins the word as `[T]he`.
- Omitted `accord` and spacing in `LVL XIII Brands`; italic `Id.` misread as `ld.`; case/reporter capitalization; `Plaintiff has` and `NEXTY`.
- Printed folios misread as `Sia` or split as `94 a`.

No substantive correction was needed on raw pages 100, 106 or 122 in this pass. Existing image-only logo text on raw page 106 is retained. Quote-style differences and header ordering are left alone rather than silently replacing whole OCR pages with text-layer extraction.

Two additional visually verified fixes retain lexical compound hyphens across source line breaks: `cease-and-desist` on physical page 47 and `in-store` on page 97. These supplement the automatic recovery rather than changing a global dehyphenation heuristic.

Exact guarded spans and individual source-review notes are in `scripts/riseandshine-manual-corrections.json`; the structured correction ledger also records every repair. Source PDF hash: `106009dd595ddabaa805eae20946b77ce3b20f79f70c70928a6ac966e5b474d3`. Raw document hash remains `b04cf6e40f7aef93fc05a1a72f7b35d0d2be46cccc594e1e24a46cf3536d21cd`.

## Footnote and body continuity

Visual review of printed pages 74a–76a established the following zero-based raw-page spans:

- Raw104 `[1088,1187)` is a continuation of footnote 1, whose preceding page ends “The Court has reviewed”.
- Raw104 `[1187,1671)` is footnote 2.
- Raw105 `[453,1936)` is footnote 3, whose existing main-text marker is `[31,32)`.

These spans now use the reader's existing footnote metadata, preserving the text in the footnotes section rather than mixing it into main prose. The main sentence correctly continues from “this standard in” to the next page's “trademark cases.” The newly restored marker 2 is displayed as superscript `²`; no nonexistent raw marker range is invented.

## Regeneration and verification

The recovery script preserves these reviewed manual repairs and metadata during `--apply`. It validates exact source guards and rejects overlap between generated and manual repairs. The combined total is 1,321 display repairs: 1,297 systematic and 24 visually reviewed additions. The raw document is unchanged.

Regression tests cover all manual source spans, the missing citation and wrapped quotation, outline headings, footnote separation and availability, the original marker 3, image-only logo preservation, compound hyphens, and complete recovered-page text. The two verified hyphens are explicit overrides of the automatic recovery's conservative expected text.

This is still not whole-document certification: cover/table extraction differences, other image-only material, every citation destination, all footnotes across the 127 pages, and all discretionary/lexical hyphenation remain outside this pass. The original PDF remains the reference. No publication or live-browser verification is implied by local checks.

Final local validation: all 113 JavaScript tests and five Python maintenance tests pass. Independent isolated regeneration preserves the complete curated/generated metadata and evidence exactly. Production build, polish checks and source/packaged reader coverage pass. Both structural audits report zero errors and the same 102 pre-existing missing-evidence warnings elsewhere in the collection.
