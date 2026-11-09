import {DeviceNarrator} from '../dist/device-narration.js';
import {sentenceAtTime,timeAtSentenceOffset} from '../dist/transcript-timing.js';
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import {briefContents} from '../dist/reader-contents.js';
import {citationsIn,passageAround,excerptOf,citedNames,shortCaseIn} from '../dist/reader-authorities.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const empty={querySelector:()=>null,querySelectorAll:()=>[],classList:{toggle(){},add(){},remove(){}},dataset:{},style:{setProperty(){}},addEventListener(){},append(){}};
class Media{currentTime=0;duration=300;volume=1;paused=true;playbackRate=1;addEventListener(){}pause(){this.paused=true}play(){this.paused=false;return Promise.resolve()}removeAttribute(){}}
const ctx=vm.createContext({DeviceNarrator,console,URL,URLSearchParams,Intl,Map,Set,WeakMap,WeakSet,JSON,Math,Date,Number,String,RegExp,Array,Object,structuredClone,performance,assert,read,sentenceAtTime,timeAtSentenceOffset,briefContents,citationsIn,passageAround,excerptOf,citedNames,shortCaseIn,Audio:Media,MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}disconnect(){}},IntersectionObserver:class{observe(){}},location:{hash:'#/home',hostname:'localhost',href:'http://localhost/'},window:{addEventListener(){},scrollTo(){},matchMedia:()=>({matches:false,addEventListener(){}})},document:{...empty,body:empty,documentElement:empty,getElementById:()=>null,querySelector:()=>empty,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null})},localStorage:{getItem:()=>null,setItem(){}},CSS:{escape:s=>s,highlights:new Map()},navigator:{},pdfjsLib:{GlobalWorkerOptions:{}},setTimeout,clearTimeout,requestAnimationFrame:()=>0,cancelAnimationFrame(){},NodeFilter:{SHOW_TEXT:4},innerWidth:1280,innerHeight:900});
let src=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^init\(\);$/m,'');
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext(`
account={user:{uid:'test'},ready:true,save(){}};catalog=read('data/catalog.json');currentTerm=read('data/current-term.json');currentTextIndex=read('data/current-text-index.json');readerStructure=read('data/reader-structure.json');readingLayout=read('data/reading-layout.json');argumentAlignment=read('data/argument-alignment.json');profiles=read('data/profiles.json');for(const [name,p] of Object.entries(read('data/advocate-portraits.json')))profiles[name]={...profiles[name],...p,name};caseDisplay=read('data/case-display.json');caseIssues=read('data/case-issues.json');verifiedVotes=read('data/verified-votes.json');milestones=read('data/case-milestones.json');recordSupplement=read('data/record-supplement.json');termBenches=read('data/term-benches.json');currentAreas=read('data/current-areas.json');opinionSections={...read('data/opinion-sections.json'),...read('data/opinion-section-overrides.json')};pdfPaths=read('data/pdf-paths.json');
cases=[...catalog.cases,...currentTerm.cases].map(mergeCaseSources).map(c=>({...c,documents:c.documents.map(d=>({...d,...currentTextIndex[d.id]}))}));caseMap=new Map(cases.map(c=>[c.id,c]));docs=new Map(cases.flatMap(c=>c.documents).map(d=>[d.id,d]));for(const list of Object.values(opinionSections))for(const d of list)docs.set(d.id,d);registerTimedTranscripts();
assert(Object.keys(argumentAlignment).length>=64);
for(const c of cases.filter(c=>c.argued)){const sessions=argumentAlignment[c.id]?.sessions;if(!sessions?.length){const d=caseDocuments(c).find(d=>category(d)==='Argument');assert(d?.textPath,'No transcript '+c.id);const data=read(d.textPath);docCache.set(d.id,data);const html=documentHTML(d.id,data);assert(html.includes('speaker-message'),'No conversation '+c.id);assert(html.includes('Synchronized timing is not yet available'));continue}for(const session of sessions)for(const t of session.turns){assert(Number.isFinite(t.start)&&t.end>=t.start&&t.text.trim(),'Invalid turn');}const d=caseDocuments(c).find(d=>d.timedSession);assert(d,'No conversational document '+c.id);assert.equal(structureFor(d.id,docCache.get(d.id)).headings.length,0)}
for(const c of cases.filter(c=>c.term===2026&&c.argued)){assert(argumentAlignment[c.id]?.sessions?.length,'Current term lacks timing: '+c.id)}
for(const [caseId,record]of Object.entries(argumentAlignment).filter(([,r])=>r.timingMethod==='speech-aligned')){
 const d=[...docs.values()].find(d=>d.caseId===caseId&&d.timedSession),html=transcriptHTML(d.id,docCache.get(d.id));assert(html.includes('Official Court transcript'));assert(html.includes('Timestamps are approximate.'));assert(!html.includes('>Oyez</a>'));
 const turn=d.timedSession.turns.find(t=>t.text.length>700&&conversationText(t).text.includes('\\n\\n'));assert(turn,'No long turn to test');
 const parsed=conversationText(turn),markup=timedParagraphs(parsed.text,parsed.map,turn,d.id,0),seeks=[...markup.matchAll(/data-seek-start="([^"]+)"/g)].map(m=>Number(m[1]));assert(new Set(seeks).size>1,'Paragraphs all seek to turn start');assert(seeks.every(x=>x>=turn.start&&x<=turn.end));
}
state.route='cases';state.browseTerm=2025;state.termView='sittings';let html=casesPage();assert(html.includes('OT 2025'));assert(!html.includes('Find a year'));assert(!html.includes('id="argument-month"'));assert(html.includes('chooser-bench'));state.termView='all';html=casesPage();assert(html.includes('id="argument-month"'));assert(!html.includes('chooser-bench'));
state.route='applications';html=casesPage();assert(html.includes('>Orders</h1>'));assert(html.includes('register-scroll'));
state.caseId='26A634';const lower='26A634-b50e9653b5e8',data=read(ds(lower).textPath);docCache.set(lower,data);let clean=readingText(data.pages[0].text,lower,0,data);assert(clean.text.startsWith('On September 13, 2004'),'Lost first paragraph: '+clean.text.slice(0,100));assert(!clean.text.includes('USCA11 Case:'));assert(clean.map.length===clean.text.length);assert(clean.text.includes('Jesse Guardado'));
const filing='26A634-676a0dcce240',brief=read(ds(filing).textPath);docCache.set(filing,brief);assert(contentsFor(ds(filing),brief).some(h=>h.text==='IV. Conclusion'));
for(const [text,canonical] of [['Ford v. Wainwright, 477 U.S. 399, 409-10 (1986)','477 U.S. 399'],['See, e.g., In re Holladay, 331 F.3d at 1177','331 F.3d 1169'],['(citing Baze, 553 U.S. at 50).','553 U.S. 35']]){const hits=citationsIn(text,false,false,(v,r,n)=>shortCaseIn(brief,v,r,n));assert(hits.some(h=>h.canonical===canonical),text+JSON.stringify(hits));assert(hits[0].caseName,'No name hover: '+text)}
const refs=citationRanges('CA11- ECF 13-1 at 15',filing,15);assert(refs[0].ref.type==='record');
state.route='reader';state.active=lower;state.tabs=[lower,filing];state.split=filing;state.paneOrder=[lower,filing];html=readerPage();assert(html.includes('pane-tabs'));assert(!html.includes('split-caption'));assert(html.includes('is-focused'));
audioCase='24-1260';audioSession=argumentAlignment[audioCase].sessions[0].id;state.seekOpen=true;assert(playbackControls().includes('class="playback-seek"'));state.seekOpen=false;assert(playbackControls().includes('data-action="seek-toggle"'));state.route='home';assert(playbackControls().includes('data-action="return-audio"'));
console.log('PASS: '+Object.keys(argumentAlignment).length+' timed dockets and all untimed conversations; term/all filters; Orders; original first paragraph; heading and citation regressions; split tabs; audio seek and return controls.');
`,ctx,{timeout:120000});
await vm.runInContext(`(async()=>{const ref=citationRanges('CA11- ECF 13-1 at 15','26A634-676a0dcce240',15)[0].ref;await locateRecord(ref);assert.equal(ref.docId,'26A634-b50e9653b5e8');assert.equal(ref.recordPage,14);console.log('PASS: CA11 ECF citation resolves to the exact lower-court document and page.')})()`,ctx);
vm.runInContext(`
let pageChecks=0;for(const c of cases){state.caseId=c.id;state.caseSection='Decision';assert(casePage().includes(esc(c.name)));pageChecks++;}
for(const type of ['justices','advocates','amici','areas']){state.route=type;state.entityQuery='';assert(peoplePage().includes('id="entity-search"'));state.entityQuery='a';assert(peoplePage().includes('people-directory'));}
state.saved=[];state.recents=[];assert.equal((libraryPage().match(/class="library-section"/g)||[]).length,3);
state.saved=['24-440'];state.recents=[...docs.keys()].slice(0,3);assert.equal((libraryPage().match(/class="library-section"/g)||[]).length,3);
const partial={joiningScope:'See opening statement',sourceExcerpt:'Justice Gorsuch, with whom Justice Thomas and Justice Alito join, and with whom Justice Barrett joins as to Part I, dissenting.'};assert(joiningNote(partial,'Amy Coney Barrett').includes('Part I'));assert.equal(joiningNote(partial,'Clarence Thomas'),'');
console.log('PASS: '+pageChecks+' case pages, all directories, Library empty/populated structure, and part-specific joins.');
`,ctx,{timeout:120000});
// Validate every generated source offset against immutable source files.
const structures=read('data/reader-structure.json');let audited=0,headings=0;
for(const [id,structure] of Object.entries(structures)){
 const declared=vm.runInContext(`ds(${JSON.stringify(id)})?.textPath`,ctx);
 let file=declared&&declared!=='inline'?new URL('../dist/'+declared,import.meta.url):['data/docs/','data/current-docs/','data/statutes/'].map(base=>new URL('../dist/'+base+id+'.json',import.meta.url)).find(u=>fs.existsSync(u));
 if(!file)continue;const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!data.pages)continue;
 const pages=data.pages.map(p=>typeof p==='string'?{text:p}:p);
 assert(structure.bodyStart.page<pages.length,id+' starts past end');assert(structure.bodyStart.offset<=pages[structure.bodyStart.page].text.length,id+' invalid start');
 for(const h of structure.headings||[]){assert(h.start>=0&&h.end<=pages[h.page].text.length&&h.end>=h.start,id+' invalid heading');assert(!/^(?:MR\.|MS\.|MRS\.|IN THE SUPREME COURT|APPEARANCES:|C O N T E N T S)/.test(h.text),id+' false heading');headings++}
 for(const r of structure.omitRanges||[])assert(r.start>=0&&r.end<=pages[r.page].text.length,id+' invalid omission');audited++;
}
console.log('PASS: source bounds and false-heading checks for '+audited+' documents / '+headings+' headings.');
