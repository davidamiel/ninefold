# Kokoro browser speech runtime

Pinned vendor files: kokoro-js 1.2.1 (official npm browser bundle), Transformers.js 3.5.1, and matching ONNX Runtime Web 1.22.0-dev.20250409-89f8206ba4. All files are unmodified upstream artifacts. The Kokoro browser bundle includes the phonemizer and Transformers.js; no package import map or CDN JavaScript is required. Licenses are in `licenses/`; hashes are in `versions.json`.

## Worker integration

Use a dedicated module worker to keep narration generation off the UI thread. Adjust paths relative to the worker location:

```js
import { KokoroTTS, env } from './vendor/kokoro/kokoro.web.js';
env.wasmPaths = new URL('./vendor/kokoro/', import.meta.url).href;
let engine;
async function load() {
  return engine ??= KokoroTTS.from_pretrained(
    'onnx-community/Kokoro-82M-v1.0-ONNX',
    { dtype: 'q8', device: 'wasm',
      progress_callback: progress => self.postMessage({ type: 'progress', progress }) }
  ).catch(error => { engine = null; throw error; });
}
// Serialize generation requests; do not launch parallel generation on one model.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.catch(() => {}).then(async () => {
    try {
      const tts = await load();
      const audio = await tts.generate(data.text, {
        voice: data.voice || 'af_heart', speed: data.speed || 1,
      });
      const samples = new Float32Array(audio.audio);
      self.postMessage({ type: 'audio', id: data.id,
        samples, sampleRate: audio.sampling_rate }, [samples.buffer]);
    } catch (error) {
      self.postMessage({ type: 'error', id: data.id, message: error.message });
    }
  });
};
```

`generate()` returns Transformers.js RawAudio: `audio` is mono Float32Array, `sampling_rate` is 24000, `toWav()` returns an ArrayBuffer and `toBlob()` returns an audio/wav Blob. Do not call `save()` inside a worker. For Web Audio, create a mono AudioBuffer at sampleRate and copy samples to channel 0.

Split paragraphs into modest complete-sentence chunks (roughly 200–400 characters initially, always below the 510-phoneme token limit). Long single generate() inputs are truncated. Queue one upcoming chunk while the current chunk plays; retain IDs to highlight the matching text and discard stale results after a reader jump. Voices af_heart and af_bella are upstream's strongest US English voices; bm_george is an alternative British male voice.

The q8 ONNX model is fetched on demand from https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx (92,361,116 bytes). Tokenizer/configuration and a selected voice (~0.5 MB) are also fetched from that public model repository. Browser Cache API stores model downloads; voice files use the `kokoro-voices` cache. No API key, speech service, or audio transcription is involved. The large model is deliberately not bundled in the deploy archive. Runtime JS/MJS/WASM are served locally.

Serve over HTTPS (localhost works for development), and serve `.wasm` as application/wasm. ONNX falls back to one thread when cross-origin isolation is unavailable; throughput must be checked in the hosted browser. Initial model loading, synthesis latency, pronunciation and seamless playback require UI integration testing. No browser performance claim is implied by this asset preparation.

Sources:
- https://github.com/hexgrad/kokoro/tree/main/kokoro.js
- https://registry.npmjs.org/kokoro-js/1.2.1
- https://registry.npmjs.org/@huggingface/transformers/3.5.1
- https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX

Licenses: Kokoro JS, Transformers.js and phonemizer package files declare Apache-2.0; ONNX Runtime uses MIT. Phonemizer incorporates eSpeak NG; its upstream GPL license is also retained. This directory does not include model weights.
