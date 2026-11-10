import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {citationsIn,shortCaseIn} from '../dist/reader-authorities.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('Schmigel and Abbas queue labels retain exact source identities',()=>{
 const e=read('reviews/berk-schmigel-abbas-routing.json'),index=read('dist/data/precedent-index.json'),cache=new Map();
 for(const item of e.items){
  const id=item.fromDoc.split('--')[0];if(!cache.has(id))cache.set(id,read('dist/data/docs/'+id+'.json'));
  const h=citationsIn(item.label,true,true,(v,r,n)=>shortCaseIn(cache.get(id),v,r,n)).find(x=>x.type==='case');
  assert.equal(h?.canonical,item.canonical);
  assert.equal(index[h.canonical]?.sourceUrl,e.entries[h.canonical].sourceUrl);
  assert.equal(item.label.slice(h.start,h.end),h.label);
 }
 assert.equal(e.items.length,26);
});
