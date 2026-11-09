import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync('dist/data/'+p,'utf8'));
const manifest=read('procedural-filing-provenance.json');
const catalog=read('catalog.json');
const docs=catalog.cases.flatMap(c=>c.documents);
test('five source-pinned procedural filings have complete page inventories without broad review claims',()=>{
 assert.equal(manifest.documents.length,5);
 assert.equal(manifest.documents.reduce((n,d)=>n+d.pageCount,0),85);
 for(const source of manifest.documents){
  const d=docs.find(d=>d.id===source.id);assert(d);assert.equal(d.category,'Other');assert(!d.scanOnly);
  const data=JSON.parse(fs.readFileSync('dist/'+d.textPath,'utf8'));
  assert.equal(data.sourceUrl,source.sourceUrl);assert.equal(data.pages.length,source.pageCount);
  assert.equal(data.extraction.sourceSha256,source.sourceSha256);assert.equal(data.extraction.reviewed,false);
  assert.deepEqual(data.pages.map(p=>p.number),Array.from({length:source.pageCount},(_,i)=>i+1));
  assert.equal(data.pages.reduce((n,p)=>n+p.text.length,0),d.characterCount);
  assert(data.pages.every(p=>!/[\uFFFD\x00]/.test(p.text)));
 }
});
test('sparse Hecox pages are appendix dividers and distinct Verizon filings retain source bytes',()=>{
 for(const [id,page] of [['24-38-d297c2fd12b4',13],['24-38-f1e265d23730',18]]){
  const d=docs.find(d=>d.id===id),data=JSON.parse(fs.readFileSync('dist/'+d.textPath,'utf8'));
  assert.deepEqual(data.extraction.sparsePages,[page]);assert.equal(data.pages[page-1].text.trim(),'APPENDIX');
 }
 const verizon=manifest.documents.filter(d=>d.id.startsWith('25-406')||d.id.startsWith('25-567'));
 assert.equal(new Set(verizon.map(d=>d.sourceSha256)).size,2);
});
test('term coverage reflects newly readable Other filings',()=>{
 assert.equal(catalog.coverage.readableByCategory.Other,5);
 assert.equal(catalog.coverage.readableDocuments,3726);
 assert.equal(catalog.coverage.uniqueReadableDocumentCount,3689);
 assert.deepEqual(read('coverage-report.json').terms['2025'],catalog.coverage);
});
test('Poppler preserves source-verified words that pypdf split inside words',()=>{
 for(const id of ['25-406-2ff36bf3545c','25-567-e94071eb7fc8']){
  const data=read('docs/'+id+'.json'),text=data.pages[4].text;
  assert.match(data.extraction.method,/Poppler pdftotext 25.03.0/);
  assert.match(text,/Pursuant to Rule 44\.1/);assert.match(text,/VERIZON COMMUNICATIONS INC\./);
  assert.doesNotMatch(text,/Pur\s+suant|COMMUN\s+ICATIONS/);
 }
 const hecox=read('docs/24-38-d297c2fd12b4.json');
 assert.match(hecox.pages[15].text,/transgender/);assert.doesNotMatch(hecox.pages[15].text,/transgen\s+der/);
});
test('layout extraction retains source statute, docket and URL hyphens',()=>{
 assert.match(read('docs/24-38-f1e265d23730.json').pages[5].text,/33-\n6203\(2\)/);
 assert.match(read('docs/24-38-d297c2fd12b4.json').pages[5].text,/cv-\n00184/);
 const miot=read('docs/25-1083-ef3858304918.json');
 assert.match(miot.pages[15].text,/dhs-\nterminates-haiti-tps-encourages-haitians-obtain-\nlawful-status/);
 assert.match(miot.pages[4].text,/haitians-\n\s+obtain-lawful-status/);
});
