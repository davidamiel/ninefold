import {test} from 'node:test';
import assert from 'node:assert/strict';
import {citationsIn} from '../dist/reader-authorities.js';
test('additional reporters and federal legal sources retain exact citation ranges',()=>{
 for(const [text,canonical,type] of [
 ['See 144 S. Ct. 123, 125–126 (2024).','144 S. Ct. 123','case'],
 ['See 100 L. Ed. 2d 45, 47.','100 L. Ed. 2d 45','case'],
 ['See 92 L. Ed. 46.','92 L. Ed. 46','case'],
 ['First War Powers Act, 55 Stat. 839–840.','55 Stat. 839','statute'],
 ['See 29 C. F. R. § 1630.2(a).','29 C.F.R. § 1630.2','statute'],
 ]){
  const hits=citationsIn(text);assert.equal(hits.length,1,text);
  assert.equal(hits[0].canonical,canonical);assert.equal(hits[0].type,type);
  assert.equal(hits[0].label,text.slice(hits[0].start,hits[0].end));
 }
});
test('separate authorities do not consume one another or infer a missing reporter',()=>{
 const text='55 Stat. 839; 29 C.F.R. § 1630.2; 597 U. S. 697, 730; 144 S. Ct. 123.';
 assert.equal(citationsIn(text).length,4);
 assert.deepEqual(citationsIn('The status is 839 and the estimate is 123.'),[]);
});

test('Federal Appendix retain exact source ranges',()=>{
 for(const [text,canonical] of [
  ["See 406 F. App'x 52, 54.","406 F. App'x 52"],
  ['See 406 F. App’x 52, 54.',"406 F. App'x 52"],
  ['See 406 F.App’x\n52.',"406 F. App'x 52"],
 ]){
  const hits=citationsIn(text);assert.equal(hits.length,1,text);
  assert.equal(hits[0].canonical,canonical);assert.equal(hits[0].type,'case');
  assert.equal(hits[0].label,text.slice(hits[0].start,hits[0].end));
 }
});

test('Federal Appendix recognition does not widen ambiguous first-series citations',()=>{
 for(const text of ['619 F. 2d 464','619 F. 3d 464','619 F. 4th 464']){
  const hits=citationsIn(text);assert.equal(hits.length,1,text);
  assert(hits[0].canonical.endsWith(' 464'));
 }
 for(const text of ['75 F. 100a','75 F. 2d','75 F. 4th',"406 F. App'x 52a",'75 Fahrenheit 100','Contents .... 20\nF. 2019 Shooting']) assert.deepEqual(citationsIn(text),[],text);
 const text="406 F. App’x 52; 597 U.S. 697";
 assert.deepEqual(citationsIn(text).map(x=>x.canonical),["406 F. App'x 52",'597 U.S. 697']);
});

 test('comma-separated full reporters are not consumed as pin cites',()=>{
  const text="406 F. App'x 52, 597 U.S. 697";
  assert.deepEqual(citationsIn(text).map(x=>x.canonical),["406 F. App'x 52",'597 U.S. 697']);
 });

test('representative Landor and current-term filings expose Federal Appendix references without rewriting text',async()=>{
 const {readFileSync}=await import('node:fs');
 for(const [folder,id,page,canonical] of [
  ['docs','23-1197-2ff7db93d400',29,"72 F. App'x 812"],
  ['current-docs','25-1131-bbd5ef9eb2a9',3,"766 F. App'x 387"],
 ]){
  const text=JSON.parse(readFileSync(`dist/data/${folder}/${id}.json`)).pages[page].text;
  const hit=citationsIn(text).find(x=>x.canonical===canonical);
  assert(hit,`${id} page ${page+1}`);
  assert.equal(hit.label,text.slice(hit.start,hit.end));
 }
});
