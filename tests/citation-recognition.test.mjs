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
