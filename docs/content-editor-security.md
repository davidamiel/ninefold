# Case editor storage and access

Case editing uses Firebase independently of personal notes, saved cases, and reading progress. Signing in does **not** confer editorial access. The browser refreshes the ID token and checks the exact boolean claim `contentAdmin: true`; Firestore independently requires that claim on protected requests. Neither email addresses, local storage, hidden routes, nor user-editable profiles confer access.

## Full-case storage

A single Firestore document is not large enough for legal-document editing. A local corpus measurement on 2026-11-08 found 9 of 3,181 unpacked document JSON files larger than 740,000 bytes, the largest 1,489,960 bytes. Docket 24-43 alone totals 11,911,945 bytes of unpacked document JSON. These figures cover local unpacked files only, not a collection-wide size certification.

The adapter therefore serializes the **sparse change value** into bounded, immutable JSON chunks. Each chunk has at most 65,536 JavaScript code units, with surrogate pairs kept together (at most 262,144 UTF-8 bytes). A case supports up to 64 MiB of UTF-8 JSON and 1,024 chunks, sufficient for multiple long documents. Limits prevent unbounded browser memory/read/write use rather than imposing Firestore's single-document cap on a whole case.

- `contentDrafts/{caseId}`: private admin-only current draft manifest.
- `publishedContent/{caseId}`: publicly readable current published manifest.
- `contentDraftsChunks/{caseId}/chunks/{chunkId}`: private admin-only chunk records.
- `publishedContentChunks/{caseId}/chunks/{chunkId}`: staged chunks are admin-only. An individual chunk is publicly readable **only when the current public manifest references its exact ID**. Public chunk-list queries are denied.

Public manifests additionally require `contentSchema: 2`. Draft manifest schema is `{id, format: 'chunked-json-v1', chunks: [...ordered chunk IDs], updatedAt}`. Chunk schema is exactly `{text: string}`. Manifest IDs match document IDs and contain 1–200 ASCII letters, numbers, underscores, or hyphens. Rules enforce manifest field/type/list bounds, server timestamps, chunk field/type/size bounds, and administrator authorization. Chunk updates are denied even for administrators; each new save generates a fresh random chunk set. Existing inline `{id,value,updatedAt}` envelopes remain readable, but new public writes must use schema-2-gated chunk manifests. The reader does not apply legacy whole-case overlays. New private saves use schema-3 sparse draft envelopes.

The top-level logical value remains a map of at most 500 fields. The browser validates JSON size, split count, and complete hydration. Firestore rules do not recursively validate the parsed JSON or prove that every manifest member exists: only trusted content administrators can submit a manifest, and the adapter waits for every chunk upload to be acknowledged before swapping it. The publisher validates the sparse schema before staging. Domain-specific fields and URLs still require safe text rendering; rules cannot inspect JSON inside opaque chunks.

## Atomic publication and cleanup

All new chunks upload before the current manifest changes. A Firestore transaction compares the published manifest's timestamp with the editor's reviewed version and swaps the manifest in one write. Readers see either the previous set or the new set, never a manifest assembled from partial uploads. No staged draft text becomes public before that swap.

Old sets are not retained as revision history. After a successful swap, the adapter attempts to delete the superseded manifest's chunks. Rules use existsAfter/getAfter to prohibit deleting chunks referenced by the resulting manifest, including a batch that attempts to reference and delete the same staged chunk. Public reads still check the currently committed manifest. Failed staging or a rejected publication also attempts to remove its unused upload set. A crashed tab, lost connectivity, or revoked access can leave unreachable chunks; these are private and not a publicly accessible old version. Cleanup failure emits `content-cleanup-warning` and does not turn a successful publication into a reported publish failure. A future authorized maintenance tool can remove orphaned chunks after checking current manifest membership; no such job is installed here.

Old chunk access can be revoked while a public reader is fetching them. The public loader retries the **entire manifest-and-chunk read once** and only returns complete envelopes. If the second attempt fails, it rejects with `content/load-failed`; callers must not partially apply the failed result. Ten chunks at a time are fetched or uploaded to bound parallelism and write-batch size.

Draft saves are last-write-wins atomic manifest replacements. Published writes additionally enforce optimistic conflict checks. Draft saving never publishes; publishing never deletes the current draft. Account changes clear publication baselines and interrupt protected operations, but cannot undo an already-sent commit. Server reads avoid treating offline cache as a fresh review; pending SDK uploads can remain queued offline, so do not label them saved before acknowledgment. The existing persistent SDK cache remains enabled for personal-library compatibility; consider cached device data on shared computers.

## Adapter contract

The account API remains unchanged:

- `isAdmin()`: resolves a refreshed claim check; token/network failures reject.
- `loadContentDraft(caseId)`: full `{id,value,updatedAt}` envelope or `null`, while recording the current publication conflict baseline.
- `saveContentDraft(caseId, value)`: saves all chunks plus the private manifest and returns a fully hydrated envelope.
- `loadPublishedContent()`: publicly reads and hydrates all current publications, returning full envelopes and recording conflict baselines.
- `publishContent(caseId, value, expectedUpdatedAt?, beforeCommit?)`: accepts a validated sparse schema-2 value, stages chunks and swaps the manifest transactionally after the optional fresh-base check; resolves without a return value. The optional baseline is a timestamp or `null` for expected absence; omission uses the recorded baseline.

Missing baseline: `content/not-loaded`. Changed publication: `content/conflict`, without changing the existing publication. Reload and review before retrying; do not automatically adopt a new baseline. After success, reload publications before another publish. Existing owner-only personal-library permissions remain unchanged; an editor gains no access to another user's library.

## Setup and verification boundary

This implementation assigns no claim, deploys no rule, and performs no remote publication. The project owner must separately authorize role assignment and deploy reviewed rules. Claims belong in trusted administrative tooling, never the browser. Existing issued tokens may remain valid until expiry after role removal; refreshing this browser's token does not revoke every token immediately.

- `node --test tests/content-storage.test.mjs`: isolated adapter checks, including multi-megabyte two-document round-trip, surrogate-safe splitting, superseded-set cleanup, conflicts, and bounded hydration retry. No credentials or remote writes.
- `npm run test:rules`: emulator tests for public/private access, claim types, envelope bounds, immutable staging, current-manifest membership, cleanup guards, and existing library isolation.
- `npm run test:sync`: existing account/library emulator lifecycle checks.

The actual rule suite requires Firebase CLI, rules-unit-testing, Java, and the emulator runtime. SDK-double tests do not certify server rules. Run the emulator suite before any deployment.

Verification on 2026-11-08: the current rules suite passed 14/14 tests and account/library sync passed 1/1 using official local emulators with project `demo-ninefold`. Both command wrappers exited 0. Tested rules and test-file hashes matched the committed source. This verifies the local emulator runs, not production deployment or real-browser behavior.
