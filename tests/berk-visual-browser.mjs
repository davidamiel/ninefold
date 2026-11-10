import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.BERK_BASE_URL||'http://127.0.0.1:8765/';
const browser=await chromium.launch({headless:true,channel:process.env.BERK_CHROME_CHANNEL||'chrome',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/app.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__berkVisual={open:openDoc,render:documentHTML,ensure:ensureDoc,reading:readingText,source:sourceJSON};'});});
await page.goto(base+'#/case/24-440');await page.waitForFunction(()=>window.__court&&window.__berkVisual);
const evidence=await page.evaluate(async()=>{
 const id='24-440-660786c6b1c6',qa=window.__berkVisual;
 const data=await qa.ensure(id),structure=(await qa.source('data/reader-structure.json'))[id];
 const root=document.createElement('div');root.innerHTML=qa.render(id,data);
 const labels=[...root.querySelectorAll('.footnote-entry small')].map(n=>n.textContent);
 const anchors=[...root.querySelectorAll('.source-page .footnote-anchor')].map(n=>n.textContent);
 const checks=structure.footnotes.map(f=>{
  const reading=qa.reading(data.pages[f.page].text,id,f.page,data);
  const note=[...root.querySelectorAll('.footnote-entry')].find(n=>n.querySelector('small').textContent===f.label);
  return {label:f.label,bodyCharacters:note?.querySelector('.page-text').textContent.length||0,bodyAbsentFromProse:!reading.map.some(n=>n>=f.start+f.label.length+1&&n<f.end)};
 });
 const cover=(await qa.source('data/docs/24-440-ffcc04da2f19.json')).pages[0].text;
 return {labels,anchors,checks,coverNames:['John J. Hare','Nathan V. Gin','Elzufon Austin','& Mondell, PA'].map(s=>cover.includes(s)),coverLength:cover.length};
});
assert.deepEqual(evidence.labels,Array.from({length:12},(_,i)=>String(i+1)));
assert.deepEqual(evidence.anchors,Array.from({length:12},(_,i)=>String(i+1)));
for(const x of evidence.checks){assert(x.bodyAbsentFromProse,x.label);assert(x.bodyCharacters>50,x.label);}
assert(evidence.coverNames.every(Boolean));assert.equal(evidence.coverLength,660);
await page.evaluate(()=>window.__berkVisual.open('24-440-660786c6b1c6'));
await page.waitForSelector('.document-body .source-page[data-page="3"]');
await page.locator('.document-body .source-page[data-page="3"]').scrollIntoViewIfNeeded();
await page.screenshot({path:'berk-appendix-page4-reader.png',fullPage:false});
await page.locator('.document-body .source-page[data-page="3"] .footnote-anchor').first().click();
await page.waitForSelector('.peek .peek-content');
assert.match(await page.locator('.peek .peek-content').innerText(),/Defendants are Wilson C\. Choy/);
await page.screenshot({path:'berk-appendix-footnote1-reader.png',fullPage:false});
await page.evaluate(()=>window.__berkVisual.open('24-440-ffcc04da2f19'));
await page.waitForSelector('.document-body .source-page[data-page="1"]');
assert.equal(await page.locator('.document-body .source-page[data-page="0"]').count(),0);
assert.deepEqual(errors,[]);
fs.writeFileSync('berk-visual-browser-evidence.json',JSON.stringify(evidence,null,2));
for(const name of ['berk-appendix-page4-reader.png','berk-appendix-footnote1-reader.png']){
 const b64=fs.readFileSync(name).toString('base64');
 console.log('READER_PNG_BEGIN '+name+' '+b64.length);
 for(let i=0;i<b64.length;i+=16000)console.log('READER_PNG_CHUNK '+name+' '+i+' '+b64.slice(i,i+16000));
 console.log('READER_PNG_END '+name);
}
console.log('PASS Berk visual browser '+JSON.stringify(evidence));
await browser.close();
