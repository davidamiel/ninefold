import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
function setup(){
 const dom=new JSDOM('<div class="reader-edit-toolbar"><button>Save</button><span role="status"></span></div><div class="pane reader-editing"><div class="reader-edit-content" contenteditable="true">Unsaved correction</div></div><input id="page-markers" type="checkbox"><select id="split-select"><option>Other</option></select><a href="other.pdf">PDF</a>',{url:'http://localhost/#/reader/case/doc',runScripts:'outside-only'});
 const code=source.slice(source.indexOf('function readerEditing()'),source.indexOf("document.addEventListener(type,guardReaderEditingEvent,true);")+"document.addEventListener(type,guardReaderEditingEvent,true);".length);
 dom.window.eval(code);return dom;
}
test('editing guards checkbox/select/input/keyboard and early PDF clicks before app mutation',()=>{
 const {window:w}=setup();let mutations=0;for(const type of ['click','change','input','keydown','pointerdown'])w.document.addEventListener(type,()=>mutations++);
 for(const [selector,type]of [['input','click'],['input','change'],['select','change'],['input','input'],['select','keydown'],['a','click'],['.pane','pointerdown']]){const e=new w.Event(type,{bubbles:true,cancelable:true});w.document.querySelector(selector).dispatchEvent(e);assert.equal(e.defaultPrevented,true,selector+' '+type);}
 assert.equal(mutations,0);assert.match(w.document.querySelector('[role=status]').textContent,/Save or cancel/);
 w.document.querySelector('.reader-edit-content').dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('button').click();assert.equal(mutations,2,'editing and toolbar still work');
});
test('Back/Forward during editing preserves reader route, draft, and state',()=>{
 const {window:w}=setup();w.eval(`var stateMutations=0; function locationKey(){return '#/reader/case/doc'}; function storePositions(){stateMutations++}; function saveWorkspace(){stateMutations++}; function readLocation(){stateMutations++}; function render(){stateMutations++}; let restoringHistory=false; const state={route:'reader'};`+source.match(/window.addEventListener\('popstate',\(\)=>\{.*\}\);/)[0]);
 w.history.pushState(null,'','#/cases');w.dispatchEvent(new w.PopStateEvent('popstate'));
 assert.equal(w.location.hash,'#/reader/case/doc');assert.equal(w.eval('stateMutations'),0);assert.match(w.document.querySelector('.reader-edit-content').textContent,/Unsaved correction/);
});
test('refreshDocuments and pane focus have early editing guards',()=>{
 assert.match(source,/function refreshDocuments\(\)\{if\(readerEditing\(\)\)return;storePositions/);
 assert.match(source,/function focusReaderPane\(id\)\{if\(readerEditing\(\)\)return;/);
});
