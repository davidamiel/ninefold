import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('dist/app.js','utf8');
function declaration(name){
 const re=new RegExp('^(?:async )?function '+name+'\\(', 'm'),start=source.search(re);
 assert(start>=0);
 const end=source.indexOf('\n}',start);
 // The lifecycle functions intentionally use multiline bodies.
 return source.slice(start,end+2);
}
function harness(extra={}){
 const messages=[],urls=[],revoked=[],toasts=[];
 const env={
  state:{active:'a'},app:{querySelector:()=>null,querySelectorAll:()=>[]},CSS:{escape:x=>x},
  URL:{createObjectURL:()=>{const url='blob:'+urls.length;urls.push(url);return url}},
  Blob:class{},refreshPlayback(){},highlightNarration(){},textRange(){},visiblePage(){return 0},
  stopArgument(){},closeReaderMenu(){},clearSelection(){},toast:x=>toasts.push(x),console:{warn(){}},
  ensureDoc:async()=>{},narrationChunks:()=>[{page:0,sourceStart:0,sourceEnd:100},{page:0,sourceStart:100,sourceEnd:200},{page:0,sourceStart:200,sourceEnd:300}],
  narrationAudio:{pause(){},play:async()=>{},currentTime:0},getVoiceWorker:()=>({postMessage:x=>messages.push(x)}),...extra
 };
 const factory=new Function('env',`
  const {state,app,CSS,URL,Blob,refreshPlayback,highlightNarration,textRange,visiblePage,stopArgument,closeReaderMenu,clearSelection,toast,console,ensureDoc,narrationChunks,narrationAudio,getVoiceWorker}=env;
  let narration=null,narrationToken=0,voiceRequest=0;const voicePending=new Map();
  function stopNarration(){narrationToken++;narrationAudio.pause();narration=null;for(const p of voicePending.values())p.reject(new Error('Cancelled'));voicePending.clear()}
  ${['waitForVoice','generateChunk','playNarrationChunk','startNarration','skipPlayback'].map(declaration).join('\n')}
  return {generateChunk,playNarrationChunk,startNarration,skipPlayback,stopNarration,
   get current(){return narration},set current(n){narration=n},voicePending,media:narrationAudio};
 `);
 return {...factory(env),api:factory,env,messages,urls,toasts};
}
function setup(extra={}){
 const h=harness(extra),api=h.api(h.env);
 return {...h,api};
}
function session(){return {id:'a',token:1,index:0,voice:'af_heart',paused:false,chunks:[{text:'one',page:0},{text:'two',page:0},{text:'three',page:0}],cache:new Map(),pending:new Map()}}
const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
function answer(h,index,{error=false}={}){
 const id=h.messages[index].id,p=h.api.voicePending.get(id);
 if(error)p.reject(new Error('generation failed'));else p.resolve({wav:new ArrayBuffer(1),duration:10});
 h.api.voicePending.delete(id);
}
test('failed generation is removed from pending and can be retried',async()=>{
 const h=setup(),n=session();h.api.current=n;
 const first=h.api.generateChunk(n,0);answer(h,0,{error:true});
 await assert.rejects(first);assert.equal(n.pending.size,0);
 const second=h.api.generateChunk(n,0);assert.equal(h.messages.length,2);answer(h,1);await second;
 assert.equal(n.cache.size,1);
});
test('older seek completion cannot replace the newest chunk',async()=>{
 const h=setup(),n=session();h.api.current=n;
 const first=h.api.playNarrationChunk(n,0),second=h.api.playNarrationChunk(n,1);
 answer(h,1);await second;const newest=h.api.media.src;
 answer(h,0);await first;assert.equal(h.api.media.src,newest);assert.equal(n.index,1);
});
test('stopped generation creates no object URL',async()=>{
 const h=setup(),n=session();h.api.current=n;
 const pending=h.api.generateChunk(n,0);h.api.current=null;answer(h,0);
 await assert.rejects(pending);assert.equal(h.urls.length,0);
});
test('autoplay rejection retains narration and marks it paused',async()=>{
 const h=setup({narrationAudio:{pause(){},currentTime:0,play:async()=>{const e=new Error('gesture');e.name='NotAllowedError';throw e}}}),n=session();h.api.current=n;
 const play=h.api.playNarrationChunk(n,0);answer(h,0);await play;
 assert.equal(h.api.current,n);assert.equal(n.paused,true);assert.equal(n.loading,false);
 assert.deepEqual(h.toasts,['Tap Play to resume.']);
});
test('stop while document loads prevents a late restart',async()=>{
 let resolve;const h=setup({ensureDoc:()=>new Promise(r=>resolve=r)});
 const start=h.api.startNarration();h.api.stopNarration();resolve();await start;
 assert.equal(h.api.current,null);assert.equal(h.messages.length,0);
});
test('selection within a chunk includes it; exact boundary uses the next chunk',async()=>{
 for(const [offset,expected] of [[50,0],[100,1],[250,2]]){
  const h=setup();const start=h.api.startNarration({docId:'a',page:0,offset});await tick();
  assert.equal(h.api.current.index,expected);answer(h,0);await start;
 }
});
test('three chunk transitions continue and final completion stops',async()=>{
 const h=setup(),n=session();h.api.current=n;
 let play=h.api.playNarrationChunk(n,0);answer(h,0);await play;
 answer(h,1);await tick();await h.api.playNarrationChunk(n,1);
 answer(h,2);await tick();await h.api.playNarrationChunk(n,2);
 assert.equal(n.index,2);await h.api.playNarrationChunk(n,3);assert.equal(h.api.current,null);
});

