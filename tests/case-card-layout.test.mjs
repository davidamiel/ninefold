import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function arrangeCaseCards()'),source.indexOf("window.matchMedia('(max-width: 860px)').addEventListener"));
class Element {
 constructor(name,children=[]){this.name=name;this.children=[];for(const child of children)this.append(child)}
 append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(x=>x!==child);child.parentElement=this;this.children.push(child)}
 querySelector(selector){const name=selector.slice(1);for(const child of this.children){if(child.name===name)return child;const found=child.querySelector(selector);if(found)return found}return null}
}
for(const optional of [true,false])test(`case cards preserve DOM order through mobile/desktop transitions (${optional?'full':'sparse'})`,()=>{
 const e=n=>new Element(n),summary=new Element('case-summary-scroll',[e('outcome-card'),...(optional?[e('question-card')]:[]),e('connections-card')]);
 const workbench=new Element('case-workbench',[...(optional?[e('case-timeline')]:[]),e('case-materials')]);
 const canvas=new Element('case-canvas',[summary,workbench]);let narrow=true;
 const context=vm.createContext({document:{querySelector:()=>canvas},window:{matchMedia:()=>({matches:narrow})}});vm.runInContext(fn,context);
 const run=()=>vm.runInContext('arrangeCaseCards()',context);
 const names=parent=>parent.children.map(x=>x.name);
 const expected=['case-summary-scroll','case-workbench','outcome-card',...(optional?['case-timeline']:[]),...(optional?['question-card']:[]),'connections-card','case-materials'];
 run();assert.deepEqual(names(canvas),expected);run();assert.deepEqual(names(canvas),expected);
 narrow=false;run();assert.deepEqual(names(canvas),['case-summary-scroll','case-workbench']);assert.deepEqual(names(summary),['outcome-card',...(optional?['question-card']:[]),'connections-card']);assert.deepEqual(names(workbench),[...(optional?['case-timeline']:[]),'case-materials']);
 narrow=true;run();assert.deepEqual(names(canvas),expected);
});
test('case layout runs after rendering and restores on breakpoint change',()=>{
 assert.match(source,/workspaceDock\(\);arrangeCaseCards\(\)/);
 assert.match(source,/matchMedia\('\(max-width: 860px\)'\)\.addEventListener\('change', arrangeCaseCards\)/);
});

function focusFixture() {
 const dom=new JSDOM(`<button id="outside">Outside</button><div class="case-canvas"><aside class="case-summary-scroll"><section class="outcome-card"><button id="inside">Read syllabus</button></section><section class="connections-card"></section></aside><div class="case-workbench"><section class="case-materials"></section></div></div>`,{runScripts:'outside-only'});
 let narrow=true;
 dom.window.matchMedia=()=>({matches:narrow});
 dom.window.eval(fn);
 return {dom,document:dom.window.document,run(value){narrow=value;dom.window.arrangeCaseCards()}};
}
test('breakpoint reparenting restores focused card controls without scrolling in both directions',()=>{
 const {dom,document,run}=focusFixture();
 const control=document.querySelector('#inside');
 control.focus();
 const calls=[],originalFocus=control.focus.bind(control);
 control.focus=options=>{calls.push(options);originalFocus(options)};
 run(true);assert.equal(document.activeElement,control);assert.equal(calls.length,1);assert.equal(calls[0].preventScroll,true);
 run(true);assert.equal(calls.length,1,'unchanged layout must not refocus');
 run(false);assert.equal(document.activeElement,control);assert.equal(calls.length,2);assert.equal(calls[1].preventScroll,true);
 dom.window.close();
});
test('breakpoint reparenting leaves focus outside the cards untouched',()=>{
 const {dom,document,run}=focusFixture();
 const outside=document.querySelector('#outside');outside.focus();
 outside.focus=()=>assert.fail('must not refocus an outside control');
 run(true);assert.equal(document.activeElement,outside);
 run(false);assert.equal(document.activeElement,outside);
 dom.window.close();
});
test('breakpoint reparenting does not restore a disconnected focused control',()=>{
 const {dom,document,run}=focusFixture();
 const control=document.querySelector('#inside');control.focus();
 control.focus=()=>assert.fail('must not focus a disconnected control');
 const canvas=document.querySelector('.case-canvas'),append=canvas.append.bind(canvas);
 canvas.append=card=>{append(card);if(card.contains(control))control.remove()};
 run(true);assert.equal(control.isConnected,false);
 dom.window.close();
});
