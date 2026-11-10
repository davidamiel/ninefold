# Ninefold Mac audio kit

Clean up and save the document's reading text before generating final audio.
No PDF editing or extraction happens in this kit.

Download setup.command to Downloads. Install Homebrew from https://brew.sh if needed.
Run in Terminal:

    bash "$HOME/Downloads/setup.command"

This creates Downloads/Ninefold-Audio, installs Python 3.12 and espeak-ng,
creates an isolated Python environment, downloads Kokoro, and generates a sample.
Allow several GB for dependencies and model files. No API key or paid service is used.
The first run needs internet; document text is processed locally.

After the reader update is published, open a document, then choose
Listen → Export document for Mac audio. This exports the corrected reading
text with the reader's existing citation suppression and source positions.
Common reporter, statute, docket and appendix citations are suppressed; case
names remain. Review the preview for citation forms the patterns did not recognize.

    cd "$HOME/Downloads/Ninefold-Audio"
    .venv/bin/python narrate.py "/path/to/document.narration.json" --preview
    .venv/bin/python narrate.py "/path/to/document.narration.json" --benchmark 20 --output benchmark
    .venv/bin/python narrate.py "/path/to/document.narration.json" --output final-audio

Replace the example path by dragging your downloaded JSON file into Terminal.
Use a new output directory each time; existing recordings are never overwritten.
The benchmark estimates full-document time on your Mac and separates model loading.
If the Apple GPU fails, add --device cpu and choose a new output directory.

Output: document.wav, timings.json, spoken-text.txt.
WAV is the timing master, 24 kHz mono 16-bit, about 173 MB/hour.
The earlier 29 MB/hour estimate assumed compressed audio, which this kit does not produce.
Incomplete runs leave document.partial.wav; do not use it for publication.

Timing data preserves sentence/chunk source ranges for highlighting and seeking.
Word timings refer to the spoken text inside each chunk, not exact word offsets
in the citation-containing original. No version management is required; if you
correct text after generation, export and regenerate.

The kit does not automatically upload recordings or attach them to the live reader.
Saved-audio playback integration is separate from generation. Keep the entire output
folder together. Actual M4 Pro inference and pronunciation still need local testing.
Source: https://github.com/hexgrad/kokoro
