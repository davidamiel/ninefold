import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {openReaderEditor} from '../dist/reader-editor.js';
import {validateReaderContent,editedSpeechPages} from '../dist/reader-content.js';

const source=fs.readFileSync('dist/app.js','utf8');
test('tabs use a single text label with author separator and no overflow menu',()=>{
 const labelSource=source.slice(source.indexOf('function readerTabLabel('),source.indexOf('// Keep the active document visible'));
 const html=new Function('state','ds','documentLabel','esc','tabLabel','icon',labelSource+';return tabs();')(
  {tabs:['doc'],active:'doc'},()=>({}),()=> 'Dissent · Jackson',x=>x,()=> 'Dissent · Jackson',()=> 'X');
 assert.match(html,/>Dissent · Jackson<\/button>/);
 assert.doesNotMatch(html,/tab-menu-button|reader-tab-author/);
 assert.match(html,/aria-label="Close Dissent · Jackson"/);
});
test('export preserves current cleaned narration source coordinates',async()=>{
 const fn=source.slice(source.indexOf('async function exportNarrationPlan(){'),source.indexOf('async function requestNarrationMode('));
 let exported;const chunks=[{page:1,text:'The argument.',sourceStart:4,sourceEnd:17,highlightStart:4,highlightEnd:17}];
 const doc=new JSDOM('<body/>').window.document;doc.createElement=()=>({click(){},remove(){},set href(x){},set download(x){}});
 const run=new Function('state','ensureDoc','narrationChunks','URL','Blob','document','setTimeout','closeReaderMenu','toast',fn+';return exportNarrationPlan()');
 await run({active:'brief'},async()=>{},()=>chunks,{createObjectURL(b){exported=JSON.parse(b.data[0]);return 'blob:test'},revokeObjectURL(){}},class {constructor(data){this.data=data}}, {createElement:doc.createElement,body:{append(){}}},()=>{},()=>{},()=>{});
 assert.deepEqual(exported.chunks,chunks);assert.equal(exported.offsetUnits,'utf16');
});
test('reference panel links selected marker and preserves separate popup/sidebar copy',async()=>{
 const dom=new JSDOM('<body/>',{url:'http://localhost'});
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.confirm=()=>true;
 let published;
 const api={documentId:'doc',account:{user:{uid:'owner'},isAdmin:async()=>true,loadPublishedContent:async()=>[],publishContent:async(id,draft)=>{published=structuredClone(draft)}},
  snapshot:()=>({schema:1,caseId:'case',name:'Case',questions:[],documents:[{id:'doc',title:'Brief',category:'Merits'}]}),
  renderDocument:async()=>'<article class="document-body"><span class="page-text">See [12] here.</span></article>',
  references:()=>[{key:'r',number:12,fromDoc:'doc',name:'Case',canonical:'123 U.S. 456',label:'123 U.S. 456'}],
  pdf:()=>null,apply(){},commit(){},toast(){}};
 await openReaderEditor(api);
 const content=document.querySelector('.reader-edit-content'),text=content.querySelector('.page-text').firstChild;
 const range=document.createRange();range.setStart(text,4);range.setEnd(text,8);
 window.getSelection().removeAllRanges();window.getSelection().addRange(range);
 content.dispatchEvent(new dom.window.MouseEvent('mouseup',{bubbles:true}));
 document.querySelector('[data-editor=reference]').click();
 assert.equal(document.querySelector('.editor-fields select'),null);
 const form=document.querySelector('.reference-editor-form');
 assert.equal(form.elements.name.value,'Case');
 form.elements.popupText.value='Short popup';
 form.elements.sidebarText.value='Detailed sidebar';
 form.querySelector('[data-link-reference]').click();
 assert.equal(content.textContent,'See [12] here.');
 assert.equal(content.querySelectorAll('.citation').length,1);
 assert.equal(content.querySelector('.citation').dataset.refKey,'r');
 document.querySelector('[data-editor=save]').click();
 await new Promise(resolve=>setTimeout(resolve,0));
 const saved=published.documents[0].readerContent;
 validateReaderContent(saved);
 assert.equal(saved.references[0].popupText,'Short popup');
 assert.equal(saved.references[0].sidebarText,'Detailed sidebar');
 assert.equal(document.querySelector('.reader-editor-panel'),null);
});

test('saved citation markers are silent without moving source coordinates',()=>{
 const pages=editedSpeechPages({nodes:[{tag:'span',attrs:{class:'page-text'},children:['See ',{tag:'span',attrs:{class:'citation'},children:['[12]']},' here.']}]});
 assert.equal(pages[0].text,'See      here.');
 assert.equal(pages[0].text.indexOf('here'),9);
});
