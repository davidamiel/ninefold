import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('dist/narration-worker.js','utf8').split(/\r?\n/).slice(2).join('\n');
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function harness(){
 const calls=[],messages=[],pending=[];
 const engine={generate(text,options){calls.push({text,...options});return new Promise((resolve,reject)=>pending.push({resolve,reject}))}};
 const context=vm.createContext({self:{postMessage:message=>messages.push(message)},KokoroTTS:{from_pretrained:async()=>engine}});
 vm.runInContext(source,context);
 const send=data=>context.self.onmessage({data});
 const request=(index,extra={})=>send({id:index,index,session:1,text:String(index),voice:'am_michael',...extra});
 const finish=()=>pending.shift().resolve({toWav:()=>new ArrayBuffer(4),audio:{length:24},sampling_rate:24});
 return {calls,messages,pending,send,request,finish};
}
test('new requested playback jumps ahead of queued prefetch',async()=>{
 const h=harness();h.request(0);await tick();h.request(1);h.request(2);h.request(3,{priority:true});
 h.finish();await tick();assert.deepEqual(h.calls.map(c=>c.text),['0','3']);
 h.finish();await tick();assert.deepEqual(h.calls.map(c=>c.text),['0','3','1']);
 assert(h.calls.every(c=>c.voice==='am_michael'));
});
test('a pending prefetched clip can be promoted without duplicate synthesis',async()=>{
 const h=harness();h.request(0);await tick();h.request(1);h.request(2);
 h.send({type:'prioritize',session:1,index:2});h.finish();await tick();
 assert.deepEqual(h.calls.map(c=>c.text),['0','2']);h.finish();await tick();
 assert.deepEqual(h.calls.map(c=>c.text),['0','2','1']);
});
test('cancellation clears queued work and suppresses running old-session output',async()=>{
 const h=harness();h.request(0);await tick();h.request(1);h.request(2);
 h.send({type:'cancel',session:2});h.request(3,{session:3});h.finish();await tick();
 assert.deepEqual(h.calls.map(c=>c.text),['0','3']);assert.equal(h.messages.length,0);
 h.finish();await tick();assert.deepEqual(h.messages.map(m=>m.id),[3]);
});
test('failed synthesis reports its error and does not poison the queue',async()=>{
 const h=harness();h.request(0);await tick();h.request(1);
 h.pending.shift().reject(new Error('generation failed'));await tick();
 assert.equal(h.messages[0].type,'error');assert.deepEqual(h.calls.map(c=>c.text),['0','1']);
 h.finish();await tick();assert.equal(h.messages[1].type,'audio');
});
test('obsolete promotion cannot change the current session or order',async()=>{
 const h=harness();h.request(0,{session:3});await tick();h.request(1,{session:3});h.request(2,{session:3});
 h.send({type:'prioritize',session:1,index:2});h.finish();await tick();
 assert.deepEqual(h.calls.map(c=>c.text),['0','1']);
});
