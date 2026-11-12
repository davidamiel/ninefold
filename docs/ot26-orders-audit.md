# OT26 Orders audit — November 12, 2026

Ninefold's Orders section now separates **Court Orders**, a document inventory, from **Emergency Docket**, application records with their proceedings and available documents. General order lists include certiorari decisions and procedural business; they are not all emergency-docket material.

## Published order documents

All documents listed on the following official OT26 indexes at the audit time were reconciled:

| Official source | Imported documents |
| --- | ---: |
| [Orders of the Court](https://www.supremecourt.gov/orders/ordersofthecourt/26) | 17: four order lists and thirteen miscellaneous orders |
| [Opinions relating to orders](https://www.supremecourt.gov/opinions/relatingtoorders/26) | 4 |
| [Opinions of the Court](https://www.supremecourt.gov/opinions/slipopinion/26) | 1 opinion on an application |
| [Orders by circuit](https://www.supremecourt.gov/orders/ordersbycircuit/26) | Four alternate arrangements linked from the corresponding order lists |

The resulting inventory contains **22 distinct PDFs**, preserved in full with source URLs, SHA-256 checksums, and reader text retaining page boundaries. Circuit arrangements are HTML reports, not additional PDFs. Scanlan's revision link is a changes document, so it does not replace the complete opinion. This inventory covers published documents on these indexes, not every individual Justice's action appearing only on a case docket.

## Application reconciliation

Discovery checked **2,400 IDs**, bounded to **26A1–26A750** and **25A1–25A1650**. The importer selected substantive applications for stays, injunctions, and related relief with activity since October 5, 2026, unresolved applications carried forward, and existing OT26 collection entries. Routine time-extension requests are excluded. Public filing imports omit service and word-count certificates.

**37 application records were added**, bringing the OT26 view to **63**. **11 have no final disposition recorded** in the checked proceedings, including renewed applications after an individual Justice's denial. Administrative stays are not treated as final dispositions. Today's published Pavatt order denies application 26A661; that source supplements its docket page, which had not yet recorded the decision.

**Emergency coverage is not certified complete.** Access errors left **229 older docket pages unresolved**, and **55 linked filing PDFs could not be retrieved**. Direct docket URLs, alternate casing, and the official search wrapper did not resolve the older-page failures. Existing 25A1353 material remains available, but its docket was among those that could not be refreshed. The bounded scan also does not establish coverage outside its ranges. Unavailable filings are recorded in data rather than displayed as empty document tiles.

Machine-readable evidence: `dist/data/court-orders.json` records publication sources and inventory; `dist/data/orders-coverage.json` records checked ranges, included applications, new records, pending records, unresolved docket IDs, and failed public filing URLs. These are dated snapshots, not a live completeness guarantee. Historical emergency collections remain selected collections; this audit does not claim an exhaustive OT25 Orders archive.

## Reproduction and checks

Use Python with `beautifulsoup4` and `pypdf`. Importers cache official responses under `/tmp/ninefold-orders-audit`; retain the cache to reproduce this snapshot, or remove it before a fresh audit. The application scan requests docket pages with five workers and retains errors for explicit review.

```sh
python scripts/import_court_orders.py --term 2026
python scripts/audit_application_dockets.py
python scripts/reconcile_emergency_applications.py
python scripts/check_orders.py
python scripts/check_term_reader.py dist
npm run build
python scripts/check_term_reader.py out
node scripts/check_pages_artifact.mjs
```

Review changes before release, especially renewed applications, interim relief, source failures, and source-index counts. The status parser is an import aid, not a substitute for reading ambiguous proceedings. The application audit's added-record list is relative to the input collection at the time of that run.

Browser review covers desktop, 390px/320px mobile, short landscape, keyboard disclosures and focus, search/type/outcome/sort filters, empty results, loading failure and Retry, related-case navigation, the reader's document explorer, reload/restoration, and minimizing back to Orders. Source integrity checks run during deployment.
