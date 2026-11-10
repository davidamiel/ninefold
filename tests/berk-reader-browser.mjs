import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.BERK_BASE_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__berkQA={open:openDoc,render:documentHTML,ensure:ensureDoc,refs:refsIndex,material:materialFor,extended:loadExtendedAuthorities,source:sourceJSON};'});});
await page.goto(base+'#/case/24-440');await page.waitForFunction(()=>window.__court&&window.__berkQA);
const report=JSON.parse(fs.readFileSync('reviews/berk-case-review.json'));
const deployedData=await page.evaluate(async()=>{
 const t=await window.__berkQA.source('data/docs/24-440-5f52d6b13c47.json');
 const structure=await window.__berkQA.source('data/reader-structure.json');
 return {labels:t.pages.slice(2,70).map(p=>p.printedLabel),argument:structure['24-440-087f8840f42e'].headings.find(h=>h.page===30&&h.start===5),conclusion:structure['24-440-55fd77b4c91b'].headings.find(h=>h.page===34&&h.start===4)};
});
assert.deepEqual(deployedData.labels,Array.from({length:68},(_,i)=>String(i+2)));
assert.equal(deployedData.argument?.text,'ARGUMENT');assert.equal(deployedData.conclusion?.text,'Conclusion');
const evidence=[];
for(const d of [...report.documents.filter(x=>x.textPath),...report.aliases]){
 await page.evaluate(id=>window.__berkQA.open(id),d.id);
 await page.waitForSelector('.document-body .page-text',{timeout:30000});
 const result=await page.evaluate(async id=>{
  const data=await window.__berkQA.ensure(id);const html=window.__berkQA.render(id,data);const root=document.createElement('div');root.innerHTML=html;
  return {id,characters:root.textContent.length,pages:root.querySelectorAll('.source-page').length,headings:root.querySelectorAll('.reader-section-heading').length,citations:root.querySelectorAll('.citation').length};
 },d.id);
 assert.ok(result.characters>100,d.id+' empty reader');evidence.push(result);
}
const references=await page.evaluate(async()=>{
 await window.__berkQA.extended();
 const refs=[...window.__berkQA.refs.values()].filter(r=>r.fromDoc?.startsWith('24-440-'));
 const invalid=[],resolved=new Set(),unresolved=[];let located=0;
 for(const ref of refs){let m=window.__berkQA.material(ref);
  if(m.doc?.textPath){const data=await window.__berkQA.ensure(m.doc.id);if(!data?.pages?.length)invalid.push({label:ref.label,id:m.doc.id,reason:'internal text unavailable'});else{resolved.add(m.doc.id);m=window.__berkQA.material(ref);if(m.targetPage>=0){located++;if(m.targetPage>=data.pages.length)invalid.push({label:ref.label,id:m.doc.id,page:m.targetPage,reason:'page outside target'});}}}
  if(m.source&&!/^https?:\\/\\//.test(m.source))invalid.push({label:ref.label,reason:'invalid source URL'});
  if(!m.doc)unresolved.push({label:ref.label,type:ref.type,source:m.source||null});
 }
 return {occurrences:refs.length,internalDocuments:resolved.size,locatedPages:located,invalid,unresolvedCount:unresolved.length,unresolvedSample:unresolved.slice(0,20),limitation:'Structural resolution only; target semantics and pinpoint accuracy unreviewed'};
});
assert.deepEqual(references.invalid,[]);
await page.evaluate(()=>window.__berkQA.open('24-440-087f8840f42e'));
await page.waitForSelector('.document-body .page-text');
await page.screenshot({path:'berk-reader.png',fullPage:false});
fs.writeFileSync('berk-browser-evidence.json',JSON.stringify({base,documents:evidence,deployedData,references,pageErrors:errors,limitations:'DOM smoke checks; not full visual or citation-destination review'},null,2));
assert.deepEqual(errors,[]);console.log('PASS Berk reader smoke',JSON.stringify({documents:evidence.length,references}));await browser.close();
