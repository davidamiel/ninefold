import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {citationsIn,shortCaseIn} from '../dist/reader-authorities.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const doc=id=>read('dist/data/docs/'+id+'.json');
const parse=(text,data)=>citationsIn(text,true,true,(v,r,n)=>shortCaseIn(data,v,r,n));
test('Federal Supplement series digits cannot become fabricated first pages',()=>{
 for(const [id,page,forbidden,expected] of [
  ['24-440-77b1376e3f1a',91,'436 F.Supp. 3','436 F. Supp. 3d at 548'],
  ['24-440-77b1376e3f1a',94,'436 F.Supp. 3','436 F. Supp. 3d at 548'],
  ['24-440-087f8840f42e',56,'845 F.Supp. 2','845 F.Supp. 2d 824'],
  ['24-440-087f8840f42e',57,'845 F.Supp. 2','845 F.Supp. 2d 824']]){
  const data=doc(id),text=data.pages[page].text,hits=parse(text,data);
  assert.ok(!hits.some(h=>h.canonical===forbidden),id+':'+page);
  assert.ok(hits.some(h=>h.canonical===expected),id+':'+page+' '+expected);
  for(const h of hits)assert.equal(text.slice(h.start,h.end),h.label);
 }
 assert.equal(parse('Shields v. United States, 436 F. Supp. 3d 540, 543')[0].canonical,'436 F.Supp. 3d 540');
 assert.equal(parse('Jones v. Smith, 845 F. Supp. 2d 824')[0].canonical,'845 F.Supp. 2d 824');
});
test('Supplement short forms require a unique named same-document full citation',()=>{
 const data={pages:[{text:'Jones v. Smith, 845 F. Supp. 2d 824.'}]};
 assert.equal(parse('Jones , 845 F. Supp. 2d at 857',data)[0].canonical,'845 F.Supp. 2d 824');
 assert.equal(shortCaseIn(data,'845','F. Supp. 2d',''),null);
 assert.equal(shortCaseIn(data,'846','F. Supp. 2d','Jones, '),null);
 const ambiguous={pages:[{text:'Jones v. Smith, 845 F. Supp. 2d 824. Jones v. Brown, 845 F. Supp. 2d 100.'}]};
 assert.equal(shortCaseIn(ambiguous,'845','F. Supp. 2d','Jones , '),null);
 assert.equal(parse('436 F. Supp. 3d').length,0);
 assert.equal(parse('845 F. Supp. 2d').length,0);
});
test('68 reviewed circuit references use verified exact-citation official sources',()=>{
 const evidence=read('reviews/berk-circuit-and-supplement-review.json'),index=read('dist/data/precedent-index.json'),cache=new Map();
 for(const item of evidence.items){
  const id=item.fromDoc.split('--')[0];if(!cache.has(id))cache.set(id,doc(id));
  const hit=parse(item.label,cache.get(id)).find(h=>h.type==='case');
  assert.equal(hit?.canonical,item.canonical);
  assert.equal(index[hit.canonical].sourceUrl,evidence.sources[hit.canonical].sourceUrl);
  assert.equal(item.label.slice(hit.start,hit.end),hit.label);
 }
 assert.equal(evidence.items.length,68);
});
