import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {citationsIn,shortCaseIn} from '../dist/reader-authorities.js';
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
test('reviewed named circuit citations map through exact reporter keys to official sources',()=>{
 const evidence=read('reviews/berk-circuit-source-routing.json'),index=read('dist/data/precedent-index.json'),cache=new Map();
 for(const item of evidence.items){
  const id=item.fromDoc.split('--')[0];
  if(!cache.has(id))cache.set(id,read('dist/data/docs/'+id+'.json'));
  const data=cache.get(id),hit=citationsIn(item.label,true,true,(v,r,n)=>shortCaseIn(data,v,r,n)).find(h=>h.type==='case');
  assert.equal(hit?.canonical,item.caseGroup==='Pledger'?'5 F.4th 511':'942 F.3d 349');
  assert.equal(index[hit.canonical].sourceUrl,evidence.entries[hit.canonical].sourceUrl);
  assert.equal(item.label.slice(hit.start,hit.end),hit.label);
 }
 assert.equal(evidence.items.length,59);
});
test('official source metadata does not introduce name-only or reporter-only guesses',()=>{
 const index=read('dist/data/precedent-index.json');
 assert.equal(index['5 F.4th 511'].text,undefined);assert.equal(index['942 F.3d 349'].textPath,undefined);
 const data={pages:[{text:'Pledger v. Lynch, 5 F.4th 511. Young v. United States, 942 F.3d 349.'}]};
 assert.equal(shortCaseIn(data,'5','F.4th',''),null);
 assert.equal(shortCaseIn(data,'6','F.4th','Pledger, '),null);
 assert.equal(shortCaseIn(data,'942','F.3d','Other, '),null);
 const ambiguous={pages:[{text:'Young v. United States, 942 F.3d 349. Young v. Smith, 942 F.3d 100.'}]};
 assert.equal(shortCaseIn(ambiguous,'942','F.3d','Young, '),null);
});
