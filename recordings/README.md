# Recorded documents

The website streams published MP3 files. Generation tools run locally and are excluded from the website build.

The approved voices are **Female: Sky** (`af_sky`) and **Male: Michael** (`am_michael`). A reviewed job preserves the reader's opinion wording and records the exact narration script and citation omissions. Substantive quotations, explanatory parentheticals, and the disposition remain in the script.

Mullin is the first completed document. `dist/data/prepared-documents.json` contains lightweight recording metadata and a `textPath` pointing to its clean paragraphs and mappings to original PDF text offsets. That text loads only when the document opens. Reviewed citation spans keep complete locators, publication details, and codification notes together in one reference marker; original wording remains available in its preview. Each voice has an independent sentence timeline under `dist/data/recordings/`. Audio and timeline filenames contain content hashes. The original extracted pages and PDF remain intact, so source-anchored notes continue to refer to the original document.

To generate a reviewed job, create a Python 3.12 environment and install `requirements.txt`. Download the full-precision `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the [model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0) to `scripts/cache/narration/`. The runtime is MIT licensed and the model is Apache 2.0 licensed.

Run from the repository root:

```sh
python recordings/generate.py recordings/mullin.json --voice female
python recordings/generate.py recordings/mullin.json --voice male
```

Reviewed jobs must stay under `recordings/`, models under `scripts/cache/narration/`, and outputs under `work/`. Outputs and reusable paragraph clips default to ignored `work/recordings/`. Generation never uploads or publishes files. A recording must be aligned to its reviewed text before adding it to the published inventory; sentence positions must use the corresponding original-source maps. `node scripts/check_recorded_audio.mjs` checks inventory versions, source coordinates, cue ordering, durations, and both voice timelines.

Only documents with recordings in the published inventory show audio as available. Further cleanup and generation should proceed through OT25 opinions, then OT26 merits briefs, after review of the Mullin workflow.
