import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist/vendor/kokoro');
const modules = path.join(root, 'node_modules');
const metadata = name => JSON.parse(fs.readFileSync(path.join(modules, name, 'package.json'), 'utf8'));
await build({entryPoints: [path.join(root, 'scripts/voice-runtime-entry.mjs')], bundle: true, platform: 'browser', format: 'esm', minify: true, lineLimit: 120, outfile: path.join(output, 'kokoro.web.js')});
const files = ['kokoro.web.js'];
for (const variant of ['', '.asyncify', '.jspi']) {
  for (const extension of ['mjs', 'wasm']) {
    const name = 'ort-wasm-simd-threaded' + variant + '.' + extension;
    fs.copyFileSync(path.join(modules, 'onnxruntime-web/dist', name), path.join(output, name));
    files.push(name);
  }
}
for (const name of fs.readdirSync(output)) {
  if (name.startsWith('ort-wasm-') && !files.includes(name)) fs.unlinkSync(path.join(output, name));
}
const versions = {
  kokoroVersion: metadata('kokoro-js').version,
  transformersVersion: metadata('@huggingface/transformers').version,
  onnxRuntimeVersion: metadata('onnxruntime-web').version,
  phonemizerVersion: metadata('phonemizer').version,
  upstream: 'https://github.com/hexgrad/kokoro/tree/main/kokoro.js',
  model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  modelQuantizedBytes: 92361116,
  modelUrl: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx',
  modelGPUUrl: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx',
  modelBundled: false,
  files: Object.fromEntries(files.map(name => {
    const bytes = fs.readFileSync(path.join(output, name));
    return [name, {bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')}];
  })),
  localPatches: ['Expose the persistent fetch cache and WASM paths through the runtime entry module.'],
};
fs.writeFileSync(path.join(output, 'versions.json'), JSON.stringify(versions, null, 2) + '\n');
console.log('Bundled voice runtime ' + versions.transformersVersion + ' with native WebGPU and CPU fallback.');