test('a pending skip cannot override a newer playback request',async()=>{
 const h=setup(),n=session();h.api.current=n;h.api.media.currentTime=5;
 const skip=h.api.skipPlayback(10),play=h.api.playNarrationChunk(n,2);
 answer(h,1);await play;const newest=h.api.media.src;
 answer(h,0);await skip;assert.equal(n.index,2);assert.equal(h.api.media.src,newest);
});
test('synchronous worker failure leaves neither pending registry poisoned',async()=>{
 const h=setup({getVoiceWorker:()=>{throw new Error('worker unavailable')}}),n=session();h.api.current=n;
 await assert.rejects(h.api.generateChunk(n,0));
 assert.equal(n.pending.size,0);assert.equal(h.api.voicePending.size,0);
});

test('citation masking precedes every possible chunk boundary and preserves offsets',()=>{
 const mask=new Function(declaration('maskSpokenCitations')+';return maskSpokenCitations')();
 for(const citation of ['410 U.S. 113, 120 (1973)','123 F. 3d 456, 460 (9th Cir. 1997)',"12 F. App’x 34",'42 U.S.C. § 1983','123 S. Ct. 456','2024 WL 1234, at *2','Id. at 24','J.A. 12','28 C.F.R. § 35.130','18 Del. C. § 6853','Fed. R. Civ. P. 12(b)(6)','Fed. R. Evid. 403']){
  for(let offset=0;offset<221;offset++){
   const text='x'.repeat(offset)+' '+citation+' protects substantive rights.';
   const masked=mask(text);
   assert.equal(masked.length,text.length);
   assert.equal(masked.slice(offset+1,offset+1+citation.length).trim(),'');
   assert.equal(masked.endsWith(' protects substantive rights.'),true);
  }
 }
 assert.equal(mask('Section 2 protects voting rights. Rule 12 governs dismissal. In 2024, 12 people applied.'),'Section 2 protects voting rights. Rule 12 governs dismissal. In 2024, 12 people applied.');
 assert(source.indexOf('clean.text=maskSpokenCitations(clean.text)')<source.indexOf('for(const sentence of sentenceRanges(part))'));
});

