import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {auditDocument} from '../scripts/audit_document_quality.mjs';
const id='24-1016-dffa73766c90';
const rawBytes=fs.readFileSync(`dist/data/current-docs/${id}.json`);
const data=JSON.parse(rawBytes);
const structure=JSON.parse(fs.readFileSync('dist/data/reader-structure.json'))[id];
const curated=JSON.parse(fs.readFileSync('scripts/curated-reader-structure.json'))[id];
const evidence=JSON.parse(fs.readFileSync('dist/data/document-correction-evidence.json'))[id];
const manual=JSON.parse(fs.readFileSync('scripts/riseandshine-manual-corrections.json'));
const recovery=JSON.parse(fs.readFileSync('scripts/riseandshine-recovery-evidence.json'));
const app=fs.readFileSync('dist/app.js','utf8');
function fn(name){const a=app.indexOf(`function ${name}(`);return app.slice(a,app.indexOf('\nfunction ',a+1));}
function read(page,source=data,options={}){
 const context=vm.createContext({data:source,page,start:options.start??0,end:options.end??source.pages[page].text.length,includeFootnotes:options.includeFootnotes??false,readingCache:new Map(),displayMaps:new Map(),runningLineCache:new WeakMap(),
  ds:()=>({category:'Petition'}),category:d=>d.category,structureFor:()=>({...structure,bodyStart:{page:0,offset:0},omitRanges:[]}),layoutPage:()=>options.layout?{footnotes:(structure.footnotes||[]).filter(f=>f.page===page)}:{},
  tidyHeadingSpace:x=>x,tidyFootnoteMarkers:x=>x,extendHeadingMarker:x=>x});
 for(const name of ['normalizedMargin','runningLines','lowerBound','normalizeReadingTypography','repairReading','readingText'])vm.runInContext(fn(name),context);
 return vm.runInContext('readingText(data.pages[page].text,"fixture",page,data,start,end,includeFootnotes)',context);
}
test('RiseandShine repairs preserve immutable raw bytes and have exact source evidence',()=>{
 assert.equal(crypto.createHash('sha256').update(rawBytes).digest('hex'),'b04cf6e40f7aef93fc05a1a72f7b35d0d2be46cccc594e1e24a46cf3536d21cd');
 assert.equal(structure.repairs.length,1321);
 assert.deepEqual(curated.repairs,structure.repairs);
 assert.deepEqual(auditDocument(id,data.pages,structure,{},evidence),[]);
 for(const e of evidence){
  assert.equal(e.sourceUrl,data.sourceUrl);
  assert.equal(e.sourceSha256,'106009dd595ddabaa805eae20946b77ce3b20f79f70c70928a6ac966e5b474d3');
  assert.equal(e.sourcePage,e.page+1);
 }
 for(const r of structure.repairs){
  assert(recovery.recoveredPages.includes(r.page)||manual.repairs.some(m=>m.page===r.page));
  assert.equal(data.pages[r.page].text.slice(r.start,r.end),r.expectedText);
  assert.equal(r.sourcePdfPage,r.page+1);
  assert(['docs/riseandshine-font-recovery.md','docs/riseandshine-ocr-review.md'].includes(r.evidence));
 }
});
test('reviewed appendix text renders without encoded glyphs and retains source offsets',()=>{
 for(const page of recovery.recoveredPages){
  const result=read(page);
  assert(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(result.text));
  assert.equal(result.text.length,result.map.length);
  for(let i=0;i<result.map.length;i++){
   assert(result.map[i]>=0&&result.map[i]<data.pages[page].text.length);
   if(i)assert(result.map[i]>=result.map[i-1]);
  }
  for(const r of structure.repairs.filter(r=>r.page===page)){
   const displayIndex=result.map.findIndex(offset=>offset>=r.start);
   assert.equal(result.text.slice(displayIndex,displayIndex+r.text.length),r.text,`repair on page ${page}`);
   const mapped=result.map.slice(displayIndex,displayIndex+r.text.length);
   assert(mapped.every(offset=>offset>=r.start&&offset<r.end));
  }
 }
 assert(read(49).text.includes('as to source, but also as to sponsorship, affiliation or connection.” Int’l Info. Sys. Sec. Certification Consortium,'));
 assert(read(49).text.includes('823 F.3d 153, 161 (2d Cir. 2016)'));
 assert(read(52).text.includes('the final step of the analysis is to balance the various factors to answer the ultimate question of whether'));
 assert(read(53).text.includes('574 U.S. 418, 135 S. Ct. 907, 190 L. Ed. 2d 800 (2015)'));
 assert(read(56).text.includes('panel was sufficiently developed and the facts necessary to shape the proper legal matrix were sufficiently clear.”);'));
});
test('stale appendix repairs fail closed and divergent OCR pages are not overwritten',()=>{
 const r=structure.repairs.find(r=>r.page===49);
 const changed=structuredClone(data);
 changed.pages[49].text=changed.pages[49].text.slice(0,r.start)+'X'.repeat(r.end-r.start)+changed.pages[49].text.slice(r.end);
 assert(read(49,changed).text.includes('X'.repeat(r.end-r.start)));
 assert(!structure.repairs.some(r=>recovery.skippedDivergentPages.includes(r.page)&&r.evidence!=='docs/riseandshine-ocr-review.md'));
 assert(!structure.repairs.some(r=>[0,29,100,106,122].includes(r.page)));
 assert(data.pages[104].text.includes('111. LEGAL STANDARD'),'legacy OCR defects remain explicitly outside automated recovery');
});

