# Developing Ninefold

Developer setup, implementation notes, and content maintenance for [Ninefold](../README.md).

## Run

Install dependencies and build the production files, then serve `out/` over HTTP:

```sh
npm ci
npm run build
python -m http.server 8765 --bind 127.0.0.1 --directory out
```

Open the local address in a browser. GitHub Actions publishes `out/` to GitHub Pages only when manually requested from the Actions tab. See [deployment setup](deployment.md) to connect Firebase.

## Functionality

- Searchable cases scoped to a term, with optional argument-month filtering and docket identifiers.
- Case overviews with full questions presented, sourced holdings and opinion composition; one document section displayed at a time.
- Areas, justices, advocates, and amici directories with participation-based profiles linked to cases.
- A homepage, browser-history-aware navigation, and case-specific reading workspaces that can be minimized, resumed, or closed from the bottom bar.
- User-opened, closable document tabs with single and split views; each document retains its scroll position.
- Sourced justice biographies and portraits, initial advocate biographies, and written/joined opinion participation with term filters.
- Separate opinion sections and PDFs, continuous reading text, optional source-page markers, and passage-aligned margin notes/references. Original annotation offsets survive the reading transform.
- Original PDFs embedded in the same reading pane, including scan-only documents.
- Compact explorer modes for case documents, source-page outline, retained references, annotations, case information, viewing options, and audio.
- Text-selection highlights in four colors; comments anchored to selected source ranges; page notes; annotation deletion and export.
- Firebase accounts with Google or email/password sign-in. Saved cases, recent reading, highlights, comments, and positions sync to owner-only Firestore collections after Firebase is configured. Public reading requires no account.
- Conversational oral-argument transcripts for both imported terms. Oyez supplies source timing for 68 dockets; six recent arguments use speech alignment against the official Court recordings. Click timed paragraphs to seek; the elapsed-time control switches to a scrubber.
- Citation previews for locally resolved authorities, retained references, floating references, and opening references beside the main document. Unresolved authorities are identified explicitly and offer source lookup. No automated holding summaries are generated.

## Data

`dist/data/catalog.json` contains case records and indexed filing metadata. `data/docs/` contains actual PDF text extraction by source page. `catalog.coverage` and the source report describe exact scope, extraction counts, and limitations.

The roster is the union of the official granted/noted argument list and the Court's opinions index. Consolidated docket numbers remain separate; shared documents can occur under multiple cases. It does not claim to include every certiorari denial or every order issued during the term.

Document pages retain extracted text and source links. PDF layout, scanned material, footnote placement, and tables may require the original. Added statutes show their source edition; it should not be assumed to be the governing version for every dispute.

## Architecture

Static HTML, CSS, and JavaScript with editable JSON content, deployed on GitHub Pages. Firebase handles identity and private account storage. Public UI preferences stay in localStorage; private notes, saved cases and progress use Firestore with persistent offline caching. No user data is committed with source. `app.js` escapes content before rendering and only offers HTTP(S) source URLs.

Highlights use source document ID plus page index, character range, and selected quote. Future extraction changes should version documents and migrate anchors rather than silently changing their text beneath saved annotations.

## Next development work

additional advocate biographies, robust historical statute selection, broader case-citation resolution and attributed case previews, font/glyph and footnote-aware extraction, accessibility expansion, and offline document bundles.

## Verify and package

Run `node scripts/polish_documents.mjs` to derive conservative source-offset metadata, `node scripts/check_polish.mjs` for interaction/content regressions, and `python scripts/check_term_reader.py` for material coverage. `python scripts/build_site.py` writes the deployable `out/` tree; check it with `python scripts/check_term_reader.py out`. Source text remains unchanged.

Advocate illustrations retain PNG masters in source and use 512-pixel WebP delivery copies. The release excludes illustration masters to stay within hosting limits without dropping documents.

### Official-recording alignment fallback

