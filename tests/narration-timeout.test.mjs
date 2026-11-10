import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('dist/app.js','utf8');
const generate=source.slice(source.indexOf('function waitForVoice('),source.indexOf('async function playNarrationChunk('));
function setup(){
 const messages=[];
 const n={token:1,playRequest:1,loading:true,voice:'am_michael',chunks:[{text:'first'},{text:'second'}],cache:new Map(),pending:new Map()};
 const c=vm.createContext({n,narration:n,voiceRequest:0,voicePending:new Map(),Blob,URL:{createObjectURL:()=> 'blob:test'},refreshPlayback(){},
  setTimeout(){assert.fail('Natural preparation must not install an elapsed-time cutoff')},
  getVoiceWorker:()=>({postMessage:m=>messages.push(m)})});
 vm.runInContext(generate,c);return {c,n,messages};
}
test('natural synthesis waits without a timeout, including promoted requests',async()=>{
 const {c,n,messages}=setup();
 const background=c.generateChunk(n,0),foreground=c.generateChunk(n,0,true);
 assert.equal(messages.filter(m=>m.text).length,1);
 assert.equal(messages.at(-1).type,'prioritize');
 c.voicePending.get(1).resolve({wav:new ArrayBuffer(1),duration:2});c.voicePending.delete(1);
 await Promise.all([background,foreground]);assert.equal(n.cache.size,1);assert.equal(n.pending.size,0);
});
test('actual worker errors still reject preparation and allow a clean retry',async()=>{
 const {c,n}=setup();
 const pending=c.generateChunk(n,0,true);
 c.voicePending.get(1).reject(new Error('Synthesis failed'));c.voicePending.delete(1);
 await assert.rejects(pending,/Synthesis failed/);assert.equal(n.pending.size,0);
 const retry=c.generateChunk(n,0,true);
 c.voicePending.get(2).resolve({wav:new ArrayBuffer(1),duration:2});c.voicePending.delete(2);
 await retry;assert.equal(n.cache.size,1);
});
test('cancelled sessions cannot cache late synthesis results',async()=>{
 const {c,n}=setup(),pending=c.generateChunk(n,0,true);c.narration=null;
 c.voicePending.get(1).resolve({wav:new ArrayBuffer(1),duration:2});c.voicePending.delete(1);
 await assert.rejects(pending,/Cancelled/);assert.equal(n.cache.size,0);
});
