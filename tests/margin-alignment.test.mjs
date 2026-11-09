import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync('dist/app.js','utf8');
const implementation=source.slice(source.indexOf('function marginAnchor('),source.indexOf("\nwindow.addEventListener('resize',scheduleMargins)"));
function fixture(){
 const dom=new JSDOM(`<article class="document-body" data-document="doc"><span class="page-text" data-page="0"><a class="citation" data-ref-key="a">[37]</a> <a class="citation" data-ref-key="b">[38]</a> <a class="citation" data-ref-key="c">[39]</a><span data-annotation="note">Highlighted text</span></span><span class="page-marker"></span><span class="page-text" data-page="1"></span><aside class="document-margin"></aside></article>`);
 const document=dom.window.document;const tops={a:100,b:100,c:130,note:160};let shift=0;
 document.querySelector('article').getBoundingClientRect=()=>({top:20});
 document.createRange=()=>({selectNodeContents(el){this.el=el},setEnd(){},getClientRects(){const top=tops[this.el.dataset.refKey||this.el.dataset.annotation]??200;return [{top:top+shift,height:20,width:80},{top:top+shift+30,height:20,width:20}]},getBoundingClientRect(){return this.getClientRects()[0]}});
 const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
 const state={marginNotes:true,notes:[{id:'note',comment:'Important',docId:'doc'},{id:'pageNote',comment:'Page note',page:1,docId:'doc'}]};let positioned=0,menu;
 const ctx=vm.createContext({document,state,refsIndex:new Map([['a',{number:37}],['b',{number:38}],['c',{number:39}]]),icon:n=>`<svg data-icon="${n}"></svg>`,esc,button:(label,a,v,cls,extra)=>`<button data-action="${a}" data-value="${v}" class="${cls}" ${extra}>${label}</button>`,noteMatches:()=>true,positionSelection(){positioned++},mountMenu(trigger,html){menu={trigger,html}},setTimeout,clearTimeout});
 vm.runInContext(implementation,ctx);return {document,state,refs:ctx.refsIndex,run:()=>vm.runInContext('layoutMargins()',ctx),shift:n=>shift=n,positioned:()=>positioned,menu:()=>menu};
}
test('same-line references retain icons and numbers without moving following lines',()=>{
 const f=fixture();f.run();const items=[...f.document.querySelectorAll('.margin-item')];assert.equal(items.length,4);assert.deepEqual(items.map(x=>x.style.top),['90px','120px','150px','190px']);
 const group=items[0].querySelector('button');assert.equal(group.textContent,'37, 38');assert(group.querySelector('svg[data-icon="book"]'));assert.match(group._marginItems,/data-ref-key="a"/);assert.match(group._marginItems,/data-ref-key="b"/);
 assert.equal(items[1].querySelector('small').textContent,'39');assert(items[1].querySelector('svg'));group.click();assert.match(f.menu().html,/On this line/);assert.match(f.menu().html,/\[37\]/);
});
test('reflow recomputes first-line centers, clears old markers, and accepts empty edited pages',()=>{
 const f=fixture();f.run();f.shift(43);f.run();assert.equal(f.document.querySelectorAll('.margin-item').length,4);assert.equal(f.document.querySelector('.margin-item').style.top,'133px');assert.equal(f.positioned(),2);f.state.marginNotes=false;f.run();assert.equal(f.document.querySelectorAll('.margin-item').length,0);
});
test('margin CSS centers controls and offers readable grouped references',()=>{
 const css=fs.readFileSync('dist/reader.css','utf8');assert.match(css,/transform:translateY\(-50%\)/);assert.match(css,/margin-reference-list \.margin-label\{white-space:normal/);assert.doesNotMatch(implementation,/bottom\+24/);
});

test('draft reference numbers appear immediately without publishing reference metadata',()=>{
 const f=fixture(),citation=f.document.querySelector('[data-ref-key="c"]');f.refs.delete('c');citation.dataset.refNumber='39';f.run();assert.equal(f.document.querySelector('.margin-reference[data-ref-key="c"] small').textContent,'39');assert.equal(f.refs.has('c'),false);
 const content=f.document.createElement('div');content.className='reader-edit-content';f.document.querySelector('article').append(content);content.append(citation);f.run();assert.equal(f.document.querySelector('.margin-reference[data-ref-key="c"] small').textContent,'39');assert.equal(f.refs.has('c'),false);
 citation.remove();f.run();assert.equal(f.document.querySelector('.margin-reference[data-ref-key="c"]'),null);
});
