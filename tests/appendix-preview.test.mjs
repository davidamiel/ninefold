import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {excerptOf} from '../dist/reader-authorities.js';
const app=fs.readFileSync('dist/app.js','utf8');
function functionsBetween(first,next){return app.slice(app.indexOf('function '+first+'('),app.indexOf('function '+next+'('));}
function preview({source='CA4 Appendix (JA) 91 ¶ 4.',label='JA92',target=false}={}){
  const owner={id:'25-1408'};
  const doc={id:'joint',title:'Joint Appendix',pageCount:200,sourceUrl:'https://example.org/joint.pdf'};
  const context=vm.createContext({
    ref:{key:'ref',type:'appendix',label,canonical:label,fromDoc:'petition',passage:'The filing cites JA92 ¶¶ 9-10.'},
    docCache:new Map([['petition',{pages:[{text:source}]}],...(target?[['joint',{pages:[{text:'Original joint appendix page.'.repeat(4)}]}]]:[])]),
    authoritiesByCitation:new Map(),caseByCitation:new Map(),referenceDocs:new Map(),
    authorityIdentity:x=>x,citationsIn:()=>[],citedNames:()=>new Map(),contextCase:()=>owner,
    appendixTargets:()=>target?[doc]:[],appendixPage:()=>0,category:()=> 'Appendices',ds:id=>id==='joint'?doc:null,
    esc:x=>String(x??''),excerptOf,button:text=>`<button>${text}</button>`,external:()=>''
  });
  vm.runInContext(functionsBetween('appendixIdentity','renderText')+functionsBetween('referenceDetails','referenceHTML'),context);
  return {m:vm.runInContext('materialFor(ref)',context),html:vm.runInContext('referenceDetails(ref,true)',context)};
}
test('unmatched JA page is labeled Joint Appendix and context is not represented as source text',()=>{
  const {m,html}=preview();
  assert.equal(m.title,'Joint Appendix');assert.equal(m.meta,'Fourth Circuit · p. 92');
  assert.equal(m.missingAppendix,true);assert.equal(m.contextOnly,true);
  assert.equal(m.kind,'Context from this filing');assert.equal(m.excerpt,'The filing cites JA92 ¶¶ 9-10.');
  assert.match(html,/Cited page unavailable/);assert.match(html,/<details class="reference-context"><summary>Show context from this filing<\/summary>/);
  assert(!/<details[^>]*\bopen\b/.test(html));
  assert.match(html,/<details[\s\S]*The filing cites JA92 ¶¶ 9-10\.[\s\S]*<\/details>/);
  assert(!html.includes('New Tab'));assert(!m.doc);
});
test('JA labels do not guess a court when the source does not define it',()=>{
  for(const label of ['JA92','J.A. 92','J. A. 92']){
    const {m}=preview({source:'This filing cites a record.',label});
    assert.equal(m.title,'Joint Appendix');assert.equal(m.meta,'p. 92');
  }
});
test('matched Joint Appendix page uses original text without unavailable or context fallback labels',()=>{
  const {m,html}=preview({target:true});
  assert.equal(m.title,'Joint Appendix');assert.equal(m.missingAppendix,false);assert.equal(m.contextOnly,false);
  assert.match(m.excerpt,/Original joint appendix page/);assert(!html.includes('Cited page unavailable'));
  assert(!html.includes('reference-context'));assert(html.includes('New Tab'));
});
test('petition appendix is not relabeled Joint Appendix',()=>{
  const {m}=preview({label:'App.92a'});
  assert.notEqual(m.title,'Joint Appendix');assert.equal(m.missingAppendix,true);
});

test('expanding popup context repositions inside the viewport and survives async hydration',async()=>{
  let release;
  const ready=new Promise(resolve=>{release=resolve});
  const details={open:false};
  let toggle;
  const el={isConnected:true,dataset:{},style:{},offsetWidth:330,
    get offsetHeight(){return details.open?370:290},
    set innerHTML(_html){details.open=false},querySelector:()=>details,
    addEventListener:(name,fn,capture)=>{assert.equal(name,'toggle');assert.equal(capture,true);toggle=fn}
  };
  const trigger={dataset:{refKey:'ref'},isConnected:true,getBoundingClientRect:()=>({left:50,bottom:450})};
  const context=vm.createContext({trigger,refsIndex:new Map([['ref',{key:'ref',type:'appendix'}]]),clearPeek:()=>{},
    document:{createElement:()=>el},overlays:{append:()=>{}},materialFor:()=>({title:'Joint Appendix'}),
    esc:x=>x,button:()=>'',icon:()=>'',referenceDetails:()=>'',innerWidth:1179,innerHeight:757,
    loadExtendedAuthorities:()=>ready,locateAppendix:async()=>{},peekAnchor:null});
  const start=app.indexOf('async function showPeek('),end=app.indexOf('\nasync function keepRef(',start);
  vm.runInContext(app.slice(start,end),context);
  const task=vm.runInContext('showPeek(trigger)',context);
  details.open=true;toggle();
  assert.equal(el.style.top,'378px');assert(Number.parseFloat(el.style.top)+el.offsetHeight<=748);
  assert.equal(details.open,true);
  release();await task;
  assert.equal(details.open,true);assert.equal(el.style.top,'378px');
});

test('Keep Open does not repeat unavailable-appendix citing text outside its disclosure',()=>{
  const ref={key:'ref',fromDoc:'petition',passage:'JA92 ¶¶ 6, 8.'};
  const context=vm.createContext({state:{refs:[ref],ref:'ref',active:'petition'},refsIndex:new Map(),
    button:t=>`<button>${t}</button>`,icon:()=>'',referenceHTML:()=>'<details>Optional citing context</details>',
    materialFor:()=>({contextOnly:true}),esc:x=>x});
  vm.runInContext(functionsBetween('referencesSidebar','readSelection').split('\nasync function floatRef(')[0],context);
  const html=vm.runInContext('referencesSidebar()',context);
  assert(!html.includes('Referenced Here'));assert(!html.includes('¶¶'));
  assert(html.includes('Go to Passage'));assert.equal((html.match(/Optional citing context/g)||[]).length,1);
});
