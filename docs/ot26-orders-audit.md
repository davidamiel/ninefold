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

Install the fully resolved, hash-locked Python dependencies from `scripts/requirements-orders.txt`. Both requirement files enforce binary-only packages and SHA-256 verification; the runtime lock includes transitive dependencies and the development lock adds Ruff. The original audit used `/tmp/ninefold-orders-audit`. Following the importer security review, commands use private, ignored directories under `scripts/cache/` instead; they do not automatically trust or migrate the old shared temporary cache. All three commands accept the same `--cache NAME`, which selects a snapshot name, not an arbitrary path. Retain a snapshot to resume it, or choose a new name for a fresh audit. The application scan requests docket pages with five workers and retains errors for explicit review.

```sh
python -m pip install --require-hashes --only-binary :all: -r scripts/requirements-orders.txt
python scripts/import_court_orders.py --term 2026 --cache ot26-refresh
python scripts/audit_application_dockets.py --cache ot26-refresh
python scripts/reconcile_emergency_applications.py --cache ot26-refresh
python -m unittest discover -s scripts -p test_order_imports.py
python scripts/check_orders.py
python scripts/check_term_reader.py dist
npm run build
python scripts/check_term_reader.py out
node scripts/check_pages_artifact.mjs
```

Review changes before release, especially renewed applications, interim relief, source failures, and source-index counts. The status parser is an import aid, not a substitute for reading ambiguous proceedings. The application audit's added-record list is relative to the input collection at the time of that run.

Browser review covers desktop, 390px/320px mobile, short landscape, keyboard disclosures and focus, search/type/outcome/sort filters, empty results, loading failure and Retry, related-case navigation, the reader's document explorer, reload/restoration, and minimizing back to Orders. Source integrity checks run during deployment.

## Importer security and reliability checks

Cache directories must belong to the current user and exclude other users. Reads reject symlinks, hardlinks and nonregular files; writes atomically replace cache entries using private files and directory descriptors. Docket IDs and cache names are validated before they enter paths, and generated document paths must remain inside the output tree. Downloads use official Court HTTPS URLs and write bytes through the cache helper rather than giving curl a destination filename. Failed downloads do not become successful cache entries.

Missing captions, malformed proceeding cells, invalid dates, and empty histories become explicit unresolved records. Reconciliation retains an existing case when its new source page cannot be parsed. Label parsing uses normalized strings rather than ambiguous whitespace expressions. Application status interpretation has separate, tested disposition and renewal logic. Import modules perform no network or filesystem work merely by being imported.

Pull requests run the importer regression tests, formatting, lint and complexity checks through `.github/workflows/order-imports.yml`. The regression suite covers the reported path and parsing issues, cache permissions and links, interrupted downloads, long adversarial text, revised opinions, delayed docket updates, and the saved audit's application statuses. The November 12 refactor was also replayed against the saved official responses to compare imported output with the published snapshot.

### Updating dependency locks

Treat both requirements files as locks, including transitive packages. Resolve candidate versions using binary wheels only, pin every dependency with `==`, and record SHA-256 hashes for the reviewed wheel artifacts of each release. Never add source-distribution hashes or remove hash checking to make an update install. Keep the development lock including the runtime lock. Verify a clean installation with `--require-hashes --only-binary :all:`, run `python -m pip check` and the importer tests, and confirm that the Python 3.12 Linux CI runner resolves the same locked dependency tree. Current wheel hashes support the local macOS environment and the Linux CI runner. This follows [pip’s secure installation guidance](https://pip.pypa.io/en/stable/topics/secure-installs/).
