import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync('dist/data/'+p,'utf8'));
const sources=read('nrsc-filing-provenance.json').documents;
const docs=read('catalog.json').cases.flatMap(c=>c.documents);
test('NRSC motion, attached brief/addendum and reply retain all 38 source pages',()=>{
 assert.equal(sources.length,2);
 assert.equal(sources.reduce((n,s)=>n+s.pageCount,0),38);
 for(const s of sources){
  const d=docs.find(d=>d.id===s.id), asset=JSON.parse(fs.readFileSync('dist/'+d.textPath));
  assert.equal(d.category,'Other'); assert.equal(d.auxiliary,false);
  assert.equal(d.sourceUrl,s.sourceUrl); assert.equal(asset.sourceUrl,s.sourceUrl);
  assert.equal(asset.extraction.sourceSha256,s.sourceSha256); assert.equal(asset.extraction.reviewed,false);
  assert.equal(asset.pages.length,s.pageCount); assert.equal(d.pageCount,s.pageCount);
  assert.deepEqual(asset.pages.map(p=>p.number),Array.from({length:s.pageCount},(_,i)=>i+1));
  assert.equal(d.characterCount,asset.pages.reduce((n,p)=>n+p.text.length,0));
  assert(asset.pages.every(p=>!/[\uFFFD\x00]/.test(p.text)));
 }
});
test('NRSC attachment boundaries, source hyphens and addendum footnotes survive extraction',()=>{
 const motion=read('docs/24-621-7b13c24198cf.json');
 assert.deepEqual(motion.extraction.sparsePages,[5,24]);
 assert.equal(motion.pages[4].text.trim(),'ATTACHMENT');
 assert.equal(motion.pages[23].text.trim(),'ADDENDUM');
 assert.match(motion.pages[5].text,/SUPPLEMENTAL BRIEF ON JURISDICTION/);
 assert.match(motion.pages[26].text,/video\/6385081082112\./);
 assert.match(motion.pages[34].text,/video\/6368158619112\./);
 assert.match(motion.pages[10].text,/campaign-finance/);
 const reply=read('docs/24-621-f75392ee825b.json');
 assert.match(reply.pages[1].text,/non-\n\s*adversarial/);
 assert.match(reply.pages[1].text,/Sup\. Ct\. R\.\n25\.6/);
 assert.match(reply.pages[2].text,/December 3, 2025/);
});