test('voice restart preserves an explicit paused state',async()=>{
 let plays=0;const h=setup({narrationAudio:{pause(){},currentTime:0,play:async()=>plays++}});
 const start=h.api.startNarration({docId:'a',page:0,offset:100},{paused:true});
 await tick();answer(h,0);await start;assert.equal(h.api.current.paused,true);assert.equal(plays,0);
 assert(source.includes('await startNarration(anchor,{paused:n?.paused||false})'));
});


test('bounded lookahead starts before the first clip resolves',async()=>{
 const h=setup(),n=session();n.chunks=Array.from({length:8},(_,i)=>({text:String(i),page:0}));h.api.current=n;
 const play=h.api.playNarrationChunk(n,0);
 assert.deepEqual(h.messages.map(m=>m.index),[0,1,2,3]);
 assert.equal(h.messages[0].priority,true);
 answer(h,0);await play;
 assert.equal(h.messages.length,4);
 h.api.stopNarration();await tick();
});

test('seeking to a prefetched clip promotes it instead of generating it twice',async()=>{
 const h=setup(),n=session();h.api.current=n;
 const first=h.api.playNarrationChunk(n,0),seek=h.api.playNarrationChunk(n,2);
 assert.equal(h.messages.filter(m=>m.text==='three').length,1);
 assert.deepEqual(h.messages.at(-1),{type:'prioritize',session:1,index:2});
 answer(h,2);await seek;answer(h,0);await first;
 assert.equal(n.index,2);h.api.stopNarration();await tick();
});


test('backward skip from a middle-document start prioritizes uncached duration probes',async()=>{
 const h=setup(),n=session();n.chunks=Array.from({length:10},(_,i)=>({text:String(i),page:0}));h.api.current=n;
 const play=h.api.playNarrationChunk(n,5);answer(h,0);await play;
 assert.deepEqual(h.messages.map(m=>m.index),[5,6,7,8]);
 h.api.media.currentTime=1;const skip=h.api.skipPlayback(-10);
 assert.equal(h.messages.at(-1).index,4);assert.equal(h.messages.at(-1).priority,true);
 answer(h,4);await skip;assert.equal(n.index,4);assert.equal(h.api.media.currentTime,1);
 h.api.stopNarration();await tick();
});

test('forward skip promotes a prefetched duration probe before awaiting it',async()=>{
 const h=setup(),n=session();n.chunks=Array.from({length:10},(_,i)=>({text:String(i),page:0}));h.api.current=n;
 const play=h.api.playNarrationChunk(n,5);answer(h,0);await play;
 h.api.media.currentTime=9;const skip=h.api.skipPlayback(10);await tick();
 assert.deepEqual(h.messages.at(-1),{type:'prioritize',session:1,index:6});
 assert.equal(h.messages.filter(m=>m.text==='6').length,1);
 answer(h,1);await skip;assert.equal(n.index,6);assert.equal(h.api.media.currentTime,9);
 h.api.stopNarration();await tick();
});

test('chunk transitions clear old media time before displaying the new elapsed total',async()=>{
 const h=setup(),n=session();h.api.current=n;
 const first=h.api.playNarrationChunk(n,0);answer(h,0);await first;
 h.api.media.currentTime=10;
 const next=h.api.playNarrationChunk(n,1);
 assert.equal(h.api.media.currentTime,0);
 answer(h,1);await next;
 assert.equal(h.api.media.currentTime,0);
 h.api.stopNarration();await tick();
});


test('a masked gap before the selected chunk never falls back to the previous sentence',async()=>{
 const h=setup({narrationChunks:()=>[{page:0,sourceStart:0,sourceEnd:15,text:'First sentence.'},{page:0,sourceStart:39,sourceEnd:57,text:'supports the rule.'}]});
 const start=h.api.startNarration({docId:'a',page:0,offset:16});await tick();
 assert.equal(h.api.current.index,1);answer(h,0);await start;
});
