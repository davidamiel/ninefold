import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const id='24-440-ffcc04da2f19';
const data=JSON.parse(fs.readFileSync('dist/data/docs/'+id+'.json'));
const structure=JSON.parse(fs.readFileSync('dist/data/reader-structure.json'))[id];
const curated=JSON.parse(fs.readFileSync('scripts/curated-reader-structure.json'))[id];
const app=fs.readFileSync('dist/app.js','utf8');
function fn(name){const a=app.indexOf('function '+name+'(');return app.slice(a,app.indexOf('\nfunction ',a+1));}
function read(page,start=0,end=data.pages[page].text.length,includeFootnotes=false){
 const context=vm.createContext({data,page,start,end,includeFootnotes,readingCache:new Map(),displayMaps:new Map(),
 ds:()=>({category:'Decision'}),category:d=>d.category,structureFor:()=>structure,layoutPage:()=>({footnotes:structure.footnotes.filter(f=>f.page===page)}),
 tidyHeadingSpace:x=>x,tidyFootnoteMarkers:x=>x,extendHeadingMarker:x=>x});
 for(const name of ['lowerBound','normalizeReadingTypography','repairReading','preserveCounselBlocks','readingText'])vm.runInContext(fn(name),context);
 return vm.runInContext('readingText(data.pages[page].text,"'+id+'",page,data,start,end,includeFootnotes)',context);
}
test('opposition repairs match exact source evidence and render with stable maps',()=>{
 assert.deepEqual(curated,structure);assert.equal(structure.repairs.length,12);
 const evidence=JSON.parse(fs.readFileSync('reviews/berk-opposition-visual-evidence.json'));
 const ledger=JSON.parse(fs.readFileSync('dist/data/document-correction-evidence.json'))[id];
 assert.equal(evidence.pages.length,40);
 for(const r of structure.repairs){
  assert.equal(data.pages[r.page].text.slice(r.start,r.end),r.expectedText);
  const e=ledger.find(e=>e.page===r.page&&e.start===r.start&&e.end===r.end);
  assert(e);assert.equal(e.original,r.expectedText);assert.equal(e.replacement,r.text);
  assert.equal(e.sourcePage,r.page+1);assert.equal(e.sourceSha256,evidence.sourceSha256);
  const result=read(r.page,0,data.pages[r.page].text.length,true);
  assert(result.text.includes(r.text),r.expectedText);assert.equal(result.text.length,result.map.length);
  for(let i=1;i<result.map.length;i++)assert(result.map[i]>=result.map[i-1]);
 }
});
test('all opposition footnotes and continuations leave prose while preserving markers',()=>{
 assert.equal(structure.footnotes.length,20);assert.equal(structure.footnoteMarkers.length,17);
 assert.deepEqual(structure.footnotes.filter(f=>f.label!=='continued').map(f=>f.label),Array.from({length:17},(_,i)=>String(i+1)));
 for(const f of structure.footnotes){
  const raw=data.pages[f.page].text.slice(f.start,f.end);
  if(f.label!=='continued')assert(raw.startsWith(f.label+'.'));
  assert(read(f.page,f.start,f.end,true).text.length>30);
  assert(!read(f.page).map.some(o=>o>=f.start+5&&o<f.end),'footnote leaked '+f.page+':'+f.label);
 }
 for(const m of structure.footnoteMarkers){
  assert.equal(data.pages[m.page].text.slice(m.start,m.end),m.label);
  assert(read(m.page).map.includes(m.start),'missing marker '+m.label);
 }
 assert(read(16).text.includes('In North Carolina'));
 assert(!read(16).text.includes('expiration of the statute'));
 assert(read(19,902,951,true).text.includes('74.351'));
 assert(read(19,952,1831,true).text.includes('766.106'));
 assert(!read(30).text.includes('different analyses concerning'));
 assert(read(31).text.includes('distinct lines of analysis'));
});
