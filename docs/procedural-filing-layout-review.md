# Bounded procedural-filing layout review

November 9, 2026. This is a display-layout review, not full transcription or citation-target approval.

The exact five source PDFs and SHA-256 hashes are recorded in `dist/data/procedural-filing-provenance.json`. Original page text, document IDs, source URLs, and annotation offsets remain unchanged.

## Evidence and changes

Rendered the following source pages with Poppler or PyMuPDF and inspected the images. Confirmed that signature counsel lists are two columns, not prose paragraphs or headings. The original raw layout-extracted strings are retained in bounded `counselBlocks`, including whitespace and line breaks. Each block has an exact `expectedText` guard and this evidence path. No reordering, transcription, inferred contact details, or approximate offset replacement is performed. The renderer must preserve each character's source offset and avoid automatic heading/citation detection within these blocks. Per-line source-verified `columnBreaks` allow responsive presentation of the left and right columns without changing the source text or DOM text order. Small screens can visually stack the complete columns rather than clipping the right column.

| Reader ID | Counsel source pages | Additional inspected heading pages |
|---|---|---|
| 25-406-2ff36bf3545c | 13 | 2, 5, 7, 10, 14 |
| 25-567-e94071eb7fc8 | 13 | Counsel page 13 independently rendered and inspected; other matching heading spans checked against its immutable asset |
| 24-38-d297c2fd12b4 | 2 (cover continuation), 11, 12 | 6, 9, 15 |
| 24-38-f1e265d23730 | 17 | 5, 6, 9, 11, 13, 15, 20 |
| 25-1083-ef3858304918 | 20 | 6, 8, 9, 11, 16, 17, 19 |

The Hecox cover continuation on source page 2 is omitted from Reading view, as cover material, but retained unmodified in the source asset and Original PDF. Other omissions are explicit cover or contents/authorities spans. Verizon's disclosure statement remains visible. Repeated Verizon cover material on page 5 ends before the substantive introductory sentence. Appendix dividers and declarations remain visible, while appendix contents lists are omitted.

Headings are bounded to actual source headings, excluding attorney names, body citations, and inline A/B argument paragraphs in Verizon. In particular, Hecox page 11's `U.S. 188, 199-200 (2003).2` is body text, followed by a separate CONCLUSION heading. The two Hecox footnotes and their inline markers were verified on source pages 9 and 11 and recorded separately without removing their text from the immutable asset.

Counsel block boundaries use zero-based source pages and exclusive ends:

- Both Verizon records: page 12, 277–779.
- Hecox suggestion: page 10, 338–1387; page 11, 29–612.
- Hecox response: page 16, 219–917.
- Miot: page 19, 77–833.

These bounded changes do not certify all 85 pages or any linked citation's correctness. The PDF remains authoritative for typography, signatures and exact spatial relationships. Layout extraction may approximate the original column gap. The verified boundaries below identify columns even where the extracted gap is only one space.

## Implementation verification

The actual reading-text, numbering, and HTML renderer pipeline is covered by `tests/filing-rendering.test.mjs`: CONCLUSION contains no reporter or reference fragment, each emitted citation label is whole, all six counsel blocks reproduce their exact source text with one-to-one source-offset maps, and stale counsel guards fail closed. The editor sanitizer retains the counsel-block class.

Validation: all 182 Node tests pass; production build succeeds; document audit reports zero structural errors and zero legacy evidence gaps. The audit still correctly labels full source/citation review unknown, not complete. Local Chromium launch was blocked by environment socket permissions, including the escalated attempt; independent visual verification remains required before deployment.

## Responsive column boundary verification

For each of the six blocks, `columnBreaks` has one entry per raw line. An integer is the UTF-16 offset within that line of the first visible right-column character. A left-only line uses its full length; a right-only line assigns its leading whitespace to the empty left cell. Empty lines use zero. A null entry marks a full-width concluding counsel label, which must follow both columns. Every line reconstructs exactly as `line.slice(0, boundary) + line.slice(boundary)`. No split divides a word. No text or whitespace is removed from the stored asset or metadata.

The boundary decisions were checked against the rendered signature pages listed above. In particular, Hecox source page 12 has three narrow gaps that cannot be recovered by a generic multiple-space splitter: `AMERICAN CIVIL LIBERTIES | LEGAL VOICE`, `ACLU of Idaho Foundation | SARAH TOMPKINS`, and `219 S. River St., Suite 202 | LEGAL VOICE`. These are separate columns in the source image. The centered `Counsel for Respondents` label spans both columns, as does `Counsel for Verizon Communications Inc.` in each Verizon filing. In the Hecox response, `Counsel for Petitioners` belongs to the left column and `Counsel for State Petitioners` to the right.

Regression tests verify all six arrays, exact source reconstruction, word-safe splits, and the three narrow Hecox boundaries. Runtime presentation and mobile browser checks remain separate validation.

Mobile implementation validation: 185 Node tests pass and production build succeeds. Renderer tests check all six split blocks, byte-exact DOM text, exact source maps, independent left/right/full-width cells, and editor capture/render round trips. The CSS stacks whole columns below 600px and wraps long cell text instead of horizontally clipping it. Browser verification of the 320px layout remains pending with the laptop QA worker.
