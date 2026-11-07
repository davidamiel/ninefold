// Run against the packaged site with Playwright installed and an optional CHROME_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '../out');
const origin = 'https://ninefold.test';
const mime = {'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html',
  '.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf'};

async function checkSurface(page, label) {
  const issues = await page.evaluate(() => {
    const offenders = [];
    const controls = document.querySelectorAll('a[href],button,summary,[role="link"],[role="tab"]');
    for (const control of controls) {
      if (!control.getClientRects().length) continue;
      for (const element of [control,...control.querySelectorAll('span,strong,small,time,p,h2,h3')]) {
        if (getComputedStyle(element).textDecorationLine.includes('underline')) {
          offenders.push(control.outerHTML.slice(0,150));
          break;
        }
      }
    }
    return offenders;
  });
  assert.deepEqual(issues,[],label);
}
async function audit(browser,width) {
  const page = await browser.newPage({viewport:{width,height:900},hasTouch:width<500});
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(origin+'/**',async route => {
    const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
    const asset=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    assert(asset.startsWith(root+path.sep));
    await route.fulfill({body:await fs.readFile(asset),contentType:mime[path.extname(asset)]||'application/octet-stream'});
  });
  async function visit(route,selector='main h1') {
    await page.goto(origin+'/#/'+route);
    await page.waitForSelector(selector);
    await checkSurface(page,route);
  }
  async function pointerAndFocus(locator) {
    if (width>500) await locator.hover();
    assert.equal(await locator.evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
    await page.keyboard.press('Tab');
    await locator.focus();
    assert.equal(await locator.evaluate(el=>getComputedStyle(el).textDecorationLine),'none');
    assert.notEqual(await locator.evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  }
  await visit('home','.front-court');
  await pointerAndFocus(page.locator('.front-court header a'));
  await page.locator('.explore-menu>summary').click();
  await checkSurface(page,'Explore menu');
  await page.locator('[data-action="global-search"]').click();
  await page.locator('.global-search-dialog input').fill('Sotomayor');
  await page.waitForSelector('.global-search-results button');
  await checkSurface(page,'Search results');
  await page.keyboard.press('Escape');
  await visit('cases?view=terms','.term-chooser');
  await visit('cases?view=all','.case-register');
  await visit('applications','.emergency-register');
  for (const type of ['justices','advocates','amici','areas']) {
    await visit(type,'.directory-card');
    await page.locator('.directory-card').first().click();
    await page.waitForSelector('.profile-page');
    await checkSurface(page,type+' profile');
  }
  await visit('profile/justices/Sonia%20Sotomayor','.justice-record');
  await pointerAndFocus(page.locator('.person-intro .external'));
  await pointerAndFocus(page.locator('.agreement-list a').first());
  // Independently recompute from the recorded groups, including unanimous cases.
  const data = async file => {
    const name=path.join(root,'data',file+'.json');
    if (['catalog','current-term'].includes(file)) return JSON.parse(require('node:zlib').gunzipSync(await fs.readFile(name+'.gz')));
    return JSON.parse(await fs.readFile(name,'utf8'));
  };
  const records = [...(await data('catalog')).cases,...(await data('current-term')).cases];
  const owners = new Map(records.map(c=>[c.id,c.sharedDecisionFrom||c.id]));
  const votes = await data('verified-votes');
  for(const row of await page.locator('.agreement-list a').all()) {
    const colleague=await row.locator('span').innerText(),pairs=new Map();
    for(const [id,record] of Object.entries(votes)) {
      const side=name=>record.groups.find(g=>['For the Judgment','Dissented'].includes(g.label)&&g.names.includes(name))?.label;
      const first=side('Sonia Sotomayor'),other=side(colleague);
      if(first&&other) pairs.set(owners.get(id),first===other);
    }
    const matches=[...pairs.values()].filter(Boolean).length;
    assert.equal(await row.locator('strong').innerText(),Math.round(100*matches/pairs.size)+'%');
    assert.equal(await row.locator('small').innerText(),matches+' of '+pairs.size);
  }
  await visit('about','.about-credits');
  await pointerAndFocus(page.locator('.about-credits a').first());
  await visit('case/24-440','.case-page');
  const save=page.locator('.case-page [data-action="save"]').first();
  await save.click();
  const sections=await page.locator('.document-sections button').allTextContents();
  for(const name of sections) {
    await page.locator('.document-sections').getByText(name,{exact:true}).click();
    await checkSurface(page,'Case materials '+name);
  }
  await page.getByRole('button',{name:'Merits Briefs',exact:true}).click();
  await page.locator('.doc-main').first().click();
  await page.waitForSelector('.document-body .citation');
  await checkSurface(page,'Brief');
  const cite=page.locator('.document-body .citation').first();
  await pointerAndFocus(cite);
  await cite.click();
  await page.waitForSelector('.peek');
  await checkSurface(page,'Citation preview');
  await page.locator('[data-action="dismiss-peek"]').click();
  for(const tool of ['info','docs','contents','notes','refs']) {
    const btn=page.locator('.rail [data-value="'+tool+'"]');
    if(!(await btn.getAttribute('class')).includes('active')) await btn.click();
    await page.waitForSelector('.sidebar');
    await checkSurface(page,'Reader '+tool);
  }
  await visit('library','.library-title');
  await page.locator('.library-actions>summary').click();
  await checkSurface(page,'Library options and saved case');
  await visit('reader/24-1016?doc=24-1016-0120b43e53b7','.document-body');
  const statute=page.locator('.page-text .citation').filter({hasText:'1114'}).first();
  await statute.click();
  await page.waitForFunction(()=>document.querySelector('.peek h3')?.textContent.includes('infringement'));
  await page.locator('.peek [data-action=keep-ref]').click();
  await page.locator('#reference-detail [data-action=open-reference]').click();
  await page.waitForFunction(()=>document.querySelector('.document-body')?.dataset.document?.startsWith('reference-'));
  await page.reload();
  await page.waitForSelector('.document-body .page-text');
  assert.match(await page.locator('.document-body').innerText(),/consent of the registrant/i);
  await checkSurface(page,'Statutory reader tab');
  assert.deepEqual(errors,[]);
  await page.close();
}
(async()=>{
  // Browser defaults and hover rules in older themes both caused regressions.
  for(const file of await fs.readdir(root)){
    if(!file.endsWith('.css')) continue;
    const css=await fs.readFile(path.join(root,file),'utf8');
    assert.doesNotMatch(css,/text-decoration(?:-line)?\s*:[^;}]*\bunderline\b/i,file);
  }
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined});
  try {for(const width of [1440,390]) await audit(browser,width);}
  finally {await browser.close();}
  console.log('Link styles verified on desktop and phone layouts.');
})().catch(err=>{console.error(err);process.exitCode=1;});
