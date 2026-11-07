import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';
import {briefContents} from '../dist/reader-contents.js';
import {citationsIn,passageAround,excerptOf,citedNames,shortCaseIn} from '../dist/reader-authorities.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../dist/'+p,import.meta.url),'utf8'));
const empty={querySelector:()=>null,querySelectorAll:()=>[],classList:{toggle(){},add(){},remove(){}},dataset:{},style:{setProperty(){}},addEventListener(){},append(){}};
class Media{currentTime=0;duration=300;volume=1;paused=true;playbackRate=1;addEventListener(){}pause(){this.paused=true}play(){this.paused=false;return Promise.resolve()}removeAttribute(){}}
const ctx=vm.createContext({console,URL,URLSearchParams,Intl,Map,Set,WeakMap,WeakSet,JSON,Math,Date,Number,String,RegExp,Array,Object,structuredClone,performance,assert,read,briefContents,citationsIn,passageAround,excerptOf,citedNames,shortCaseIn,Audio:Media,MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}disconnect(){}},IntersectionObserver:class{observe(){}},location:{hash:'#/home',hostname:'localhost',href:'http://localhost/'},window:{addEventListener(){},scrollTo(){}},document:{...empty,body:empty,documentElement:empty,getElementById:()=>null,querySelector:()=>empty,addEventListener(){},createTreeWalker:()=>({nextNode:()=>null})},localStorage:{getItem:()=>null,setItem(){}},CSS:{escape:s=>s,highlights:new Map()},navigator:{},pdfjsLib:{GlobalWorkerOptions:{}},setTimeout,clearTimeout,requestAnimationFrame:()=>0,cancelAnimationFrame(){},NodeFilter:{SHOW_TEXT:4},innerWidth:1280,innerHeight:900});
let src=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace(/^init\(\);$/m,'');
vm.runInContext(src,ctx,{filename:'app.js'});
vm.runInContext(`
catalog=read('data/catalog.json');currentTerm=read('data/current-term.json');currentTextIndex=read('data/current-text-index.json');readerStructure=read('data/reader-structure.json');readingLayout=read('data/reading-layout.json');argumentAlignment=read('data/argument-alignment.json');profiles=read('data/profiles.json');for(const [name,p] of Object.entries(read('data/advocate-portraits.json')))profiles[name]={...profiles[name],...p,name};caseDisplay=read('data/case-display.json');caseIssues=read('data/case-issues.json');verifiedVotes=read('data/verified-votes.json');milestones=read('data/case-milestones.json');recordSupplement=read('data/record-supplement.json');termBenches=read('data/term-benches.json');currentAreas=read('data/current-areas.json');opinionSections={...read('data/opinion-sections.json'),...read('data/opinion-section-overrides.json')};pdfPaths=read('data/pdf-paths.json');
cases=[...catalog.cases,...currentTerm.cases].map(mergeCaseSources).map(c=>({...c,documents:c.documents.map(d=>({...d,...currentTextIndex[d.id]}))}));caseMap=new Map(cases.map(c=>[c.id,c]));docs=new Map(cases.flatMap(c=>c.documents).map(d=>[d.id,d]));for(const list of Object.values(opinionSections))for(const d of list)docs.set(d.id,d);

const exported=[];
for(const c of cases.filter(c=>c.argued&&(!argumentAlignment[c.id]||argumentAlignment[c.id].timingMethod==='speech-aligned'))){
 const d=c.documents.find(d=>category(d)==='Argument'&&d.textPath);if(!d)continue;
 const data=read(d.textPath),turns=officialTranscriptTurns(d.id,data);
 exported.push({caseId:c.id,caseName:c.name,audio:c.audio,documentId:d.id,sourceUrl:d.sourceUrl,turns});
}
globalThis.exported=exported;
`,ctx);
if(!process.argv[2])throw new Error('Usage: node scripts/export_argument_turns.mjs <output.json>');const destination=path.resolve(process.argv[2]);
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(ctx.exported));
console.log(ctx.exported.map(x=>[x.caseId,x.turns.length,x.turns[0]?.parts.map(p=>p.text).join(' ')]));