For argued cases without an Oyez timed transcript, `scripts/export_argument_turns.mjs` exports the filed transcript's cleaned speaker turns and source offsets. The CPU-only pipeline uses the exact Supreme Court MP3, recognizes word timing with faster-whisper, and aligns those words to the official text with edit-distance matching. Recognition never replaces the official wording. Brief unmatched spans interpolate between audio anchors; long unmatched passages fail validation and require local re-recognition. The reader identifies these timestamps as approximate.

Install `scripts/alignment-requirements.txt` in a separate virtual environment; FFmpeg must be available. Keep downloaded MP3s, model weights and recognition caches outside `dist/`:

```sh
node scripts/export_argument_turns.mjs /workspace/ninefold-alignment/official-turns.json
python scripts/recognize_arguments.py --work /workspace/ninefold-alignment
python scripts/align_official_arguments.py --work /workspace/ninefold-alignment
# For a failed span, use refine_argument_timing.py with --docket, --start and --end.
python scripts/align_official_arguments.py --work /workspace/ninefold-alignment --publish-data
python scripts/check_argument_alignment.py --official /workspace/ninefold-alignment/official-turns.json
```

`official-alignment-report.json` records coverage and gaps; each session records its MP3 SHA-256, model and source provenance. Subsequent Oyez imports retain established official sessions so document IDs, wording and annotations stay stable.

Run `npm test` for public-mode checks and `npm run test:rules` for Firestore ownership, anonymous access, and malformed-write tests using the local emulator.

## App icons

The favicon and installable app icons use the original folded-page mark in `dist/brand/ninefold.svg`, with the app's dark header color behind it. `favicon.svg` is the tab icon; `app-icon.svg` is the source for the 180-, 192-, and 512-pixel PNGs; `app-icon-maskable.svg` adds safe-area padding for platform-shaped icons. The ICO contains 16-, 32-, and 48-pixel fallbacks.

Render the SVG sources with Inkscape, then resize with a high-quality resampler if needed. Keep PNG backgrounds opaque. `dist/site.webmanifest` uses relative paths so both the GitHub Pages project path and local previews resolve correctly. Its standalone display mode is presentation only; no service worker or offline document bundle is included.

Check tab icons, iOS Add to Home Screen, and Safari Add to Dock after deployment. Browsers can retain old icons until an existing shortcut is removed and added again.

## Document-quality review

Follow the [document-quality standards](document-quality.md) for source verification, correction evidence, immutable annotation anchors, and repeatable audit commands. The [Jackson source review](jackson-source-review.md) records the bounded PDF review behind the recovered glyph fixes. Passing structural checks is not collection-wide certification.

### Narration engines

Listen → Voice Engine offers the existing local Kokoro natural voices and an
optional browser Device voice mode. Device mode avoids the neural model download
and synthesis on the user's device. Its voice list comes from SpeechSynthesis;
availability and quality vary by browser and OS. The menu identifies local and
online voices; online voices may transmit text to their provider. Automatic
selection uses only local English voices. If none is ready, the reader pauses
and asks the listener to select an available voice or retry. Online voices must
be selected explicitly.

Device narration uses short passages and source-coordinate highlighting. Previous
and Next move by passage, not seconds. Pause cancels speech and resumes from the
last boundary reported by the browser, or the passage start if boundaries are
unavailable. Exact audio-time seeking, downloadable device-voice audio, and
background/lock-screen continuity are not promised. Real-device verification is
required, particularly on iOS and Android. Switching to Device voice releases the
Kokoro worker. Natural voice keeps its existing playback controls and Michael
American male voice.

Generated natural audio is currently retained only for the active narration
session, not persistently stored. Persistent audio caching or pre-generated
collection audio would require a separate size-limited, versioned storage design.

The current foreground natural voice wait has a 90-second preparation deadline;
background lookahead has none. A newer seek supersedes the previous deadline. If model loading,
queueing, or inference exceeds that deadline, the worker is terminated and pending
requests are cleared so a retry starts cleanly. The reader suggests Device voice.
This is recovery from excessive waiting, not a guarantee of real-time synthesis.
The worker yields between chunks so cancellation and seek-priority messages can
be handled before another lookahead clip starts.
