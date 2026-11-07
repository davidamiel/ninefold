# Product structure

The collection is organized around cases, areas of law, justices, advocates, and amici. A term scopes the case collection; it is not a competing navigation destination. The reader is a workspace opened by a document, not a peer collection page.

## Case

Case identity, the full questions presented, sourced disposition/holding, and justice participation precede the document collection. When the source explicitly separates introductory background from the questions, that background is retained under Context from the petition. Document navigation follows certiorari, merits, amici, argument, and opinions. Lower-court opinions and appendices are distinct record sections. Administrative docket activity remains available through the official docket.

## Relationships

Cases have stable docket IDs. Documents have stable source-derived IDs and may belong to consolidated cases. Reader tabs preserve the case context from which shared documents were opened. Justices link through authorship and verified joining relationships; advocates through appearances; amici through their filings; areas through subject classifications. Profiles have a term-independent biography/portrait record in profiles.json, while participation is filtered across available terms. All nine justices and three initial advocates have sourced biographies; other advocates retain participation profiles without fabricated biographical text. Unanimous participation is derived only from an explicit unanimous Court statement, respecting named nonparticipants. Opinion summary counts deduplicate shared opinions across consolidated dockets.

The data contract keeps source provenance alongside holdings, questions, participation, and document text. A vote is not inferred from an author's name or an uncertain extraction. Fragmented opinions retain the source composition rather than being collapsed into a false majority.

## Reader

Each case owns one persistent workspace with document tabs, split view, explorer state, and references. The bottom workspace bar supports switching and closing; minimizing returns to the case. Closing a workspace does not delete annotations or recent reading. URL hash routes and browser history represent pages, profiles, sections, and active documents. Refresh and browser back/forward restore those destinations.

Opinion sections reference immutable parent text through source page and character boundaries. Original PDFs are physically sliced by source page; when two writings share a source page, the original PDF necessarily includes that complete page, while the reading view uses the precise text boundary. Existing combined documents remain available to saved tabs and annotations. Syllabi are separate from judicial opinions.

The continuous reading layer removes conservatively recognized running matter and joins PDF line wraps. A display-to-source offset map keeps annotations tied to original source characters. New notes record sourceDocId; older notes fall back to their original document ID. The same annotation can therefore appear in an original document or its split opinion. Source page markers and line-aligned margin references/notes are independent view options. Footnotes are retained; complex tables, extraction glyph defects, and footnote ordering can still require PDF inspection.

## Deployment and user data

The current app is a public static website. Firebase Authentication provides site-specific accounts; Firestore stores private per-user library records. Collection metadata and document text are separate JSON resources. Existing browser annotation keys and document IDs are preserved across revisions.


## Case workspace presentation

Case pages pair an independently scrollable summary with a document workspace on desktop; mobile stacks the summary above the document workspace. Opinions, oral argument, and briefs have distinct views. Court syllabi use the continuous reading cleanup inline. Questions preserve sourced party formulations, including separate respondents. `case-display.json` stores question provenance, valid reporter citations (including consolidated decisions), and supported disposition/beneficiary language. Emergency applications use a separate collection and omit merits-only sections. The term view defaults to one sitting, with all-cases and filter controls in the same toolbar.


## Reader interaction pass

The reader has a left explorer ordered Case, Documents, Contents, Notes, References. View and Listen are compact toolbar popovers, with format switching under View and page navigation under Contents. One open document suppresses the tab row; multiple tabs have short labels, full-name tooltips, contextual split actions and drag-to-split/reorder. Selection controls track their DOM range; reference previews dismiss on scrolling. Margin indicators are icon-only.

`reading-layout.json` preserves original raw offsets while deriving paragraph starts and conservative headings from PDF coordinates. Decision footnote blocks are displayed separately at the end of the reading text. Cross-page body text flows inline; optional source markers are positioned in the margin. This does not repair OCR defects or guarantee every unusual footnote layout.

PDF.js renders bundled originals in the app with a selectable text layer and persistent highlights/comments. PDF selections keep page-relative rectangles and, when text can be matched, original text anchors. Local PDFs include the previously split opinions and the Berk/Abouammo case records; remaining remote originals can require the filed-PDF link if their host blocks browser fetching. All source URLs and original documents remain available.

Speaker-based transcripts cover the imported 2025 and 2026 arguments. As of this update, 68 dockets have source timing; six recent arguments use untimed official speaker conversations. Speaker turns, fine-grained timestamps, and matching audio URLs come from Oyez; no audio was transcribed. Credits and the CC BY-NC 4.0 link appear at the end of each transcript. Speech narration uses selectable device voices and continuous playback, with pause/resume and text focus; hosted neural narration is not yet connected.

The document explorer presents all substantive case documents in fixed, noncollapsible sections. A timed transcript and its filed PDF share one canonical document and tab, switched through View. Legacy document IDs, tabs, and notes migrate to that document; annotations retain the source representation and navigate back to it. Reading and PDF positions are stored independently.

Contents uses source headings and short opening excerpts for numbered sections, with nested subsection labels. Page controls appear in PDF view and use the split PDF length. New notes retain the source ID and immediately focus their editor.

