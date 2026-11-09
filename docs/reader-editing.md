# Reader-native editing

Signed-in content administrators use **Edit** in the reader toolbar. Editing happens in the same continuous reading surface, seeded from the current rendered text, including corrected text, headings, references and footnotes. No independent text-version creation or page-at-a-time text editor is exposed.

- Select text normally, then use Bold, Italic or Underline. Selection and deletion may span the whole document.
- Reference numbers stay in the text. Place the cursor inside one and choose Edit reference to change its short name or full citation. Add reference inserts a new marker. Deleting a reference's text removes it from that document's stored reference list.
- Existing source page markers can be edited. Page marker inserts an inline source-page cue; it does not create another text page.
- Show source PDF opens comparison alongside the reader; the explicit link can open the PDF separately.
- Save changes publishes the same document in the public reader after confirmation. Cancel discards unsaved edits. An unchanged save publishes nothing.
- Case metadata and document removal remain in Edit case. New document metadata must be published before opening that document in the reader.

The stored reader is a constrained, escaped structural tree, not arbitrary HTML. It preserves semantic reader wrappers and reference identity. Generated margin controls and private highlight/comment markup are not published. Changes use the existing sparse case patch, administrator checks, publication conflict checks and imported-base version checks. Unchanged documents remain source imports. Text annotations on an edited document use a new revision namespace, so old source-offset annotations are retained in the account rather than silently moved to different text.

## Verification

`npm test` includes structural round-trip, sanitization, sparse change/deletion and editing-navigation tests. `npm run test:editor` includes both case metadata and reader editing UI regressions.

For real-browser QA, `tests/reader-native-browser.mjs` exercises the actual collection and reader through Chromium with local-only account/storage interception. It requires Playwright and a compatible local browser. Use an isolated local test server; test publications must not reach production Firebase.
