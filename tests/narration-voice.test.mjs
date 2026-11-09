import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('dist/app.js','utf8');
function declaration(name){
 const start=source.indexOf('function '+name+'(');
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
  button:()=>'',icon:()=>''
 },'listenMenu({})');
 return html;
}
test('American male narration is selectable and restores its saved selection',()=>{
 const html=menu('am_michael');
 assert.match(html,/<option value="am_michael" selected>Michael · American male<\/option>/);
 assert.match(menu(undefined),/<option value="af_heart" selected>/);
 for(const voice of ['af_heart','af_bella','bm_george'])assert.match(html,new RegExp('value="'+voice+'"'));
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
test('changing voice persists selection and restarts from the same source location',()=>{
 const handler=source.split('\n').find(line=>line.startsWith("document.addEventListener('change'")&&line.includes("e.target.id==='natural-voice'"));
 assert(handler);
 let change,saved=0,anchor;
 const state={},narration={id:'document',index:1,chunks:[{}, {page:3,sourceStart:72}]};
 Function('document','state','narration','persist','startNarration',handler)(
  {addEventListener:(_type,fn)=>{change=fn}},state,narration,()=>{saved++},value=>{anchor=value});
 change({target:{id:'natural-voice',value:'am_michael',matches:()=>false}});
 assert.equal(state.naturalVoice,'am_michael');
 assert.equal(saved,1);
 assert.deepEqual(anchor,{docId:'document',page:3,offset:72});
});