Case summaries flow with their contents, while the materials pane remains scrollable on larger screens. Opinion type is the primary card heading, with a smaller author byline. Whole-card hover states replace left-edge status stripes. Reader minimization is labeled, and unanchored page notes appear in the margin with previews.
Reading typography removes spurious spacing around punctuation and opening quotes, collapses repeated horizontal spaces, and expands standard ligatures while retaining source-character maps for annotations. Full reference text remains limited to imported authorities; unresolved citations offer lookup links.
The home page is a term-and-justice entry point rather than a recent-decision feed. Search opens from the navigation; reading history remains in Library and active case workspaces in the bottom dock. Emergency applications have distinct status/date controls. The decorative site footer is omitted. Justice lists use Chief Justice first, then appointment seniority. Profile photographs preserve the source image. Account controls follow Firebase Authentication state. Public reading is available without signing in; My Library and private writes require a signed-in user.

Justice illustrations are original transparent ink portraits derived from the official photographs. The directory, home page, opinion bylines, transcript turns and audio speaker use illustrationPath; individual profiles retain portraitPath. Generation prompts and reference paths are recorded in justice-art-provenance.json. Signature accents link to the source reproduction; justice-signatures.json records the original provenance and license. These are existing signature reproductions, not generated lettering. Each justice has two exact quotations from official Court opinions in justice-quotes.json, with pinpoint citations, opinion context and links. Initial choice is random per session; Another Quote cycles without navigating or losing reading state.

## Reader consistency and document structure

Reader tabs retain a stable row even for a single document. Tabs have complete shapes; menus appear on hover/focus or remain available on touch. The compact case dock toggles the active reader back to its case page. Global navigation keeps identical dimensions inside and outside the reader. Document groups are collapsible, with expansion state remembered locally. PDF View offers fit-width, fit-page and explicit zoom, without reading-only controls; fit modes reflow on resizing.

`reader-structure.json` records verified, non-destructive source-offset ranges for 19 Berk documents and the saved combined Abouammo opinion: body starts, frontmatter omissions, complete headings, specific transcription repairs, footnotes and superscript markers. Berk's cert petition now has a text asset. The raw document data remains unchanged so existing annotations keep their anchors. Other documents use conservative source-derived heading/frontmatter detection; this is not a claim that all extraction errors in the full collection have been manually checked. Notes can be edited in a dismissible passage popup. Library displays contextual previews only, filters empty legacy notes, and opens the original passage for editing.

`reference-summaries.json` supplies 12 source-backed authority previews for the Berk materials, including Erie, Hanna, Shady Grove, Burlington Northern, the Rules Enabling Act, Delaware section 6853, and relevant Federal Civil Rules. Rule/statute text is labeled as excerpts with official full-text links; summaries are not represented as full opinions. Other unresolved authorities still need additional data ingestion.

## Natural narration

The default brief narrator is Kokoro JS 1.2.1 in a dedicated module worker; no browser speech-synthesis voice is used. Runtime JS/WASM and licenses are vendored. The 92.4 MB q8 model and selected voice download from Hugging Face on first use and are cached by the browser. Generation stays on the device, uses bounded chunks and prefetches one upcoming chunk. Playback, rate, pause/resume, ten-second seeking and stop live in one toolbar strip. The selection toolbar offers Read From Here during active narration. Reporter citations, statutory/rule references and footnote text are omitted from spoken body text; displayed source remains intact. Alignment highlights the generated text chunk, not individual words. Initial voice load and generation can take several seconds, particularly on slower devices. The Oyez argument recordings retain their imported speaker timing; no new audio was transcribed.

## Reader and layout refinement

`polish.css` establishes fixed carousel and directory-card heights, independently scrolling case panels and docket lists, one-line workspace tabs, compact term selection, mobile navigation, and consistent Library sections. Search refreshes result containers without replacing focused inputs. Split panes keep separate tab rows and an explicit focus state; mobile shows the focused pane through the shared tabs.

`polish_documents.mjs` combines curated structure with conservative headings and front matter rules across 4,785 documents. First pages containing opinion text are retained; lower-court opening paragraphs begin at source offsets, not the next page. Reporter publishing notes and confirmed contents pages are omitted from reading presentation. `check_polish.mjs` checks every generated range, source-citation regressions, route renderers, timing availability, and controls. Original source JSON and annotation coordinates are unchanged.

Case names and reporter citations share one reference target. Short forms resolve from both bibliographic tables and full citations in the document body. Court-record citations can resolve against the matching circuit and entry number in imported lower-court filings. Reference previews distinguish unlinked records and citing passages from actual authority text; only substantial material offers a reader tab.

Official-recording timing is a preprocessing fallback stored in the same argument-alignment session schema. Sessions marked `speech-aligned` preserve filed speaker turns, provide per-word offsets for paragraph seeking, retain audio checksums/source spans, and use distinct provenance in the reader. Recognition/model assets never enter the static build. See README for the repeatable import and validation workflow.

## Public hosting and user accounts

GitHub Pages serves the public collection. There are no ChatGPT sign-in routes or site-wide view-access checks. `dist/account.js` loads the public Firebase web configuration and lazily initializes the bundled Firebase client. Firebase Auth tracks the actual signed-in user. Private notes, saved cases and progress live under `users/{uid}/{notes,saved,progress}`; Firestore rules enforce ownership and reject anonymous access independently of the interface. Browser-local public preferences exclude private library fields. The Firestore SDK persists pending writes locally for offline use. See docs/deployment.md.
