import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('dist/narration-worker.js','utf8').split(/\r?\n/).slice(2).join('\n');
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function harness(){
 const calls=[],messages=[],pending=[];
 const engine={generate(text,options){calls.push({text,...options});return new Promise((resolve,reject)=>pending.push({resolve,reject}))}};
 const context=vm.createContext({setTimeout:fn=>queueMicrotask(fn),self:{postMessage:message=>messages.push(message)},KokoroTTS:{from_pretrained:async()=>engine}});
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


test('fatal worker error clears pending requests and retry creates a fresh working worker',()=>{
 const workers=[],failures=[],answers=[];
 class Worker{
  constructor(){workers.push(this)}
  terminate(){this.terminated=true}
 }
 const declaration=fs.readFileSync('dist/app.js','utf8').split(/\r?\n/).find(line=>line.startsWith('function getVoiceWorker('));
 const context=vm.createContext({Worker,Error});
 vm.runInContext(`let voiceWorker=null,narration=null;const voicePending=new Map();${declaration};globalThis.api={getVoiceWorker,voicePending}`,context);
 const {getVoiceWorker,voicePending}=context.api,first=getVoiceWorker();
 assert.equal(getVoiceWorker(),first);
 voicePending.set(1,{reject:e=>failures.push(e.message)});voicePending.set(2,{reject:e=>failures.push(e.message)});
 first.onerror();assert.equal(first.terminated,true);assert.equal(voicePending.size,0);assert.equal(failures.length,2);
 const retry=getVoiceWorker();assert.notEqual(retry,first);assert.equal(workers.length,2);
 voicePending.set(3,{resolve:data=>answers.push(data),reject:e=>failures.push(e.message)});
 first.onerror();assert.equal(getVoiceWorker(),retry);assert.equal(voicePending.size,1);
 first.onmessage({data:{id:3,type:'audio'}});assert.equal(answers.length,0);
 retry.onmessage({data:{id:3,type:'audio',duration:2}});assert.equal(answers.length,1);assert.equal(voicePending.size,0);
});


test('drain yields to cancel and new foreground messages before another prefetched synthesis',async()=>{
 const tasks=[],calls=[],messages=[],pending=[];
 const engine={generate(text){calls.push(text);return new Promise(resolve=>pending.push(resolve))}};
 const context=vm.createContext({setTimeout:fn=>tasks.push(fn),self:{postMessage:m=>messages.push(m)},KokoroTTS:{from_pretrained:async()=>engine}});
 vm.runInContext(source,context);
 const send=data=>context.self.onmessage({data});
 send({id:0,index:0,session:1,text:'first'});send({id:1,index:1,session:1,text:'obsolete lookahead'});
 assert.equal(calls.length,0);tasks.shift()();await tick();tasks.shift()();await tick();assert.deepEqual(calls,['first']);
 pending.shift()({toWav:()=>new ArrayBuffer(1),audio:{length:1},sampling_rate:1});await tick();
 assert.equal(tasks.length,1);assert.deepEqual(calls,['first']);
 send({type:'cancel',session:2});send({id:2,index:4,session:3,text:'selected sentence',priority:true});
 tasks.shift()();await tick();tasks.shift()();await tick();assert.deepEqual(calls,['first','selected sentence']);
});


test('a seek during model startup is processed before the obsolete first synthesis',async()=>{
 const tasks=[],calls=[];let loaded;
 const engine={generate(text){calls.push(text);return new Promise(()=>{})}};
 const context=vm.createContext({setTimeout:fn=>tasks.push(fn),self:{postMessage(){}},KokoroTTS:{from_pretrained:()=>new Promise(resolve=>loaded=resolve)}});
 vm.runInContext(source,context);const send=data=>context.self.onmessage({data});
 send({id:0,index:0,session:1,text:'obsolete startup'});tasks.shift()();await tick();
 loaded(engine);await tick();assert.equal(tasks.length,1);
 send({type:'cancel',session:2});send({id:1,index:1,session:3,text:'new sentence',priority:true});
 tasks.shift()();await tick();assert.equal(calls.length,0);
 tasks.shift()();await tick();tasks.shift()();await tick();assert.deepEqual(calls,['new sentence']);
});