test('all recovered pages reconstruct the source-backed coordinate extraction',()=>{
 const typography=vm.createContext({});vm.runInContext(fn('normalizeReadingTypography'),typography);
 function canonical(text){
  text=text.replace(/(?<=[a-z])- *\n(?=[a-z])/g,'').replace(/(?<=-)[ \t\r\n]*\n[ \t\r\n]*/g,'');
  text=text.replace(/[ \t\r\n]+/g,' ').trim();
  typography.input=text;
  return vm.runInContext('normalizeReadingTypography(input,Array.from({length:input.length},(_,i)=>i)).text',typography);
 }
 assert.equal(recovery.pixelIdenticalPages,127);
 assert.equal(recovery.recoveredPages.length,113);
 assert.deepEqual(recovery.skippedDivergentPages,[0,29,99,100,104,105,106,108,110,111,117,121,122,123]);
 for(const page of recovery.recoveredPages){
  let text=data.pages[page].text;
  for(const r of structure.repairs.filter(r=>r.page===page).sort((a,b)=>b.start-a.start))text=text.slice(0,r.start)+r.text+text.slice(r.end);
  assert.equal(canonical(text),manualTarget(page),`source reconstruction page ${page+1}`);
 }
 // Representative Roman/Italic ligatures and numbers, not only the first review.
 assert(read(46).text.includes('fruit-flavored caffeinated energy'));
 assert(read(82).text.includes('that identifies a kind of product'));
 assert(read(96).text.includes('Appendix D 67a'));
 assert(read(126).text.includes('Defendant shall file a report with the Court'));
});

test('complete reader output matches recovered wording apart from suppressed leading folios',()=>{
 for(const page of recovery.recoveredPages){
  let expected=manualTarget(page);
  const label=data.pages[page].label;
  if(/^[ivxlcdm]+$/.test(label)&&expected.startsWith(label+' '))expected=expected.slice(label.length+1);
  else if(/^\d{1,4} /.test(expected))expected=expected.replace(/^\d{1,4} /,'');
  assert.equal(read(page).text.replace(/\s+/g,' ').trim(),expected,`complete reader page ${page+1}`);
 }
});

function manualTarget(page){
 let text=recovery.canonicalTargets[page];
 for(const [old,value] of Object.entries(manual.canonicalOverrides[String(page)]||{}))text=text.replace(old,value);
 return text;
}
test('visually reviewed OCR fixes preserve logos, correct headings and separate footnotes',()=>{
 for(const r of manual.repairs){
  assert.equal(data.pages[r.page].text.slice(r.start,r.end),r.expectedText);
  assert(read(r.page).text.includes(r.text),`manual repair page ${r.page+1}: ${r.text}`);
 }
 assert(read(104).text.includes('650 (2d Cir. 2015)).² The'));
 assert(read(105).text.includes('Sept. 28, 2021) ("[T]he plaintiff'));
 assert(read(106).text.replace(/\s+/g,' ').includes('RISE BREWING CO.'),'image-only logo text is retained');
 assert.equal(structure.headings.find(h=>h.page===104&&h.start===420).text,'III. LEGAL STANDARD');
 assert.equal(structure.headings.find(h=>h.page===105&&h.start===322).text,'IV. DISCUSSION');
 for(const f of manual.footnotes){
  assert.equal(data.pages[f.page].text.slice(f.start,f.end),f.expectedText);
  assert.deepEqual(structure.footnotes.find(x=>x.page===f.page&&x.start===f.start),f);
  const footnote=read(f.page,data,{start:f.start,end:f.end,includeFootnotes:true,layout:true});
  assert(footnote.text.length>40);
 }
 const body=read(104,data,{layout:true}).text;
 assert(body.endsWith('Second Circuit has consistently applied this standard in'));
 assert(!body.includes('that complaint'));
 assert(!body.includes('Compare N. Am. Soccer League'));
 const next=read(105,data,{layout:true}).text;
 assert(next.includes('trademark cases.3'));
 assert(!next.includes('Sept. 28, 2021)'));
 assert.deepEqual(structure.footnoteMarkers,manual.footnoteMarkers);
});
