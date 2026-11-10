import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const expected=[{"id":"24-440-087f8840f42e","page":30,"start":5,"end":13,"text":"ARGUMENT","level":1},{"id":"24-440-087f8840f42e","page":59,"start":741,"end":871,"text":"III. In the alternative, adopting Petitioner’s expansive interpretation of the Federal Rules would violate the Rules Enabling Act","level":2},{"id":"24-440-55fd77b4c91b","page":34,"start":4,"end":14,"text":"Conclusion","level":1},{"id":"24-440-78eb24d85356","page":6,"start":266,"end":274,"text":"Argument","level":1},{"id":"24-440-3582972c02be","page":65,"start":5,"end":23,"text":"Fed. R. Civ. P. 8","level":1},{"id":"24-440-3582972c02be","page":64,"start":5,"end":23,"text":"Fed. R. Civ. P. 3","level":1},{"id":"24-440-3582972c02be","page":68,"start":5,"end":23,"text":"Fed. R. Civ. P. 9","level":1},{"id":"24-440-3582972c02be","page":70,"start":6,"end":25,"text":"Fed. R. Civ. P. 11","level":1},{"id":"24-440-3582972c02be","page":73,"start":6,"end":25,"text":"Fed. R. Civ. P. 12","level":1},{"id":"24-440-3582972c02be","page":78,"start":6,"end":25,"text":"Fed. R. Civ. P. 26","level":1},{"id":"24-440-3582972c02be","page":98,"start":6,"end":25,"text":"Fed. R. Civ. P. 37","level":1}];
test('Berk headings anchor actual source headings, not prose or appendix contents',()=>{
 const curated=read('scripts/curated-reader-structure.json'),runtime=read('dist/data/reader-structure.json');
 for(const {id,...h} of expected){
  const raw=read('dist/data/docs/'+id+'.json').pages[h.page].text.slice(h.start,h.end);
  assert.ok(raw.length>0);
  for(const structure of [curated,runtime]) assert.deepEqual(structure[id].headings.find(x=>x.page===h.page&&x.start===h.start),h);
 }
 assert.match(read('dist/data/docs/24-440-087f8840f42e.json').pages[30].text.slice(5,13),/^ARGUMENT$/);
 assert.match(read('dist/data/docs/24-440-55fd77b4c91b.json').pages[34].text.slice(4,14),/^CONCLUSION$/);
});
test('Berk transcript printed labels follow source headers',()=>{
 const d=read('dist/data/docs/24-440-5f52d6b13c47.json');
 for(let i=2;i<=69;i++)assert.equal(d.pages[i].printedLabel,String(i));
 assert.equal(d.pages.length,77);
});
test('Berk case review retains incomplete status for all documents',()=>{
 const r=read('reviews/berk-case-review.json');assert.equal(r.documents.length,70);assert.equal(r.aliases.length,3);assert.equal(r.overallStatus,'partial');assert.ok(r.documents.every(x=>x.status==='partial'&&x.citationTargets==='unreviewed'));
});
