# Recorded documents

The website streams published MP3 files. Generation tools run locally and are excluded from the website build.

The approved voices are **Female: Sky** (`af_sky`) and **Male: Michael** (`am_michael`). A reviewed job preserves the reader's opinion wording and records the exact narration script and citation omissions. Substantive quotations, explanatory parentheticals, and the disposition remain in the script.

`dist/data/prepared-documents.json` contains lightweight recording metadata and a `textPath` pointing to clean paragraphs and mappings to original PDF text offsets. That text loads only when the document opens. Each distinct reviewed citation has its own reference; a citation spanning PDF pages remains one reference with its complete locator and publication details. Each voice has an independent sentence timeline under `dist/data/recordings/`. Audio and timeline filenames contain content hashes. The original extracted pages and PDF remain intact, so source-anchored notes continue to refer to the original document.

To generate a reviewed job, create a Python 3.12 environment and install `requirements.txt`. Download the full-precision `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the [model release](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0) to `scripts/cache/narration/`. The runtime is MIT licensed and the model is Apache 2.0 licensed.

Run from the repository root:

```sh
python recordings/generate.py recordings/mullin.json --voice female
python recordings/generate.py recordings/mullin.json --voice male
```

Reviewed jobs must stay under `recordings/`, models under `scripts/cache/narration/`, and outputs under `work/`. Outputs and reusable paragraph clips default to ignored `work/recordings/`. Generation never uploads or publishes files. A recording must be aligned to its reviewed text before adding it to the published inventory; sentence positions must use the corresponding original-source maps. `node scripts/check_recorded_audio.mjs` checks inventory versions, source coordinates, cue ordering, durations, and both voice timelines.

Only documents with recordings in the published inventory show audio as available. Preparation covers OT25 Court opinions, concurrences, dissents and other published judicial writings, followed by OT26 merits briefs.

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
its name and link. Read descriptive section headings; omit outline labels alone. Explicit pronunciation replacements change speech only.

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
actual model files, runtime versions and synthesis settings. If source mappings or metadata change while the entire spoken script, voice,
model and verified audio bytes remain identical, generation reuses that recording;
alignment must still rebuild and validate its cues for the new source version.
Transcription caches
are keyed by the MP3 and alignment settings. Staging requires both approved
voices and matching text, audio hashes and cues, then replaces the public
inventory last. These commands never upload or deploy. Review the resulting
reader and playback in desktop and mobile browsers before publishing.

## Continuous batches

Reviewed jobs live under `recordings/jobs/`, `jobs-separate/`, and
`jobs-separate-extra/`, `jobs-separate-remaining-a/`, and
`jobs-separate-remaining-b/`. Drafts stay `reviewed:false`; finish source, citation and
pronunciation review before setting `reviewed:true`. Freeze a reviewed file while
its audio is being generated.

The batch command processes ready jobs with one generation worker, skips already
staged matching versions, resumes validated clips/recordings, and records progress
under ignored `work/recordings/`. A failed alignment holds that writing for review
and the next ready job continues. Source-only footnotes may be explicitly marked
`citationOnly:true`; their references remain individually available in the reader.

On Apple Silicon, install `mlx-requirements.txt` and `alignment-requirements.txt`
in a Python 3.12 environment. The GPU uses the same Kokoro Sky and Michael voices.
Download the files/revision recorded in `mlx-model.json` to
`scripts/cache/narration/mlx-kokoro/`, and install spaCy's `en_core_web_sm` 3.8.0
English language model. All of these dependencies stay on the generating computer.

```sh
python recordings/batch.py recordings/jobs recordings/jobs-separate recordings/jobs-separate-extra \
  recordings/jobs-separate-remaining-a recordings/jobs-separate-remaining-b \
  --engine mlx --alignment-device mps --parallel-align
```

Run the batch with the Python executable from the environment containing both
the generation and alignment requirements; every stage uses that same environment.
For CPU generation, install `requirements.txt` and `alignment-requirements.txt`
in the same environment.
GPU access must be available to the process. CPU alignment is the portable default; `--alignment-device mps`
uses Apple's GPU for acoustic transcription. `--parallel-align` checks the two
independent voice recordings concurrently and stages only after both succeed;
generation still uses one worker. CPU-only generation remains
available with `--engine onnx` and the original requirements/model files.

Alignment uses acoustic transcription without the expected script as a prompt.
Only unclear paragraphs are transcribed again in isolation; coverage checks stay
in force. Number spellings and close ASR spellings are matched for timing without
changing the reader or narration. Identical writings appearing under consolidated
dockets share the staged recording only after their original text and ranges match.

## Media publication and coverage

Recordings stream from content-addressed GitHub release assets, outside the
Pages deployment bundle. Local generation and staging never upload anything.
After creating a public `recorded-audio-ot25` media release, explicitly run:

```sh
python recordings/publish.py --tag recorded-audio-ot25
```

The publisher checks the local MP3 against its sentence cues, uploads missing
immutable assets, and verifies GitHub's SHA-256, byte size, upload state and URL
before replacing inventory URLs. It records those proofs in
`dist/data/recorded-assets.json`. Uploads never overwrite existing assets or deploy
the app. Failed uploads leave current playback URLs intact; rerunning resumes
from verified uploads. The Pages build excludes hosted copies. The player
declares `audio/mpeg` explicitly so WebKit can stream release downloads even when
the redirect advertises a generic binary media type.

`ot25-sources.json` records the Court's public indexes and reviewed source
revisions. `ot25-plan.json` lists individual writings and consolidated aliases.
Run `python recordings/check_coverage.py --require-complete` before declaring
the term complete. This requires source-index coverage, a reviewed preparation,
both voices and the current text version for every target. Its detailed work
list stays under ignored `work/recordings/`.

Author corrections from a later official edition use exact source-mapped
repairs and a checksum-bound `revisionSource` PDF. They never silently replace
the raw extraction used by annotations or sentence cues.

Original diagrams and photo appendices are registered in `figures.json` and
extracted by `extract_figures.py`. The reader lazily loads the exact embedded
JPEG streams and keeps each caption once; its image links open the source image.
Writing PDF slices preserve source drawing streams, embedded images, page boxes
and rotation as well as text. Keep any non-text appendix pages when choosing a
writing's final PDF page; its last text block alone does not establish that end.

Narration includes a character map back to the clean reader text, including
explicit pronunciations and omitted citations. For a source-range correction
that leaves the recording version and entire script unchanged, use
`python recordings/remap_cues.py path/to/reviewed-job.json`, then stage the job.
This validates the exact sentence sequence and both audio hashes and changes
source ranges, preserving acoustic timestamps and coverage checks. If an
abbreviation fix joins adjacent sentence fragments, it may coalesce those exact
verified cues using their existing outer boundaries; it never splits or invents
a timing.

Preparation and acoustic alignment retain Python character offsets. Staging
exports browser UTF-16 offsets when supplementary Unicode characters occur,
including in citations and source ranges. Private alignment inputs stay intact;
ordinary OT25 documents retain identical public payloads.
