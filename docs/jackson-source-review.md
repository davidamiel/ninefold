# Source review: Jackson concurrence in Learning Resources v. Trump

Reviewed locally on 2026-11-08 against the [Supreme Court page-proof PDF](https://www.supremecourt.gov/opinions/25pdf/607us2r12_8nj9.pdf), also indexed under Trump v. V.O.S. Selections, No. 25-250. This is a bounded review of printed pages 310–313, not a certification of the opinion or collection.

## Evidence and reproduction

The repository's four-page source excerpt is `dist/data/pdfs/24-1287-2059f0a43b72--82-622.pdf`. Its SHA-256 is `7628338d8ca3dffd4d7ed693366b395f9e117368419832527c88326e14adba4a`. These are full source pages, so the excerpt includes the end of Kagan's opinion before Jackson and the start of Thomas's dissent after it. Jackson's logical range is raw page 82, offset 622 through page 85, offset 1475.

Rendered and visually inspected all four pages with Poppler:

```sh
mkdir -p /tmp/jackson-review
pdftoppm -scale-to 1600 -png dist/data/pdfs/24-1287-2059f0a43b72--82-622.pdf /tmp/jackson-review/page
```

The rendered PDF visibly contains the full words below. Independent text extraction is **not** sufficient evidence here: `pdftotext` reproduces the missing letters. In the PDF's CenturyExpanded and CenturyExpanded-Italic font dictionaries, `/Encoding /Differences` assigns character 174 (`AE` hexadecimal) to `/fi`, while `/ToUnicode` incorrectly maps `<AE> <0066>` to only `f`. This explains the lost `i`; the visible glyph and encoding supply evidence beyond a spelling guess.

## Applied presentation repairs

Offsets below are zero-based UTF-16-compatible positions in the immutable source page text; end offsets are exclusive. All affected characters are in the BMP. Repairs are stored in both `scripts/curated-reader-structure.json` and generated `dist/data/reader-structure.json`, under source ID `24-1287-2059f0a43b72`.

| Raw page | Source PDF page | Printed page | Range | Extracted | Verified display | Scope |
| --- | --- | --- | --- | --- | --- | --- |
| 82 | 83 | 310 | 232–242 | signifcant | significant | Kagan, before Jackson's range |
| 82 | 83 | 310 | 1560–1567 | offcial | official | Jackson |
| 83 | 84 | 311 | 862–866 | frst | first | Jackson |
| 85 | 86 | 313 | 1610–1618 | justifed | justified | Thomas, after Jackson's range |

Each repair records `expectedText`, source URL, source PDF page, printed page, and this evidence document. `expectedText` must match before a repair is applied to a newly extracted source version. No raw source page or existing annotation offset is rewritten. Source raw JSON SHA-256 at review: `c3775c67a0c112b51d02a24f15db2bee4e366dfd35046c6339bbda6a021cbe21`.

## Other visual observations and limits

- “Opinion of Jackson, J.” is a running header on printed pages 310–312, not citation/body text. Printed page 313 has “Thomas, J., dissenting” as the running header even above the end of Jackson's opinion.
- The `n. 11` line on printed pages 311 and 313 continues the preceding `post, at 344,` citation. It is not a new enumerated paragraph.
- The watermark “Page Proof Pending Publication” is not body text.
- No general dictionary replacement or collection-wide font repair was applied. Other missing glyphs remain unverified until their own source and font mapping are checked.
- This review does not establish collection-wide citation correctness, document completeness, footnote placement, or source-version currency. Future source versions must be compared rather than silently reusing offsets.
