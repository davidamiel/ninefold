import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const id='24-1287-2059f0a43b72';
const rawBytes=fs.readFileSync(`dist/data/docs/${id}.json`);
const data=JSON.parse(rawBytes);
const runtime=JSON.parse(fs.readFileSync('dist/data/reader-structure.json'))[id];
const curated=JSON.parse(fs.readFileSync('scripts/curated-reader-structure.json'))[id];
const expected=[[82,232,242,'signifcant','significant'],[82,1560,1567,'offcial','official'],[83,862,866,'frst','first'],[85,1610,1618,'justifed','justified']];
test('Jackson source review preserves raw text and exact verified repair ranges',()=>{
 assert.equal(crypto.createHash('sha256').update(rawBytes).digest('hex'),'c3775c67a0c112b51d02a24f15db2bee4e366dfd35046c6339bbda6a021cbe21');
 for(const [page,start,end,old,text] of expected){
  assert.equal(data.pages[page].text.slice(start,end),old);
  const repair=runtime.repairs.find(r=>r.page===page&&r.start===start&&r.end===end);
  assert(repair);assert.equal(repair.text,text);assert.equal(repair.expectedText,old);
  assert.equal(repair.sourcePdfPage,page+1);assert.equal(repair.sourcePrintedPage,page+228);
  assert.equal(repair.evidence,'docs/jackson-source-review.md');
  assert.deepEqual(curated.repairs.find(r=>r.page===page&&r.start===start),repair);
 }
});
test('Jackson visual-review PDF remains the exact verified source artifact',()=>{
 const bytes=fs.readFileSync(`dist/data/pdfs/${id}--82-622.pdf`);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'7628338d8ca3dffd4d7ed693366b395f9e117368419832527c88326e14adba4a');
});
