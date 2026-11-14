import fs from 'node:fs';
import {test,expect} from '@playwright/test';

const manifest=JSON.parse(fs.readFileSync(new URL('../dist/data/opinion-figures.json',import.meta.url)));
const guest=`export async function createAccount(notify){setTimeout(()=>notify({type:'session',user:null}),0);return {configured:false,ready:true,user:null,save(){},loadPublishedContent:async()=>[]}}`;
test.beforeEach(async({page})=>{await page.route('**/account.js',route=>route.fulfill({contentType:'application/javascript',body:guest}));});

for(const [id,document] of Object.entries(manifest))test('original figures and captions remain in '+id,async({page})=>{
 const requests=[];page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto('/#/reader/'+(id.startsWith('25-51-')?'25-51':'24-109')+'?doc='+id);
 const article=page.locator(`.prepared-document[data-document="${id}"]`);
 await expect(article).toBeVisible({timeout:20000});
 await expect(article.locator('.reader-figure')).toHaveCount(document.figures.length);
 for(const figure of document.figures){
  const view=article.locator(`[data-figure="${figure.id}"]`),image=view.locator('img');
  await image.scrollIntoViewIfNeeded();
  await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth)).toBe(figure.width);
  await expect(image).toHaveAttribute('loading','lazy');
  await expect(image).toHaveAttribute('alt',figure.alt);
  await expect(view.locator('figcaption')).toHaveText(figure.caption.text);
  await expect(article.locator('.page-text').filter({hasText:figure.caption.text})).toHaveCount(1);
  const bounds=await image.boundingBox(),outer=await article.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(outer.width);
  const link=view.getByRole('link');await link.focus();await expect(link).toBeFocused();
 }
 expect(requests.filter(path=>/\.pdf$|\/vendor\/pdfjs\//.test(path))).toEqual([]);
 await expect(article).not.toContainText('Reporter’s Note');
 if(document.appendixHeading){
  await page.getByRole('button',{name:'Contents',exact:true}).click();
  await page.getByRole('button',{name:'APPENDIX',exact:true}).click();
  await expect(article.getByRole('heading',{name:'APPENDIX',exact:true})).toBeInViewport();
 }
});

test('an original figure image can be retried after a network failure',async({page})=>{
 const [id,document]=Object.entries(manifest)[0],figure=document.figures[0];
 let fail=true;
 await page.route('**/'+figure.path,route=>fail?route.abort():route.continue());
 await page.goto('/#/reader/25-51?doc='+id);
 const view=page.locator(`[data-figure="${figure.id}"]`);
 await view.scrollIntoViewIfNeeded();
 await expect(view.getByRole('button',{name:'Retry image'})).toBeVisible();
 fail=false;await view.getByRole('button',{name:'Retry image'}).click();
 await expect.poll(()=>view.locator('img').evaluate(img=>img.complete&&img.naturalWidth)).toBe(figure.width);
 await expect(view.getByRole('button',{name:'Retry image'})).toBeHidden();
 await expect(view.getByRole('link')).toBeFocused();
});
