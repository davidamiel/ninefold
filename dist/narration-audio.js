// Keep one audio context alive across passages, pauses and seeks. Playback is
// independent of generation; obsolete decode/play requests cannot restart audio.
export class NarrationAudio extends EventTarget {
 constructor(){super();this._src='';this._rate=1;this._offset=0;this.paused=true;this.revision=0;this.operation=0;this.buffer=null;this.timer=null}
 context(){return this.ctx??=new AudioContext()}
 get src(){return this._src}
 set src(value){this.pause();this.revision++;this._src=value;this.buffer=null;this.decoding=null;this._offset=0}
 get duration(){return this.buffer?.duration||0}
 get currentTime(){return Math.min(this.duration||Infinity,this._offset+(this.paused?0:(this.context().currentTime-this.started)*this._rate))}
 set currentTime(value){const resume=!this.paused;this.pause();this._offset=Math.max(0,Math.min(Number(value)||0,this.duration||Infinity));this.dispatchEvent(new Event('timeupdate'));if(resume)this.play().catch(()=>{})}
 get playbackRate(){return this._rate}
 set playbackRate(value){const resume=!this.paused;this.pause();this._rate=Math.max(.5,Math.min(3,Number(value)||1));if(resume)this.play().catch(()=>{})}
 getAttribute(name){return name==='src'?this._src:null}
 removeAttribute(name){if(name==='src')this.src=''}
 async play(){
  if(!this._src)return;
  const operation=++this.operation,revision=this.revision,ctx=this.context();
  await ctx.resume();
  if(!this.decoding){const url=this._src;this.decoding=fetch(url).then(r=>{if(!r.ok)throw Error('Audio unavailable');return r.arrayBuffer()}).then(bytes=>ctx.decodeAudioData(bytes)).then(buffer=>{
   // Bound peaks and taper each segment to zero to prevent discontinuities.
   for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);let peak=1;for(const x of data)peak=Math.max(peak,Math.abs(x));const edge=Math.min(Math.floor(buffer.sampleRate*.006),Math.floor(data.length/2));for(let i=0;i<data.length;i++)data[i]=Number.isFinite(data[i])?data[i]/peak*.85:0;for(let i=0;i<edge;i++){const gain=i/edge;data[i]*=gain;data[data.length-1-i]*=gain}}
   return buffer;
  });}
  const buffer=await this.decoding;if(operation!==this.operation||revision!==this.revision)return;
  this.buffer=buffer;this.stopNode();const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.playbackRate.value=this._rate;source.connect(gain);gain.connect(ctx.destination);gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(1,ctx.currentTime+.012);this.node=source;this.gain=gain;this.started=ctx.currentTime;this.paused=false;
  source.onended=()=>{if(this.node!==source)return;this._offset=buffer.duration;this.paused=true;this.node=null;gain.disconnect();clearInterval(this.timer);this.dispatchEvent(new Event('timeupdate'));this.dispatchEvent(new Event('ended'))};
  source.start(0,Math.min(this._offset,buffer.duration));clearInterval(this.timer);this.timer=setInterval(()=>this.dispatchEvent(new Event('timeupdate')),100);this.dispatchEvent(new Event('play'));
 }
 stopNode(){const node=this.node,gain=this.gain;if(!node)return;this.node=null;node.onended=null;const now=this.context().currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+.012);node.stop(now+.014);setTimeout(()=>{node.disconnect();gain.disconnect()},30)}
 pause(){this.operation++;if(!this.paused)this._offset=this.currentTime;this.paused=true;this.stopNode();clearInterval(this.timer)}
}
