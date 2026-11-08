# Source-backed font recovery: RiseandShine petition

This follow-up supersedes the 36 hand-verified repairs in [the first bounded review](riseandshine-appendix-review.md). It repairs the same source document, `24-1016-dffa73766c90`, without modifying raw text or annotation anchors. It is not a certification of the whole petition or collection.

## Authoritative source and reproducible mechanism

Source: [official petition, No. 24-1016](https://www.supremecourt.gov/DocketPDF/24/24-1016/352514/20250319163025533_24-%20Petition.pdf), SHA-256 `106009dd595ddabaa805eae20946b77ce3b20f79f70c70928a6ac966e5b474d3`. Raw JSON SHA-256 remains `b04cf6e40f7aef93fc05a1a72f7b35d0d2be46cccc594e1e24a46cf3536d21cd`.

The broken Roman and Italic fonts (PDF objects 452 and 459) use Identity-H and an identity CID-to-GID map but have no ToUnicode map. Their stored character codes therefore leak into extracted text. This is an extraction defect, not garbled printing in the PDF.

The same PDF embeds intact versions of these fonts (objects 435 and 436). Recovery validates the entire `hmtx`, `hhea`, `maxp`, `OS/2`, `fpgm`, `prep`, and `cvt ` table bytes against the corresponding donor. All jointly populated glyph outlines also match byte-for-byte at the same glyph IDs: 35 Roman and 6 Italic, including `.notdef`. No conflicting glyph passes. The script rejects an unexpected source hash, font encoding, CID-to-GID map, table mismatch, outline conflict, ambiguous Unicode mapping, or unmapped populated glyph.

The donors' Unicode cmaps identify glyph 192 as `fi` and 193 as `fl`. Their ligature outlines are subset-empty, so this part of the evidence is the verified font/glyph-order identity and donor cmap, not a claim of direct ligature-outline matching. Windows control aliases and private-use aliases are excluded. Ligatures expand into ordinary text, with source offsets preserved.

Unicode maps are added only to an in-memory derivative for extraction. All 127 pages were rendered from the original and derivative at the same scale, and every pixel buffer matched. The original PDF is neither modified nor replaced. An independent reviewer confirmed the font-identity reasoning and regenerated the result. Additional visual source checks covered physical pages 35, 47, 83, 97 and 127, including `fruit-flavored`, `identifies`, encoded folios and the closing court order, alongside the earlier nine-page visual review.

## Scope of corrections

The process produces 1,297 guarded display spans over 113 eligible pages. All 74 pages with raw control-character corruption are included. It also fixes artificial word spacing in the petition/front matter and line-ending range spacing such as `423- 24` and `Car- Freshner`. Existing raw JSON, IDs, page order, heading/omission metadata and source references remain unchanged.

Before accepting a page, the script checks that its raw text and the original PDF extraction match after the established whitespace/dehyphenation conventions. It then compares source-backed recovered coordinate extraction to the raw page and generates nonoverlapping replacements with exact `expectedText` guards. Single-character context expansion gives inserted text a nonempty source anchor and retains spaces that the reader's earlier punctuation normalization would otherwise consume. No dictionary, language-model transcription, generic Caesar-shift decoder or OCR is used.

Canonicalization is explicit: real spaces/tabs/newlines collapse, punctuation spacing follows the reader's typography rules, lowercase wrapped hyphenation follows the existing import convention, and source line breaks within numeric ranges or capitalized hyphenated names are joined. Encoded control glyphs are not treated as whitespace. This is recovered reading text, not preservation of every typographical line break.

Full provenance, donor table hashes and expected recovered page text are in `scripts/riseandshine-recovery-evidence.json`. Each exact repair also has a structured record in `dist/data/document-correction-evidence.json`.

## Reproduction and verification

Maintenance dependencies: `pypdf`, `fonttools`, `pymupdf`. They are not needed to run or build the app.

```sh
python scripts/recover_riseandshine_fonts.py /path/to/official-petition.pdf --report /tmp/riseandshine-recovery.json
# Review first; only this optional flag changes display metadata and evidence:
python scripts/recover_riseandshine_fonts.py /path/to/official-petition.pdf --report /tmp/riseandshine-recovery.json --apply
python tests/recover_riseandshine_fonts_test.py
node --test tests/riseandshine-glyphs.test.mjs
npm test
node scripts/audit_document_quality.mjs
```

Tests cover unchanged raw hashes, exact guards and evidence, every displayed repair and source-offset mapping, all 113 complete reader pages against the recovered expected text (allowing only intentionally suppressed leading folios), removal of control glyphs, stale-guard rejection, and untouched divergent pages. Full-page raw repair reconstruction is also checked. No supplementary Unicode occurs in the source; the script explicitly rejects it rather than assuming Python indices equal JavaScript UTF-16 offsets.

## Outstanding limits

Update: the twelve legacy OCR pages have since received [separate visual review and targeted fixes](riseandshine-ocr-review.md), including the known errors listed below. The automatic recovery still excludes those pages, but `--apply` preserves the reviewed manual corrections and footnote metadata. The two cited lexical-hyphen defects have also been fixed individually; the global convention remains unchanged.

Fourteen pages are deliberately excluded: physical pages 1 and 30 (cover/table extraction differences) and 100, 101, 105–107, 109, 111–112, 118, 122–124 (legacy OCR replacements). Their content differs from this PDF's text layer, and some OCR supplies words from image-only logos; replacing those pages wholesale would risk losing information. Separate visual review is needed. Known examples requiring review include `111. LEGAL STANDARD`, `I-lawkins`, and a missing citation ending on printed page 75a. No silent overwrite of these pages occurs.

Image-only content, footnote layout, all citation targets, and discretionary versus lexical hyphenation have not been certified. The existing lowercase dehyphenation convention can still join a compound such as `cease-and-desist` incorrectly at a source line break; that is a separate reading-quality issue, not evidence that the font map failed. Passing structural checks or recovering all encoded glyphs does not make the entire petition correct.

Validation of this pass: all 112 JavaScript tests and five Python maintenance tests pass. Independent regeneration reproduces all 1,297 repairs exactly. Source and packaged audits each report zero errors and 102 pre-existing missing-evidence warnings across the collection. Production build, polish checks, and source/packaged reader coverage checks pass. These are local results; no deployment or browser-session verification is claimed.
