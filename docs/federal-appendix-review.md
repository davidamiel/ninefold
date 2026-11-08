# Federal Appendix reference recognition review

Reviewed 2026-11-08 against main `37ea46fa83dd2f95917ed4b6953699f7e7556620`.

## Defect and bounded correction

The reader recognized Federal Reporter second/third/fourth series but not Federal Appendix citations (`F. App'x` / `F. App’x`). Added this explicit reporter to reference recognition, preserving the exact displayed text and source-relative offsets. Straight and curly apostrophes share a canonical key. The matcher supports extracted line breaks and pinpoint pages; its pinpoint guard avoids consuming a following full Federal, U.S., Supreme Court, or Lawyers' Edition citation as a page number.

Recognition is not target verification. This change neither imports a cited opinion nor asserts a resolved local source. Existing unresolved-source handling remains in place. No extracted document, paragraph, footnote, correction ledger, or annotation anchor was rewritten.

## Scope and evidence

A read-only scan of `dist/data/docs/*.json` and `dist/data/current-docs/*.json`, applying the final `citationsIn` function to each page and selecting canonical keys matching `^\d+ F\. App'x `, found 1,041 occurrences across 327 files. These are extraction-level occurrences, not unique authorities or a visual certification of 327 PDFs. Matches in tables of authorities count too.

Representative exact source-text regression fixtures:

- Landor, `23-1197-2ff7db93d400`, zero-based page 29: `Alloway v. Hodge, 72 F. App’x 812, 817`. [Filed source](https://www.supremecourt.gov/DocketPDF/23/23-1197/373559/20250903155646000_250905a%20AC%20Brief%20for%20efiling.pdf).
- Current-term filing `25-1131-bbd5ef9eb2a9`, zero-based page 3: `Nije v. Dorethy, 766 F. App’x 387`. [Filed source](https://www.supremecourt.gov/DocketPDF/25/25-1131/405441/20260427161440381_No.%2025-1131%20Amicus%20Brief.pdf).

These tests verify recognition and offsets in the existing extraction, not fresh visual inspection or the correctness of each cited authority.

## Deferred work

First-series `F.` recognition was investigated but deliberately not added. Extracted tables and damaged series labels can produce misleading apparent references, including `20\nF. 2019` spanning table entries and `6 F. 3` in damaged citations. Broader recognition needs contextual/source review rather than a permissive generic matcher.

The collection-wide structural audit still reports 4,813 files / 178,247 pages, zero errors, and 102 existing legacy corrections without structured provenance. Those warnings remain a separate source-review queue. This work does not establish collection-wide textual or reference accuracy.

## Verification

- `npm test`: 144/144 passing, including straight/curly apostrophes, newline extraction, exact spans, nearby higher-series citations, malformed labels, and comma-separated full citations.
- `node scripts/check_polish.mjs`, `python scripts/check_term_reader.py`, production build, and packaged coverage check.
- Structural audits of source and packaged distributions: zero errors, 102 unchanged warnings.
- Independent review requested and the reported comma-boundary issue corrected before final verification.
