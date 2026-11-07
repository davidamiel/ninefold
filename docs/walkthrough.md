# Ninefold visual and interaction walkthrough

Status: **browser verification blocked**, not passed. On 2026-11-07 the managed preview failed with `relay could not open browser port 4173: timed out waiting for relay readiness`. Direct cloud-browser navigation failed before loading the site (`Browser Use could not read requirements`); native Chromium input also failed with an unavailable AT-SPI provider. These are separate from passing source/data tests.

Use 1440×900 desktop, 768×1024 tablet, and 390×844 / 375×667 phone viewports. Include a real iPhone Safari/WebView check for safe-area insets. Do not mark a viewport passed from source inspection alone. Capture the actual viewport before and after each important interaction.

| Surface | Walkthrough and evidence |
| --- | --- |
| Home | Hero crop contains architecture, no crowd. Recent activity ends near its final row. Cycle every Cases This Term slide: the carousel's outer bounds must remain unchanged. Short and long cases scroll internally as required. |
| Cases / Orders | Header, filters, bench and register have consistent gaps. Only the register scrolls. Its lower edge remains near the dock; no inherited page-footer padding. Toggle term/all, switch every term, inspect the bench, type a query character by character, clear it, filter, and open a case. |
| Case | Long titles, summary, outcomes, opinions, majority/minority portraits and materials fit. Scroll each bounded block. Open majority, dissent, joined-by information, transcript and PDF. |
| Reader | Open 1, 2 and 6 tabs. Tabs remain one row; close and menu controls do not change widths. Split documents, switch focus and inspect sidebar context. On mobile, switch between panes without losing their positions. Toggle Reading/PDF and return. |
| Audio | For each current-term argument: play from start, jump near 25%, 50%, 75% and end via paragraph clicks, compare audible speech with the displayed official text. Check seek buttons, scrubber, volume, speed, follow toggle, speaker highlight, global playback and return-to-reader. Machine timing remains marked approximate. |
| References | Hover full case names, short forms and record references. Open a short note inline, return to list, go to citing passage; open a full source in a tab and back. |
| Library | Check empty and populated states for all three sections, equal heading gaps, visible Options text, export, saved cases, recent reading and annotations. |
| Explore | Search advocates/amici character by character; cursor remains at insertion point. Check long names, illustration proportions, compact card heights and profile links. |
| Persistent dock | Test 1, 2 and 6 workspaces, short and long case names. Single tabs do not expand. Close targets stay compact; overflow scrolls horizontally only. Check safe-area fill below the tabs on iPhone. |

Record viewport, route, reproduction steps, expected/observed behavior, and before/after screenshots for each failure. Recheck the fixed interaction and adjacent states before marking it passed.
