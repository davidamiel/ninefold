import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sentenceAtTime,timeAtSentenceOffset,sentenceAtOffset} from '../dist/transcript-timing.js';
const source=fs.readFileSync('dist/app.js','utf8');
const code=source.slice(source.indexOf('async function seekTranscriptText('),source.indexOf('// Native hit-testing'));
const text='First sentence. A selected second sentence. Final sentence.',record={text,start:10,end:60};
function setup(narration,offset=text.indexOf('selected'),turn=record){
 const starts=[],recordings=[];
 const context=vm.createContext({readerEditing:()=>false,narration,sentenceAtTime,timeAtSentenceOffset,sentenceAtOffset,ds:()=>({caseId:'case',timedSession:{id:'recording',turns:[turn]}}),transcriptClickOffset:()=>offset,startNarration:async(...args)=>starts.push(args),listen:async(...args)=>recordings.push(args)});
 vm.runInContext(code,context);
 return {starts,recordings,click:()=>context.seekTranscriptText({target:{closest:()=>null}},{dataset:{turn:'0',start:'10'}},'doc')};
}
test('text click seeks selected sentence in active device and natural narration, preserving paused state',async()=>{
 for(const engine of ['device','natural'])for(const paused of [false,true])for(const id of ['doc','different']){
  const h=setup({id,engine,paused});await h.click();
  assert.equal(h.recordings.length,0);assert.equal(h.starts.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.starts[0])),[{docId:'doc',page:0,offset:text.indexOf('A selected')},{paused}]);
 }
});
test('without narration, transcript text continues to seek original recording',async()=>{
 for(const narration of [null]){
  const h=setup(narration);await h.click();assert.equal(h.starts.length,0);assert.equal(h.recordings.length,1);assert.equal(h.recordings[0][0],'case');assert(h.recordings[0][2]>10);
 }
});
test('missing caret offset uses turn timing safely without changing active engine',async()=>{
 const h=setup({id:'doc',engine:'device',paused:true},null);await h.click();assert.equal(h.recordings.length,0);assert.equal(h.starts[0][0].offset,0);
});
test('explicit source anchor is passed to chunk construction and becomes a chunk boundary',()=>{
 assert.match(source,/const chunks=narrationChunks\(id,anchor\)/);
 assert.match(source,/const anchorOffset=anchor\?\.page===page&&Number.isFinite\(anchor.offset\)\?lowerBound\(clean.map,anchor.offset\):null/);
 assert.match(source,/const speechCuts=\[sentenceStart/);
});


test('sparse recording word anchors cannot move a narration source seek to an earlier sentence',async()=>{
 const turn={...record,words:[[0,10,11],[text.indexOf('Final'),50,51]]};
 const h=setup({id:'doc',engine:'device',paused:false},text.indexOf('selected'),turn);
 await h.click();assert.equal(h.starts[0][0].offset,text.indexOf('A selected'));
 assert.equal(h.recordings.length,0);
});


test('active narration seeks untimed transcript and document source text without a recording',async()=>{
 const starts=[],context=vm.createContext({readerEditing:()=>false,narration:{id:'doc',engine:'device',paused:false},sentenceAtTime,timeAtSentenceOffset,sentenceAtOffset,ds:()=>({caseId:'case'}),docCache:new Map([['doc',{pages:[{text}]}]]),transcriptClickOffset:()=>text.indexOf('selected'),startNarration:async(...args)=>starts.push(args),listen:()=>{throw Error('must not switch to recording')}});
 vm.runInContext(code,context);
 await context.seekTranscriptText({target:{closest:selector=>selector==='.page-text'?{dataset:{page:'0'}}:null}},{dataset:{}},'doc');
 assert.equal(starts.length,1);assert.equal(starts[0][0].offset,text.indexOf('A selected'));assert.equal(starts[0][0].page,0);
});


test('clicking an omitted footnote leaves active narration untouched',async()=>{
 let calls=0;
 const context=vm.createContext({readerEditing:()=>false,narration:{id:'doc',engine:'device',paused:false},ds:()=>{throw Error('footnote click must be ignored before source lookup')},startNarration:()=>calls++,listen:()=>calls++});
 vm.runInContext(code,context);
 await context.seekTranscriptText({target:{closest:selector=>selector==='.footnote-entry,.reader-footnotes'?{}:null}},{dataset:{}},'doc');
 assert.equal(calls,0);
});
