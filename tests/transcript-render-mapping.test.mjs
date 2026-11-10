import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {timeAtSentenceOffset} from '../dist/transcript-timing.js';

const source=fs.readFileSync('dist/app.js','utf8');
const declaration=source.split('\n').find(line=>line.startsWith('function timedParagraphs('));
function render(text, renderer, editor=false){
 const displayMaps=new Map(), input=Array.from({length:text.length},(_,i)=>i);
 const context=vm.createContext({displayMaps,timeAtSentenceOffset,renderText:(part,id,page,map)=>{
   const result=renderer(part,map);
   if(!editor)displayMaps.set(id+':'+page,result.map);
   return result.text;
 }});
 vm.runInContext(declaration,context);
 const html=context.timedParagraphs(text,input,{text,start:0},'transcript',0);
 return {html,map:Array.from(displayMaps.get('transcript:0'))};
}
test('all paragraphs retain source offsets for highlighting before and after seeking',()=>{
 const text='First sentence.\n\nSecond sentence.\n\nThird sentence.';
 const {html,map}=render(text,(text,map)=>({text,map}));
 assert.equal(html.replace(/<[^>]*>/g,''),text);
 assert.deepEqual(map,Array.from({length:text.length},(_,i)=>i));
 for(const sentence of ['Third sentence.','First sentence.','Second sentence.']){
   const start=text.indexOf(sentence),end=start+sentence.length;
   const lower=value=>{const i=map.findIndex(x=>x>=value);return i<0?map.length:i};
   assert.equal(text.slice(lower(start),lower(end)),sentence);
 }
});
test('the complete turn map includes transformed paragraphs and paragraph separators',()=>{
 const text='One.\n\nTwo.\n\nThree.';
 const {html,map}=render(text,(text,map)=>({text:text.slice(1),map:map.slice(1)}));
 const displayed=html.replace(/<[^>]*>/g,'');
 assert.equal(displayed,'ne.\n\nwo.\n\nhree.');
 assert.equal(map.length,displayed.length);
 assert.equal(map.map(i=>text[i]).join(''),displayed);
});
test('renderers that leave mapping untouched still preserve every paragraph',()=>{
 const text='First.\n\nSecond.';
 const {map}=render(text,(text,map)=>({text,map}),true);
 assert.deepEqual(map,Array.from({length:text.length},(_,i)=>i));
});

function audioContext(overrides={}){
 const cases=new Map([['a',{id:'a',audio:{url:'a.mp3'}}],['b',{id:'b'}],['c',{id:'c',audio:{url:'c.mp3'}}]]);
 const context=vm.createContext({
  caseMap:cases,argumentAlignment:{},audioCase:'a',audioSession:null,
  state:{route:'reader',active:'b'},contextCase:id=>cases.get(id),getCase:()=>cases.get('b'),ds:()=>null,
  currentTimedDoc:()=>null,followTranscript:true,icon:()=>'',esc:x=>x,
  button:(label,action,value)=>'<button data-action="'+action+'" data-value="'+value+'">'+label+'</button>',
  mountMenu:(trigger,html)=>{context.menu=html},stopNarration(){},refreshPlayback(){},closeReaderMenu(){},toast(){},
  navigator:{},audio:{src:'a.mp3',volume:1,currentTime:12,playCalls:0,async play(){this.playCalls++}},
  ...overrides
 });
 for(const name of ['listen','listenMenu']){
   vm.runInContext(source.split('\n').find(line=>line.startsWith('function '+name+'(')||line.startsWith('async function '+name+'(')),context);
 }
 return context;
}
test('an unavailable viewed case never offers the currently playing case recording',()=>{
 const context=audioContext();
 context.listenMenu(null);
 assert(!context.menu.includes('Play oral argument recording'));
 context.state.active='c';context.listenMenu(null);
 assert(context.menu.includes('data-value="c">Play oral argument recording'));
});
test('unavailable recordings do not resume another case; available recordings switch identity',async()=>{
 const context=audioContext();
 await context.listen('b');
 assert.equal(context.audio.playCalls,0);
 assert.equal(context.audio.src,'a.mp3');
 assert.equal(context.audioCase,'a');
 await context.listen('c');
 assert.equal(context.audio.src,'c.mp3');
 assert.equal(context.audioCase,'c');
 assert.equal(context.audio.playCalls,1);
 await context.listen('a');
 assert.equal(context.audio.src,'a.mp3');
 assert.equal(context.audioCase,'a');
 assert.equal(context.audio.playCalls,2);
});
test('a timing session without a recording URL also leaves other playback untouched',async()=>{
 const context=audioContext({argumentAlignment:{b:{sessions:[{id:'missing'}]}}});
 await context.listen('b');
 assert.equal(context.audio.playCalls,0);
 assert.equal(context.audio.src,'a.mp3');
});

test('rendered later paragraphs carry distinct estimated seek times',()=>{
 const text='First sentence.\n\nSecond sentence.\n\nThird sentence.',displayMaps=new Map();
 const context=vm.createContext({displayMaps,timeAtSentenceOffset,renderText:(s,id,page,map)=>{displayMaps.set(id+':'+page,map);return s;}});
 vm.runInContext(declaration,context);
 const turn={text,start:5,end:100,blocks:[{text,start:5,end:100}]};
 const html=context.timedParagraphs(text,Array.from({length:text.length},(_,i)=>i),turn,'transcript',0);
 const times=Array.from(html.matchAll(/data-seek-start="([^"]+)"/g),m=>Number(m[1]));
 assert.equal(times.length,3);assert(times[0]<times[1]&&times[1]<times[2]);
});
test('transcript hit testing maps nested rendered text through source offsets',()=>{
 const code=source.slice(source.indexOf('function transcriptClickOffset('),source.indexOf('function timedParagraphs('));
 const node={},text={dataset:{page:'2'},contains:n=>n===node},turn={contains:n=>n===text};
 const event={target:{closest:()=>text},clientX:20,clientY:30};
 const context=vm.createContext({displayMaps:new Map([['doc:2',[10,11,20,21]]]),document:{caretPositionFromPoint:()=>({offsetNode:node,offset:1}),createRange:()=>({selectNodeContents(){},setEnd(){},toString:()=>'ab'})}});
 vm.runInContext(code,context);assert.equal(context.transcriptClickOffset(event,turn,'doc'),20);
 context.document.caretPositionFromPoint=()=>({offsetNode:{},offset:0});assert.equal(context.transcriptClickOffset(event,turn,'doc'),null);
 delete context.document.caretPositionFromPoint;context.document.caretRangeFromPoint=()=>({startContainer:node,startOffset:1});assert.equal(context.transcriptClickOffset(event,turn,'doc'),20);
});
test('transcript click seeking retains selection and interactive-anchor guards',()=>{
 assert.match(source,/turn&&!b&&!e\.target\.closest\('\[data-ref-key\],\[data-annotation\]'\)&&window\.getSelection\(\)\?\.isCollapsed/);
 assert.match(source,/start=source===null\?null:timeAtSentenceOffset\(record,source\)/);
});
