// One context survives passages, pause and seek. Unlock it in the user's input
// handler, before document reads or voice generation consume that activation.
export class NarrationAudio extends EventTarget {
  constructor({createContext, resumeTimeout = 4000} = {}) {
    super();
    this.createContext = createContext || (() => new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    this.resumeTimeout = resumeTimeout;
    this._src = '';
    this._rate = 1;
    this._offset = 0;
    this.paused = true;
    this.revision = 0;
    this.operation = 0;
    this.buffer = null;
    this.timer = null;
  }

  context() {
    if (!this.ctx || this.ctx.state === 'closed') {
      const context = this.createContext();
      this.ctx = context;
      context.addEventListener('statechange', () => {
        if (this.ctx !== context || context.state === 'running' || this.paused) return;
        this.pause();
        this.dispatchEvent(new Event('interrupted'));
      });
    }
    return this.ctx;
  }

  unlock() {
    let context, resumed;
    try {
      context = this.context();
      if (context.state === 'running') return Promise.resolve();
      // resume() and the silent source both run synchronously within the tap.
      resumed = context.resume();
      const silent = context.createBufferSource();
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(context.destination);
      silent.onended = () => silent.disconnect();
      silent.start();
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const blocked = () => new DOMException('Tap Play to enable audio.', 'NotAllowedError');
      const timer = setTimeout(() => reject(blocked()), this.resumeTimeout);
      Promise.resolve(resumed).then(() => {
        clearTimeout(timer);
        if (context.state === 'running') resolve();
        else reject(blocked());
      }, error => { clearTimeout(timer); reject(error); });
    });
  }

  get src() { return this._src; }
  set src(value) {
    this.pause();
    this.revision++;
    this._src = value;
    this.buffer = null;
    this.decoding = null;
    this._offset = 0;
  }
  get duration() { return this.buffer?.duration || 0; }
  get currentTime() {
    const elapsed = this.paused ? 0 : ((this.ctx?.currentTime || 0) - this.started) * this._rate;
    return Math.min(this.duration || Infinity, this._offset + elapsed);
  }
  set currentTime(value) {
    const resume = !this.paused;
    this.pause();
    this._offset = Math.max(0, Math.min(Number(value) || 0, this.duration || Infinity));
    this.dispatchEvent(new Event('timeupdate'));
    if (resume) this.play().catch(() => this.dispatchEvent(new Event('error')));
  }
  get playbackRate() { return this._rate; }
  set playbackRate(value) {
    const resume = !this.paused;
    this.pause();
    this._rate = Math.max(.5, Math.min(3, Number(value) || 1));
    if (resume) this.play().catch(() => this.dispatchEvent(new Event('error')));
  }
  getAttribute(name) { return name === 'src' ? this._src : null; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }

  async decode(context) {
    const response = await fetch(this._src);
    if (!response.ok) throw Error('Audio unavailable');
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    // Bound peaks and taper segment edges to prevent audible discontinuities.
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      let peak = 1;
      for (const sample of data) if (Number.isFinite(sample)) peak = Math.max(peak, Math.abs(sample));
      const edge = Math.min(Math.floor(buffer.sampleRate * .006), Math.floor(data.length / 2));
      for (let i = 0; i < data.length; i++) data[i] = Number.isFinite(data[i]) ? data[i] / peak * .85 : 0;
      for (let i = 0; i < edge; i++) {
        const gain = i / edge;
        data[i] *= gain;
        data[data.length - 1 - i] *= gain;
      }
    }
    return buffer;
  }

  async play() {
    if (!this._src || !this.paused) return;
    const operation = ++this.operation, revision = this.revision, context = this.context();
    await this.unlock();
    if (operation !== this.operation || revision !== this.revision) return;
    this.decoding ||= this.decode(context);
    let buffer;
    try { buffer = await this.decoding; }
    catch (error) {
      if (revision === this.revision) this.decoding = null;
      throw error;
    }
    if (operation !== this.operation || revision !== this.revision) return;
    this.buffer = buffer;
    this.stopNode();
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = this._rate;
    source.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(1, context.currentTime + .012);
    this.node = source;
    this.gain = gain;
    this.started = context.currentTime;
    this.paused = false;
    source.onended = () => {
      if (this.node !== source) return;
      this._offset = buffer.duration;
      this.paused = true;
      this.node = null;
      this.gain = null;
      source.disconnect();
      gain.disconnect();
      clearInterval(this.timer);
      this.dispatchEvent(new Event('timeupdate'));
      this.dispatchEvent(new Event('ended'));
    };
    try { source.start(0, Math.min(this._offset, buffer.duration)); }
    catch (error) {
      this.paused = true;
      this.node = null;
      this.gain = null;
      source.disconnect();
      gain.disconnect();
      throw error;
    }
    clearInterval(this.timer);
    this.timer = setInterval(() => this.dispatchEvent(new Event('timeupdate')), 100);
    this.dispatchEvent(new Event('play'));
  }

  stopNode() {
    const node = this.node, gain = this.gain;
    if (!node) return;
    this.node = null;
    this.gain = null;
    node.onended = null;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + .012);
    node.stop(now + .014);
    setTimeout(() => { node.disconnect(); gain.disconnect(); }, 30);
  }

  pause() {
    this.operation++;
    if (!this.paused) this._offset = this.currentTime;
    this.paused = true;
    this.stopNode();
    clearInterval(this.timer);
  }
}
