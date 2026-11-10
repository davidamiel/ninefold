import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('dist/app.js','utf8');
const generate=source.slice(source.indexOf('function waitForVoice('),source.indexOf('async function playNarrationChunk('));
function setup(){
 const timers=new Map(),cleared=[],workers=[];let timerId=0;
 const n={token:1,playRequest:1,loading:true,voice:'am_michael',chunks:[{text:'first'},{text:'second'}],cache:new Map(),pending:new Map()};
 const c=vm.createContext({n,narration:n,voiceRequest:0,voiceWorker:null,voicePending:new Map(),Blob,URL:{createObjectURL:()=> 'blob:test'},setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},clearTimeout(id){cleared.push(id);timers.delete(id)}});
 c.getVoiceWorker=()=>c.voiceWorker??=(workers.push({postMessage(){},terminate(){this.terminated=true}}),workers.at(-1));
 vm.runInContext(generate,c);return {c,n,timers,workers,cleared};
}
test('hung preparation rejects all queued requests, resets the worker and permits a clean retry',async()=>{
 const h=setup(),first=h.c.generateChunk(h.n,0,true),second=h.c.generateChunk(h.n,1);
 const failures=Promise.all([assert.rejects(first,e=>e.code==='VOICE_TIMEOUT'),assert.rejects(second,e=>e.code==='VOICE_TIMEOUT')]);
 assert.equal(h.timers.get(1).delay,90000);h.timers.get(1).fn();await failures;
 assert.equal(h.workers[0].terminated,true);assert.equal(h.c.voiceWorker,null);assert.equal(h.c.voicePending.size,0);assert.equal(h.n.pending.size,0);assert.equal(h.timers.size,0);
 const retry=h.c.generateChunk(h.n,0,true);assert.equal(h.workers.length,2);
 h.c.voicePending.get(3).resolve({wav:new ArrayBuffer(1),duration:2});h.c.voicePending.delete(3);await retry;
 assert.equal(h.n.cache.get(0).duration,2);assert.equal(h.timers.size,0);
});
test('a late deadline from a completed request cannot kill its worker',async()=>{
 const h=setup(),first=h.c.generateChunk(h.n,0,true),deadline=h.timers.get(1).fn;
 h.c.voicePending.get(1).resolve({wav:new ArrayBuffer(1),duration:2});h.c.voicePending.delete(1);await first;deadline();
 assert.equal(h.workers[0].terminated,undefined);assert.equal(h.c.voiceWorker,h.workers[0]);
});
test('obsolete narration cannot terminate a newer session through its deadline',async()=>{
 const h=setup(),first=h.c.generateChunk(h.n,0,true),deadline=h.timers.get(1).fn;
 h.c.narration={};deadline();assert.equal(h.workers[0].terminated,undefined);
 h.c.voicePending.get(1).reject(new Error('Cancelled'));h.c.voicePending.delete(1);await assert.rejects(first);assert.equal(h.timers.size,0);
});


test('prefetch has no deadline and an old foreground timer cannot abort a newer seek',async()=>{
 const h=setup(),prefetch=h.c.generateChunk(h.n,0);assert.equal(h.timers.size,0);
 const first=h.c.generateChunk(h.n,0,true),oldDeadline=h.timers.get(1).fn;
 h.n.playRequest++;
 const next=h.c.generateChunk(h.n,1,true);oldDeadline();
 assert.equal(h.workers[0].terminated,undefined);assert.equal(h.c.voicePending.size,2);
 h.c.voicePending.get(2).resolve({wav:new ArrayBuffer(1),duration:3});h.c.voicePending.delete(2);await next;
 h.c.voicePending.get(1).resolve({wav:new ArrayBuffer(1),duration:2});h.c.voicePending.delete(1);await Promise.all([prefetch,first]);
 assert.equal(h.timers.size,0);
});
test('a pending speculative clip gets a fresh deadline only when promoted',async()=>{
 const h=setup(),prefetch=h.c.generateChunk(h.n,1);assert.equal(h.timers.size,0);
 h.n.playRequest=7;const foreground=h.c.generateChunk(h.n,1,true);
 assert.equal(h.timers.size,1);assert.equal(h.c.voicePending.size,1);
 const failures=Promise.all([assert.rejects(prefetch),assert.rejects(foreground,e=>e.code==='VOICE_TIMEOUT')]);
 h.timers.get(1).fn();await failures;assert.equal(h.workers[0].terminated,true);
});
