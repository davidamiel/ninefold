import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('dist/app.js','utf8');
function declaration(name){
 const start=source.search(new RegExp('^(?:async )?function '+name+'\\(','m'));
 assert(start>=0);
 const end=source.indexOf('\nfunction ',start+1);
 return source.slice(start,end<0?undefined:end);
}
function run(name,values,expression){
 return Function(...Object.keys(values),declaration(name)+'\nreturn '+expression)(...Object.values(values));
}
function menu(voice){
 let html;
 run('listenMenu',{
  audioCase:null,caseMap:new Map(),contextCase:()=>({}),ds:()=>({textPath:'document'}),
  state:{active:'document',naturalVoice:voice},mountMenu:(_trigger,value)=>{html=value},
  button:(label,action,value)=>`<button data-action="${action}" data-value="${value}">${label}</button>`,icon:()=>''
 },'listenMenu({})');
 return html;
}
test('Listen presents only Natural and Fast choices without voice dropdowns or instructions',()=>{
 const html=menu('am_michael');
 assert.match(html,/data-value="natural">Natural/);assert.match(html,/data-value="device">Fast/);
 assert.doesNotMatch(html,/<select|Available voices|Online voices|Skip moves|Heart|Bella|Michael|George/);
 assert.match(source,/voice:'am_michael'/);
});
test('American male selection reaches generation for the current and prefetched chunks',async()=>{
 const messages=[],voicePending=new Map();
 const worker={postMessage(message){
  messages.push(message);
  voicePending.get(message.id).resolve({wav:new ArrayBuffer(8),duration:2});
 }};
 const n={voice:'am_michael',token:4,chunks:[{text:'First sentence.'},{text:'Second sentence.'}],cache:new Map(),pending:new Map()};
 const values={narration:n,voiceRequest:0,voicePending,state:{naturalVoice:'am_michael'},
  getVoiceWorker:()=>worker,URL:{createObjectURL:()=> 'blob:voice'},Blob:class{},n};
 await run('generateChunk',values,'Promise.all([generateChunk(n,0),generateChunk(n,1)])');
 assert.equal(messages.length,2);
 assert.deepEqual(messages.map(m=>m.voice),['am_michael','am_michael']);
 assert.deepEqual(messages.map(m=>m.session),[4,4]);
 assert.equal(n.cache.size,2);
});
test('requesting Natural or Fast preserves source position and pause state without voice menus',async()=>{
 for(const mode of ['natural','device']){
  let saved=0,args;
  const state={active:'document',deviceVoice:'old-online-voice'},narration={id:'document',index:1,paused:true,chunks:[{}, {page:3,sourceStart:72}]};
  await run('requestNarrationMode',{state,narration,persist:()=>saved++,startNarration:async(...values)=>args=values},`requestNarrationMode('${mode}')`);
  assert.equal(state.narrationEngine,mode);assert.equal(state.naturalVoice,'am_michael');assert.equal(state.deviceVoice,undefined);assert.equal(saved,1);
  assert.deepEqual(args,[{docId:'document',page:3,offset:72},{paused:true}]);
 }
});
test('a new audio request starts the active document without a second confirmation',async()=>{
 let args;
 await run('requestNarrationMode',{state:{},narration:null,persist(){},startNarration:async(...values)=>args=values},"requestNarrationMode('natural')");
 assert.deepEqual(args,[null,{paused:false}]);
});

test('requesting audio on another document does not restart the old document',async()=>{
 let args;
 await run('requestNarrationMode',{state:{active:'new-doc'},narration:{id:'old-doc',index:0,paused:true,chunks:[{page:4,sourceStart:12}]},persist(){},startNarration:async(...values)=>args=values},"requestNarrationMode('device')");
 assert.deepEqual(args,[null,{paused:false}]);
});
