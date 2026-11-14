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

## Reviewed OT25 preparation

`abouammo.json` records the exact source ranges, checksums, extraction repairs,
paragraph boundaries and reviewed citation spans for the Court's opinion. Its
substantive footnotes occur at their markers in both the reader and narration;
the script says “Footnote 1: … End footnote 1.” A note continuing onto another PDF
page remains one note. Syllabus, counsel listings and publication furniture stay
in the original source; the document information panel identifies argument counsel.

Use the following stages for another reviewed writing. Keep the complete body,
substantive quotations, explanatory parentheticals and footnotes; omit source
locators from speech. A statute used as the subject or object of a sentence keeps
its name and link. Explicit pronunciation replacements change speech only.

```sh
python recordings/prepare.py recordings/abouammo.json
python recordings/generate.py recordings/abouammo.json --voice female
python recordings/generate.py recordings/abouammo.json --voice male
python recordings/align.py recordings/abouammo.json --voice female
python recordings/align.py recordings/abouammo.json --voice male
python recordings/stage.py recordings/abouammo.json
node scripts/check_recorded_audio.mjs
python -m unittest discover -s recordings -p 'test_*.py'
```

Preparation rejects a changed source or any unaccounted-for source words. Every
excluded source range and citation remains inspectable in the job. Review
`work/recordings/<documentId>/reader.txt` and `spoken.txt` against the original PDF
before generating. Alignment additionally requires `alignment-requirements.txt`
and the locally cached Whisper `base.en` model. It transcribes the produced audio,
checks word and sentence coverage, and retains original PDF coordinates for
highlighting and seeking. Coverage is a diagnostic and does not replace a review
of the text or audio.

Generation resumes from validated paragraph clips keyed by the voice, text,
actual model files, runtime versions and synthesis settings. Transcription caches
are keyed by the MP3 and alignment settings. Staging requires both approved
voices and matching text, audio hashes and cues, then replaces the public
inventory last. These commands never upload or deploy. Review the resulting
reader and playback in desktop and mobile browsers before publishing.
