import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const structure=read('dist/data/reader-structure.json'),curated=read('scripts/curated-reader-structure.json');
const ids=read('dist/data/procedural-filing-provenance.json').documents.map(x=>x.id);
test('procedural counsel layout has exact bounded source guards and persists through regeneration',()=>{
 let count=0;
 for(const id of ids){
  const s=structure[id],data=read(`dist/data/docs/${id}.json`);assert.deepEqual(s,curated[id]);
  for(const key of ['counselBlocks','omitRanges','headings','footnotes','footnoteMarkers']) for(const b of s[key]){
   assert(b.end>b.start);assert.equal(data.pages[b.page].text.slice(b.start,b.end),b.expectedText);
   assert(fs.existsSync(b.evidence));
  }
  for(const b of s.counselBlocks){
   count++;assert.match(b.expectedText,/ {2,}\S/);assert.match(b.expectedText,/\n/);
   assert(!s.headings.some(h=>h.page===b.page&&h.start<b.end&&h.end>b.start));
   assert(!s.omitRanges.some(h=>h.page===b.page&&h.start<b.end&&h.end>b.start));
  }
 }
 assert.equal(count,6);
});
test('Hecox separates body citation, conclusion, counsel and footnote',()=>{
 const s=structure['24-38-d297c2fd12b4'],raw=read('dist/data/docs/24-38-d297c2fd12b4.json').pages[10].text;
 const h=s.headings.find(h=>h.page===10);assert.equal(h.text,'CONCLUSION');assert.equal(raw.slice(h.start,h.end),'CONCLUSION');
 assert.equal(s.footnotes.find(f=>f.page===10).label,'2');
 assert(s.omitRanges.some(r=>r.page===1&&r.reason==='Cover counsel continuation'));
 assert(!s.headings.some(h=>/JOSHUA|CECILLIA|U\.S\. 188/.test(h.text)));
});
test('Verizon disclosure and substantive opening stay visible',()=>{
 for(const id of ids.filter(id=>id.startsWith('25-'))){
  if(id.startsWith('25-1083'))continue;
  const s=structure[id],raw=read(`dist/data/docs/${id}.json`).pages[4].text;
  assert.equal(s.bodyStart.page,1);assert(!s.omitRanges.some(r=>r.page===1));
  const intro=raw.indexOf('Pursuant');assert(!s.omitRanges.some(r=>r.page===4&&r.end>intro));
 }
});
