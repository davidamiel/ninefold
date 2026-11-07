# October Term 2025 collection — expanded core content

81 docketed matters, 6,405 unique linked documents, 2,109 extracted reader documents, 76,391 source PDF pages.

## Core coverage

All 2,012 non-auxiliary documents categorized as Certiorari, Merits, Amicus, Decision, Argument, or Lower courts have been processed. 2,008 have extracted text; 4 scan-only originals are supplied as PDFs. 0 core documents remain unavailable. Administrative filings are retained as source links and excluded from this core completeness claim.

Three stale Court URLs for the Callais post-judgment order were recovered from the Court's revised PDF; original and corrected URLs are retained.

## Relationships and decision information

Official transcript appearances identify 104 advocates across all 64 argued docket records. 885 named amicus entities/groups are connected to their filings. Case and document relationships preserve consolidated matters.

80 cases have sourced decision metadata. 31 have a verified simple tally or an expressly unanimous result. Others retain the source composition and opinion breakdown without an inferred numeric vote. Separate opinions link to their starting source page. Qualified joins are not represented as unqualified joins.

Legal areas use labeled editorial keyword classification from official questions or disposition text, with the matched text and source retained. Amicus names reflect docket-listed filing entities/groups; this is not a separate entity-resolution service.

## Sources and limits

- [Official granted/noted list](https://www.supremecourt.gov/orders/25grantednotedlist.pdf)
- [Opinions of the Court](https://www.supremecourt.gov/opinions/slipopinion/25)
- [Argument transcripts](https://www.supremecourt.gov/oral_arguments/argument_transcript/2025)
- [Argument audio](https://www.supremecourt.gov/oral_arguments/argument_audio/2025)
- Individual official docket pages and PDFs, linked per record.
- Eight statutory sections from the expressly labeled 2024 U.S. Code edition, via GPO.

Text extraction preserves source pages but is not a manual proofread or OCR service. Use the original PDF when a scan, header, footnote, or extraction artifact matters. Consolidated docket numbers are counted separately; the collection includes one case dismissed before the term and additional non-argued opinions, but not every cert denial or miscellaneous order.

## Reproduction

Set COURT_DATA_DIR to dist/data. Run import_term.py, authorities.py, finalize.py, complete.py, recover_sources.py, then merge_complete.py (which invokes enrich.py). Python requires pypdf and lxml. Network is needed only for source retrieval; cached downloads are reused. Do not deploy the raw download cache.
