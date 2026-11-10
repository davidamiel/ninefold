# OT26 intake and audio

## Current state

scripts/import_term.py is a manual OT2025 bulk importer. It hard-codes the 2025
granted/noted roster, opinions index, transcripts and audio index. Its URL cache
has no expiry. Re-running it is not a reliable current-term update mechanism.
There is no verified scheduled OT26 intake pipeline. Do not run it against live
dist/data to refresh content: it rebuilds the catalogue and can reuse stale sources.

## OT26 process

1. Track the granted/noted roster and individual dockets for OT26 cases, including
   cases whose docket numbers begin 24 or 25. Docket year is not argument term.
2. Check the official opinions, orders, opinions relating to orders, and
   in-chambers indexes. Orders and opinions are separate feeds.
3. For case dockets, collect newly linked briefs, petitions, replies, appendices,
   questions presented and official argument recordings/transcripts.
4. Stage new source URLs and metadata without replacing corrected reading text.
   Revalidate changing HTML indexes instead of using permanent cache hits.
5. Preserve the source PDF; review/correct extracted reading text in the editor.
   Publish text when ready, export the narration plan, and generate local audio.
6. Attach the resulting audio and timing manifest only after listening to a sample.
   Initial PDF availability need not wait for text cleanup or audio generation.

Recommended cadence: hourly checks while active, plus a manual refresh on release
days. Discovery should not trigger a website deployment for each PDF. Batch approved
content changes. This is a proposed operating process, not an installed scheduler.

Official sources:
- https://www.supremecourt.gov/orders/26grantednotedlist.pdf
- https://www.supremecourt.gov/opinions/slipopinion/26
- https://www.supremecourt.gov/orders/ordersofthecourt/26
- https://www.supremecourt.gov/opinions/relatingtoorders/26
- https://www.supremecourt.gov/opinions/inchambers/26
- https://www.supremecourt.gov/docket/docket.aspx
- https://www.supremecourt.gov/oral_arguments/argument_transcript/2026
- https://www.supremecourt.gov/oral_arguments/argument_audio/2026

The Court's docket pages offer email subscriptions for individual cases.
No subscriptions or outbound messages were created by this change.
