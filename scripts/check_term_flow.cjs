// Walk real case, source, citation, and Back links using the published file format.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname,'../out');
const origin = 'https://ninefold.test';
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.pdf':'application/pdf'};

async function check(browser,mobile) {
  const p=await browser.newPage({viewport:{width:mobile?390:1440,height:900},hasTouch:mobile});
  p.setDefaultTimeout(15000);
  const errors=[];
  p.on('pageerror',err=>errors.push(err.message));
  await p.route(origin+'/**',async route=>{
    const url=new URL(route.request().url());
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    assert(file.startsWith(root+path.sep));
    await route.fulfill({body:await fs.readFile(file),contentType:mime[path.extname(file)]||'application/octet-stream'});
  });
  const select=async item=>mobile?item.tap():item.click();
  await p.goto(origin);
  await select(p.locator('nav [data-action=route][data-value=cases]').first());
  await select(p.locator('.case-register-row[href="#/case/24-1016"]'));
  await select(p.locator('[data-action=case-section][data-value=Merits]'));
  await select(p.locator('.doc-main').filter({hasText:/Brief of petitioner/i}).first());
  await p.waitForSelector('.document-body .citation');
  const previous=p.url();
  const appellate=p.locator('button.citation').filter({hasText:/237\s+F\s*\.\s*3d\s+198/}).first();
  await appellate.scrollIntoViewIfNeeded();
  if(mobile) await appellate.tap(); else await appellate.hover();
  await p.waitForFunction(()=>document.querySelector('.peek h3')?.textContent.includes('Sportswear'));
  assert.match(await p.locator('.peek').innerText(),/From the opinion/);
  await select(p.locator('.peek [data-action=open-reference]'));
  await p.waitForFunction(()=>document.querySelector('article[data-document^="reference-"] .page-text')?.textContent.length>5000);
  await p.goBack();
  await p.waitForURL(previous);
  const appendix=p.locator('button.citation').filter({hasText:/Pet\. App\. 45a/}).first();
  await appendix.scrollIntoViewIfNeeded();
  if(mobile) await appendix.tap(); else await appendix.hover();
  await p.waitForSelector('.peek [data-action=open-reference]');
  await select(p.locator('.peek [data-action=open-reference]'));
  await p.waitForFunction(()=>{
    const pane=document.querySelector('.doc-scroll');
    const page=pane?.querySelector('.source-page[data-page="74"]');
    return page && Math.abs(page.getBoundingClientRect().top-pane.getBoundingClientRect().top)<65;
  });
  await p.goto(origin+'/#/case/24-440');
  await select(p.locator('[data-action=case-section][data-value="Lower courts"]'));
  await select(p.locator('.doc-main').filter({hasText:/Third Circuit/i}).first());
  await p.waitForSelector('.document-body .page-text');
  const text=await p.locator('.document-body').innerText();
  assert.match(text,/Berk/i);
  assert.match(text,/affidavit/i);
  await p.goBack();
  await p.waitForURL(/#\/case\/24-440/);
  assert.deepEqual(errors,[]);
  await p.close();
  console.log(mobile?'Phone':'Desktop','passed both term reading paths.');
}

(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
  try {await Promise.all([check(b,false),check(b,true)]);}
  finally {await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
