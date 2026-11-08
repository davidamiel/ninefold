# Case and document editor

This branch adds an administrator editor to the existing static reader. It has not been deployed or enabled for any account. See [security setup and verification](content-editor-security.md) before enabling it.

## Editing

Sign in with a content administrator account and use **Edit case** on a case page. In the reader, **Authorities → Edit authorities** opens the current document directly.

- Edit the case title, description/holding, and question labels/text.
- Add, remove, rename, and recategorize documents. New text documents can also have an optional public PDF URL. Use **Use PDF link** to compare it alongside your editable text. No upload is required or implemented.
- Create an independent editable copy of imported reading text. Original PDFs remain available beside it for comparison. PDF geometry does not constrain the edited text.
- Edit page markers and add/remove text pages.
- Use `**bold**`, `*italic*`, `<u>underline</u>` or the formatting buttons. Nested formatting and authority tokens within formatting are supported. This is a deliberately limited Markdown subset, not a full Markdown processor; arbitrary HTML is displayed literally.
- Add/edit/delete authorities. Each has a number, short editable name, and full citation used by the existing authority resolver. Insert `[@authority-id]` with **Insert**. Remove all occurrences before deleting the authority record.

Public reading shows numbered citations, the number in the margin, and numbered authority entries. Existing hover previews, source lookup, and margin notes remain. Newly added authorities resolve through the existing collection; adding a citation does not import external full text.

**Save draft** writes private admin-only content. **Preview draft** applies it only to the current page session, with controls to return to the editor or stop preview. **Publish changes** asks for confirmation and saves only explicit case-field changes, document-field changes, authored text edits, additions, and removals. Opening a document or saving a no-op form does not make its imported text independent. Imported source relationships, page ranges, transcript timing, and future corrections remain active for untouched documents. There is no revision-history feature. A saved draft older than the public record is not automatically reopened. Concurrent public changes cause publication to fail rather than overwrite unseen edits.

Removing a document deletes its record from the edited case collection and, if not shared by another case, the active reader/search index. It is not marked hidden. Publishing the edit does not purge separately bundled original PDF/text assets from static hosting. That separate operation requires a reviewed deployment.

A linked PDF remains on its original website. Direct PDF download endpoints work even without a `.pdf` suffix. A link does not automatically extract or populate editable text: paste or edit that text separately. The reader tries PDF.js when the host permits cross-origin access, then a sandboxed browser embed; some servers block embedding, require sign-in, return HTML, or use expiring links. An **Open PDF in a new tab** link is always available. HTTP sources can be blocked on an HTTPS site.

## Current limits and deployment gates

- Edited cases use bounded text chunks and an atomic manifest swap, rather than one size-limited Firestore record. The safety limit is 64 MiB per case, covering the largest measured case in this import (~11.9 MB). Pending draft/publication chunks are not publicly readable until publication. Superseded chunks are cleaned up; this is not revision history.
- Text-changing edits use an internal anchor identifier so existing notes are not silently attached to unrelated changed text. Earlier annotations are retained in the user's library but are not migrated automatically to edited wording. Metadata-only changes do not invalidate text anchors.
- No admin claims or production Firestore rules have been changed. Enabling access must be done separately through a trusted administrator environment after authorization.
- Browser/layout QA remains unverified. The current Firestore rules suite passed 14/14 emulator tests and the account/library sync suite passed 1/1, with both commands exiting successfully in an isolated local demo project. No production rules or grants were changed.

## Checks

After `npm ci`, run `npm test`, `npm run test:editor`, `npm run test:rules`, `npm run build`, `node scripts/check_polish.mjs`, and `python scripts/check_term_reader.py out`. The editor test uses a DOM harness with a mock storage adapter; it exercises controls, blocked save/close, failures, draft preview, and publication state, but does not replace real browser layout or Firebase emulator testing.


## Sparse publication safety

Published logical records use schema 2; private drafts use schema 3 with a sparse patch and an imported-base fingerprint. Imported case data is never copied into a publication merely because it appeared in the editor. A changed title does not persist its description, questions, document list, or document text. Intentionally edited text remains an independent authored version.

The build generates `data/content-base-version.json` from imported JSON and relevant reader code. Collection requests use that version in their cache key. The editor checks the fresh deployed fingerprint around text import, before publication staging, and again within the publication transaction callback. A changed or unavailable version blocks publication and asks for reload/review. A previously saved draft from a different imported base is not automatically applied. These checks reduce cross-host deployment races; they are not a distributed transaction between static hosting and Firestore.

Legacy whole-case drafts/publications are never automatically translated into sparse edits because intent cannot safely be inferred from a full snapshot. The editor warns and starts from current imported data; valid sparse publications for other cases continue to apply. The updated Firestore rules require `contentSchema: 2` on new public manifests, so older full-snapshot clients cannot replace them. Deploying those rules remains a separately authorized operation.
