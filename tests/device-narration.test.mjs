import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DeviceNarrator} from '../dist/device-narration.js';
function harness(){
 const spoken=[],voices=[{voiceURI:'local',name:'Local',lang:'en-US',localService:true},{voiceURI:'remote',name:'Remote',lang:'en-US',localService:false}];let ended=0,errors=0,cancelled=0;
 const player=new DeviceNarrator({synth:{getVoices:()=>voices,cancel(){cancelled++},resume(){},speak(u){spoken.push(u)}},Utterance:class{constructor(text){this.text=text}},onEnd(){ended++},onError(){errors++}});
 return {player,spoken,get ended(){return ended},get errors(){return errors},get cancelled(){return cancelled}};
}
test('device voice uses speech directly without a neural worker and prefers local English',()=>{
 const h=harness();h.player.play('A useful passage.');assert.equal(h.spoken[0].text,'A useful passage.');assert.equal(h.spoken[0].voice.voiceURI,'local');assert.equal(h.spoken[0].rate,1);
 h.spoken[0].onend();assert.equal(h.ended,1);
});
test('fast audio ignores a saved remote voice but honors rate',()=>{
 const h=harness();h.player.play('Passage',{voiceURI:'remote',rate:1.5});assert.equal(h.spoken[0].voice.voiceURI,'local');assert.equal(h.spoken[0].rate,1.5);
});
test('pause suppresses late completion and resumes at the last reported boundary',()=>{
 const h=harness();h.player.play('First second third.');const first=h.spoken[0];first.onboundary({charIndex:6});h.player.pause();first.onend();first.onerror({error:'interrupted'});assert.equal(h.ended,0);assert.equal(h.errors,0);
 h.player.resume();assert.equal(h.spoken[1].text,'second third.');h.spoken[1].onboundary({charIndex:7});h.player.pause();h.player.resume();assert.equal(h.spoken[2].text,'third.');
});
test('stop and replacement invalidate stale boundary, end and error callbacks',()=>{
 const h=harness();h.player.play('Old');const old=h.spoken[0];h.player.play('New');old.onboundary({charIndex:2});old.onend();old.onerror({error:'cancelled'});assert.equal(h.player.offset,0);assert.equal(h.ended,0);assert.equal(h.errors,0);
 h.player.stop();h.spoken[1].onend();h.player.resume();assert.equal(h.spoken.length,2);assert.equal(h.ended,0);
});
test('changing speed preserves position while playing and stays silent while paused',()=>{
 const h=harness();h.player.play('First second.');h.spoken[0].onboundary({charIndex:6});h.player.setRate(2);assert.equal(h.spoken[1].text,'second.');assert.equal(h.spoken[1].rate,2);
 h.player.pause();h.player.setRate(.75);assert.equal(h.spoken.length,2);h.player.resume();assert.equal(h.spoken[2].rate,.75);
});
test('speech failure is reported; missing API does not throw',()=>{
 const h=harness();h.player.play('Test');h.spoken[0].onerror({error:'not-allowed'});assert.equal(h.errors,1);
 let error;const unavailable=new DeviceNarrator({synth:null,Utterance:null,onError:e=>error=e});unavailable.play('Test');assert.equal(error,'unavailable');
});
const source=fs.readFileSync('dist/app.js','utf8');
test('device controls describe passage navigation rather than imaginary time seeks',()=>{
 const fn=source.slice(source.indexOf('function devicePlaybackControls('),source.indexOf('function playbackControls('));
 assert.match(fn,/Previous passage/);assert.match(fn,/Next passage/);assert.doesNotMatch(fn,/playback-seek|10 seconds|seek-toggle/);
});
test('device mode branches before neural synthesis and frees its worker',()=>{
 assert.match(source,/if\(n.engine==='device'\)\{playDeviceNarration\(n,index\);return\}/);
 assert.match(source,/if\(n.engine==='device'&&voiceWorker\)\{voiceWorker.terminate\(\);voiceWorker=null\}/);
 assert.match(source,/function stopNarration\(\)\{deviceNarrator.stop\(\)/);
});

test('automatic mode never falls back to an online voice',()=>{
 let spoken=0,error;
 const player=new DeviceNarrator({synth:{getVoices:()=>[{voiceURI:'remote',lang:'en-US',localService:false}],cancel(){},resume(){},speak(){spoken++}},Utterance:class{},onError:e=>error=e});
 player.play('Potentially private text.');assert.equal(spoken,0);assert.equal(error,'no-local-voice');
 player.play('Old saved online voice',{voiceURI:'remote'});assert.equal(spoken,0);
});
test('device player shares compact mobile expansion controls',()=>{
 const fn=source.slice(source.indexOf('function devicePlaybackControls('),source.indexOf('function playbackControls('));
 assert.match(fn,/<span class="playback-identity"><span>/);assert.match(fn,/playbackExpanded\?'expanded'/);assert.match(fn,/playback-expand/);assert.match(fn,/aria-controls="playback-secondary"/);
});

test('late natural-audio completion cannot advance device speech',()=>{
 assert.match(source,/narrationAudio.addEventListener\('ended',\(\)=>\{if\(narration&&narration.engine!=='device'\)/);
});
