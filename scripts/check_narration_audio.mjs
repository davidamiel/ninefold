import assert from 'node:assert/strict';
import {NarrationAudio} from '../dist/narration-audio.js';
import {useCompactVoice, loadVoice} from '../dist/voice-backend.js';

class Context extends EventTarget {
  state = 'suspended';
  currentTime = 0;
  sampleRate = 24000;
  sources = [];
  destination = {};
  resumes = 0;
  resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
  createBuffer() { return {}; }
  createBufferSource() {
    const node = {playbackRate: {}, connect() {}, disconnect() {}, stop() {}, start(...args) { this.started = args; }};
    this.sources.push(node);
    return node;
  }
  createGain() { return {connect() {}, disconnect() {}, gain: {value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}}}; }
  async decodeAudioData() {
    this.samples = Float32Array.from([Infinity, -3, 1, 2, Number.NaN, .5, 4, -1]);
    return {duration: 10, numberOfChannels: 1, sampleRate: 1000, getChannelData: () => this.samples};
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({ok: true, arrayBuffer: async () => new ArrayBuffer(8)});
const context = new Context(), player = new NarrationAudio({createContext: () => context});
const unlock = player.unlock();
assert.equal(context.resumes, 1, 'resume runs in the tap, before any await');
assert.equal(context.sources.length, 1, 'silent source starts in the tap');
await unlock;
player.src = 'audio.wav';
await player.play();
assert.equal(player.paused, false);
context.currentTime = 2;
assert.equal(player.currentTime, 2);
player.pause();
context.currentTime = 4;
assert.equal(player.currentTime, 2, 'pause preserves the position');
await player.play();
assert.equal(context.sources.at(-1).started[1], 2, 'resume starts at the saved offset');
player.pause();
player.currentTime = 5;
await player.play();
assert.equal(context.sources.at(-1).started[1], 5, 'seek remains playable');
assert(context.samples.every(x => Number.isFinite(x) && Math.abs(x) <= .85));
assert.equal(context.samples[0], 0);
assert(context.samples.at(-1) === 0);
let interrupted = false;
player.addEventListener('interrupted', () => { interrupted = true; });
context.state = 'interrupted';
context.dispatchEvent(new Event('statechange'));
assert(interrupted && player.paused, 'interruption synchronizes pause state');
await player.play();
assert.equal(context.resumes, 2, 'interrupted context can resume');
player.pause();

const blocked = new Context();
blocked.resume = () => new Promise(() => {});
const blockedPlayer = new NarrationAudio({createContext: () => blocked, resumeTimeout: 10});
await assert.rejects(blockedPlayer.unlock(), {name: 'NotAllowedError'}, 'a blocked resume cannot hang forever');
blocked.resume = Context.prototype.resume;
await blockedPlayer.unlock();
assert.equal(blocked.state, 'running', 'a subsequent tap can retry');

let decoded;
const slow = new Context();
slow.decodeAudioData = () => new Promise(resolve => { decoded = resolve; });
const pendingPlayer = new NarrationAudio({createContext: () => slow});
pendingPlayer.src = 'slow.wav';
const playing = pendingPlayer.play();
await new Promise(resolve => setTimeout(resolve, 0));
pendingPlayer.pause();
decoded(await context.decodeAudioData());
await playing;
assert(pendingPlayer.paused, 'late decoding cannot restart paused playback');
assert.equal(slow.sources.length, 1, 'cancelled decode does not start an audible source');
globalThis.fetch = originalFetch;

await Promise.all([{userAgent: 'iPhone'}, {userAgent: 'Android'}, {platform: 'MacIntel', maxTouchPoints: 5}, {deviceMemory: 4}].map(async device => {
  assert(useCompactVoice(device));
  let requested = false;
  const settings = await loadVoice({device: {...device, gpu: {requestAdapter() { requested = true; }}}, create: async options => options, notify() {}});
  assert.equal(settings.dtype, 'q8');
  assert.equal(settings.device, 'wasm');
  assert.equal(requested, false, 'mobile never allocates the full precision GPU model');
}));
const attempts = [];
await loadVoice({
  device: {gpu: {requestAdapter: async () => ({})}},
  create: async options => {
    attempts.push(options.device);
    if (options.device === 'webgpu') throw new Error('GPU unavailable');
    return {};
  },
  notify() {},
});
assert.deepEqual(attempts, ['webgpu', 'wasm'], 'GPU initialization failure falls back');
console.log('Narration checks passed: gesture activation, recovery, pause/resume/seek, interrupted playback, cancellation, bounded samples, mobile backend and GPU fallback.');
