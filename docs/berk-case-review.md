# Berk v. Choy review — November 10, 2026

**The validated corrections are published and production-verified. The case-wide source and citation review remains partial.**

## Published corrections

The earlier repair corrected 68 transcript page labels, 11 heading anchors, six heading labels, two quotation spans, overview spacing and document/docket titles.

The followthrough adds 37 guarded appendix display repairs, separates 12 source-verified footnotes from main prose, and fixes six same-length opposition-cover casing errors. Appendix raw text and source offsets remain unchanged. Reference fixes recognize supported named short forms, correct 13 Supreme Court rule references, suppress three ambiguous/other-court rule matches, reject five false appendix links and fix three split-digit pinpoint spans. Exact Pledger and Young index entries route existing uniquely identified citations to their verified official opinions; Gallivan remains unresolved.

Published product: [8f4e8c5dbb4ed43f45f3ca5fbd25858aeb9703ef](https://github.com/davidamiel/ninefold/commit/8f4e8c5dbb4ed43f45f3ca5fbd25858aeb9703ef). [Production site](https://davidamiel.github.io/ninefold/).

## Evidence and coverage

The [case ledger](../reviews/berk-case-review.json) inventories all 70 indexed documents: 24 extracted documents totaling 1,124 pages, 46 original-only PDFs totaling 94 pages, plus three opinion aliases. Twenty-three extracted documents match their complete official PDF text layers under documented normalization. The opposition remains an explicit comparison exception: cover casing is now source-corrected, while cover reading order/layout is not certified. Normalization ignores whitespace/hyphenation and is not visual proof.

- [Visual exception evidence](../reviews/berk-exceptions-visual-evidence.json): actual raster inspection of appendix PDF pages 4–13 and opposition PDF page 1. The remaining 50 appendix pages and 40 opposition pages are visually unreviewed.
- [Original-only visual evidence](../reviews/berk-originals-visual-evidence.json): all 19 pages of the 16 zero-text and one garbled original-only PDFs actually inspected, with PDF/image hashes. Those 17 documents have source-only visual review; this is not extracted-reader or citation certification. The other 29 originals have not received that visual review.
- [External-source identity review](../reviews/berk-external-source-review.json): the earlier 227 external-source occurrences covered 73 destinations. Seventy-one case identities were corroborated with authoritative PDFs, one with an official index, and the appendix identity checked separately. Individual endpoint accessibility and full proposition/pinpoint correctness are not certified.
- [Common circuit-authority review](../reviews/berk-common-circuit-reference-review.json), [routing evidence](../reviews/berk-circuit-source-routing.json), and [rule/span corrections](../reviews/berk-reference-followthrough.json) retain their exact bounded source evidence.

The global review ledger is not upgraded to full review. All case-wide completion claims remain withheld.

## Execution and live identity

[Integrated validation](https://github.com/davidamiel/ninefold/actions/runs/42756784017) and the fresh publication build passed all 309 tests, source/packaged audits, build, term-reader checks and Chromium smoke across 27 documents/aliases. Targeted browser checks confirmed all 12 note bodies remain readable and excluded from prose, all 12 markers render, and repaired cover names remain at their original offsets. A reviewer actually inspected two reader screenshots: corrected appendix text and the working footnote 1 popup. That inspection does not extend to every rendered page.

[Fresh publication run 42757176646](https://github.com/davidamiel/ninefold/actions/runs/42757176646) deployed successfully at 04:41:09 UTC. Its overall workflow concluded with a failure because the first production scan could not load Russello. The following read-only diagnostic established that both the real content-version URL and cache-bypassed URL returned HTTP 200, gzip bytes and JSON matching the repository source; no product changes or republishing occurred.

[Final production verification 42757765514](https://github.com/davidamiel/ninefold/actions/runs/42757765514) passed. It verified the published manifest's exact product commit and independently fetched and SHA256-matched actual `index.html`, `app.js` and `reader-authorities.js`. It then passed the 27-document reader scan. [Production evidence artifact](https://github.com/davidamiel/ninefold/actions/runs/42757765514/artifacts/13735864238).

The prior parser deployment's two timeouts remain historical in the [deployment diagnosis](berk-deployment-diagnosis.md); the fresh validated artifact resolved publication. Manual-only publishing was restored at `9fb8793a656aef4dd171432529609b459138fe06`, retaining validation checks. That later evidence/workflow commit is not the deployed product commit.

## Current reference queue and remaining work

The refreshed [production reference queue](../reviews/berk-reference-queue.json) records 741 occurrences without an internal document target: **428 lookup-required and 313 external-source-only**, representing 700 distinct source locations after alias deduplication. Counts include opinion aliases. Source pages are zero-based indices and offsets are raw UTF-16 positions. The prior live lookup-required count was 544.

All 130 referenced internal documents loaded and 221 located target pages were in bounds, with zero structural failures in the final scan. These checks do not prove citation semantics or pinpoint correctness.

Known visual gaps include inline printed folios 2a/3a, the unreviewed appendix PDF page 3 asterisk footnote in main flow, remaining page/layout/footnote inspection, and full opposition-cover ordering. Source discrepancies such as the question sheet's decision citation and errors printed in the DRI brief are retained rather than silently rewritten. Continue the recorded page-by-page review and the unresolved-reference queue; do not treat this bounded release as a completed case audit.
