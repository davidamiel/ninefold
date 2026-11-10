import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.BERK_BASE_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__berkQA={open:openDoc,render:documentHTML,ensure:ensureDoc};'});});
await page.goto(base+'#/case/24-440');await page.waitForFunction(()=>window.__court&&window.__berkQA);
const report=JSON.parse(fs.readFileSync('reviews/berk-case-review.json'));
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
await page.evaluate(()=>window.__berkQA.open('24-440-087f8840f42e'));
await page.waitForSelector('.document-body .page-text');
await page.screenshot({path:'berk-reader.png',fullPage:false});
fs.writeFileSync('berk-browser-evidence.json',JSON.stringify({base,documents:evidence,pageErrors:errors,limitations:'DOM smoke checks; not full visual or citation-destination review'},null,2));
assert.deepEqual(errors,[]);console.log('PASS Berk reader smoke',evidence.length,'documents');await browser.close();
