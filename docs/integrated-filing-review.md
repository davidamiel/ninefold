# Combined evidence and filing integration

November 9, 2026. Local integration combines legacy-evidence commit `c1128d932b94d212f2713dc557a9fe4748567f7d` and procedural-import commit `5b4bdcea760b70fd265be01ae9e9545d34c6529a`, both based on `4d61b38`. They applied without conflicts. The procedural review's separate-pending-change description records its original standalone state; this combined tree includes that evidence recovery.

The combined content version was regenerated. No previously stored document text, source PDF, document identity, correction replacement or source offset changed. The five new filings retain 85 exact Poppler layout-extracted source pages. The importer rerun verified source hashes and was idempotent.

An independent integration reviewer verified all 102 legacy guards and new evidence records against unchanged spans and source hashes, preserved prior evidence, checked the exact five catalog additions, and independently regenerated all 85 new page strings from cached hash-matching PDFs. Nine focused evidence tests passed. Visual spot checks supported sampled legacy repairs, Verizon text/identity, the response appendix divider, and its signature limitation. This integration review did not independently redownload the official sources or redo every visual sample from the earlier reviews.

## Final checks

- 176 unit tests pass.
- Production build passes. Unrelated Firebase minifier churn from local dependency resolution was discarded; the unchanged committed vendor bundle was retained and the final tree repackaged and checked.
- Strict structural/provenance audit and document-review gate pass for both `dist` and packaged `out`.
- Inventory: 4,818 extracted files, 178,332 pages, 1,427 repairs, zero structural errors, zero warnings and zero legacy evidence gaps.
- All 10,431 document/alias IDs retain unknown full-source and citation-review status.
- Polish and packaged term-reader checks pass.

## Release limits

The evidence-only release is remote main `84f4d64d802d071e71ac3fb671c727a85fa07257`; its tree exactly matches the local evidence commit. The filing import and regenerated content version are prepared on top of that remote commit without duplicating the evidence change. These filing additions are locally integrated, not published or deployed. Browser QA remains outstanding: prior Chromium startup and its escalated retry failed with `socket() failed: Operation not permitted`. That blocked operation was not retried. Actual Reading/Original PDF switching, case navigation, and browser-rendered annotation behavior are not validated by these checks. Full transcription and citation-target review remain outside this bounded import/evidence integration. The earlier pending publication approval was not retried or bypassed during integration. No filing publication was attempted while the evidence-only Pages deployment was running.
