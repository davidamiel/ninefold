export {KokoroTTS} from 'kokoro-js';
import {env as runtime} from '@huggingface/transformers';
// Keep application configuration independent of the bundled runtime internals.
export const env = {
  set modelCacheEnabled(value) { runtime.useBrowserCache = value; },
  set wasmPaths(value) { runtime.backends.onnx.wasm.wasmPaths = value; },
  set fetch(value) { runtime.fetch = value; },
};
