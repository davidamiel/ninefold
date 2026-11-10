// SpeechSynthesis exposes text boundaries, not a seekable audio timeline.
// Keep short utterances, and resume from the last reported boundary on platforms
// where native pause/resume is unreliable. Only local English voices are used.
export class DeviceNarrator {
 constructor({synth=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,onEnd=()=>{},onError=()=>{}}={}) {
  Object.assign(this,{synth,Utterance,onEnd,onError});this.generation=0;this.offset=0;this.utterance=null;
 }
 get supported(){return !!(this.synth&&this.Utterance)}
 play(text,{rate=1,offset=0}={}) {
  this.stop();this.text=text;this.options={rate};this.offset=Math.max(0,offset);
  if(!this.supported){this.onError('unavailable');return}
  const generation=this.generation,utterance=new this.Utterance(text.slice(this.offset)),base=this.offset;
  this.utterance=utterance;utterance.rate=rate;utterance.lang='en-US';
  const voices=this.synth.getVoices();
  // Fast audio is local-only, including when an old saved preference names
  // an online voice. Never fall back to the browser's possibly remote default.
  const voice=voices.find(v=>v.localService&&/^en-US$/i.test(v.lang))||voices.find(v=>v.localService&&/^en\b/i.test(v.lang));
  if(!voice){this.utterance=null;this.onError('no-local-voice');return}
  utterance.voice=voice;utterance.lang=voice.lang;
  utterance.onboundary=e=>{if(this.generation===generation&&Number.isFinite(e.charIndex))this.offset=base+e.charIndex};
  utterance.onend=()=>{if(this.generation===generation){this.utterance=null;this.onEnd()}};
  utterance.onerror=e=>{if(this.generation===generation){this.utterance=null;this.onError(e.error||'speech-failed')}};
  try{this.synth.resume();this.synth.speak(utterance)}catch{if(this.generation===generation)this.onError('speech-failed')}
 }
 pause(){this.generation++;this.synth?.cancel();this.utterance=null}
 resume(){if(this.text)this.play(this.text,{...this.options,offset:this.offset})}
 setRate(rate){this.options={...this.options,rate};if(this.utterance)this.resume()}
 stop(){this.generation++;this.synth?.cancel();this.utterance=null;this.text='';this.offset=0}
}
