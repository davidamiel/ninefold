import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {auditDocument} from '../scripts/audit_document_quality.mjs';
const id='24-440-1bba7e3379d6';
const rawBytes=fs.readFileSync(`dist/data/docs/${id}.json`);
const data=JSON.parse(rawBytes);
const structure=JSON.parse(fs.readFileSync('dist/data/reader-structure.json'))[id];
const curated=JSON.parse(fs.readFileSync('scripts/curated-reader-structure.json'))[id];
const evidence=JSON.parse(fs.readFileSync('dist/data/document-correction-evidence.json'))[id];
const proof=JSON.parse(fs.readFileSync('scripts/berk-opinion-glyph-evidence.json'));
const app=fs.readFileSync('dist/app.js','utf8');
function fn(name){const a=app.indexOf(`function ${name}(`);return app.slice(a,app.indexOf('\nfunction ',a+1));}
function read(page,source=data,options={}){
 const context=vm.createContext({data:source,page,start:options.start??0,end:options.end??source.pages[page].text.length,includeFootnotes:options.includeFootnotes??false,readingCache:new Map(),displayMaps:new Map(),runningLineCache:new WeakMap(),
  ds:()=>({category:'Opinion'}),category:d=>d.category,structureFor:()=>({...structure,bodyStart:{page:0,offset:0},omitRanges:[]}),layoutPage:()=>options.layout?{footnotes:(structure.footnotes||[]).filter(f=>f.page===page)}:{},
  tidyHeadingSpace:x=>x,tidyFootnoteMarkers:x=>x,extendHeadingMarker:x=>x});
 for(const name of ['normalizedMargin','runningLines','lowerBound','normalizeReadingTypography','repairReading','preserveCounselBlocks','readingText'])vm.runInContext(fn(name),context);
 return vm.runInContext('readingText(data.pages[page].text,"fixture",page,data,start,end,includeFootnotes)',context);
}

test('Berk ligature recovery preserves exact source bytes and has complete bounded evidence',()=>{
 assert.equal(crypto.createHash('sha256').update(rawBytes).digest('hex'),proof.rawSha256);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`dist/data/pdfs/${id}.pdf`)).digest('hex'),proof.sourceSha256);
 assert.deepEqual(structure.repairs,curated.repairs);
 assert.equal(structure.repairs.length,224);
 assert.equal(evidence.length,224);
 assert.deepEqual(auditDocument(id,data.pages,structure,{},evidence),[]);
 for (const [i,r] of structure.repairs.entries()) {
  assert.equal(data.pages[r.page].text.slice(r.start,r.end),'f');
  assert(['fi','fl'].includes(r.text));
  assert.equal(evidence[i].sourceSha256,proof.sourceSha256);
  assert.equal(evidence[i].sourceUrl,data.sourceUrl);
  assert.equal(evidence[i].sourcePage,r.page+1);
 }
});
test('Berk reader restores fitted/fitting and surrounding affidavit and filing text',()=>{
 const text=read(4).text;
 for(const phrase of ['Berk be fitted with a protective boot.', 'The fitting did not go well.', 'an affidavit of merit', 'he files the complaint', 'has not filed a timely extension', 'fell out of bed.', 'Hospital employees forced', 'keep weight off his ankle'])assert(text.includes(phrase),phrase);
 assert(!/\b(?:ftted|ftting|affdavit|fled|fle|fles)\b/.test(text));
});
test('every recovered glyph maps monotonically to its original annotation anchor',()=>{
 for(let page=0;page<data.pages.length;page++) {
  const result=read(page);
  assert.equal(result.text.length,result.map.length);
  for(let i=1;i<result.map.length;i++)assert(result.map[i]>=result.map[i-1]);
  for(const r of structure.repairs.filter(r=>r.page===page)) {
   const at=result.map.indexOf(r.start);
   assert(at>=0,`glyph ${page}:${r.start}`);
   assert.equal(result.text.slice(at,at+2),r.text);
   assert.deepEqual(Array.from(result.map.slice(at,at+2)),[r.start,r.start]);
   // Selecting either/both displayed letters resolves to the same raw glyph.
   assert.equal(data.pages[page].text.slice(result.map[at],result.map[at+1]+1),'f');
  }
 }
});
test('stale Berk repairs fail closed without changing another document',()=>{
 const r=structure.repairs.find(r=>r.page===4&&data.pages[4].text.slice(r.start,r.start+5)==='ftted');
 assert(r);
 const changed=structuredClone(data);
 changed.pages[4].text=changed.pages[4].text.slice(0,r.start)+'X'+changed.pages[4].text.slice(r.end);
 const result=read(4,changed);
 assert(result.text.includes('Berk be Xtted with a protective boot.'));
 assert(!result.text.includes('Berk be fitted'));
});
