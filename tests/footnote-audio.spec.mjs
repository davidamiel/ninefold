import fs from 'node:fs';
import {test,expect} from '@playwright/test';

const documentId='25-5146-2ec91392fbac--3-1293';
const inventory=JSON.parse(fs.readFileSync(new URL('../dist/data/prepared-documents.json',import.meta.url)));
const cues=voice=>JSON.parse(fs.readFileSync(new URL('../dist/'+inventory[documentId].recordings[voice].cuesPath,import.meta.url))).cues;

test.beforeEach(async({page})=>{
 await page.route('**/account.js',route=>route.fulfill({contentType:'application/javascript',body:`export async function createAccount(notify){setTimeout(()=>notify({type:'session',user:null}),0);return {configured:false,ready:true,user:null,save(){},loadPublishedContent:async()=>[]}}`}));
 await page.goto('/#/reader/25-5146?doc='+documentId);
 await expect(page.locator('.prepared-footnote').first()).toBeAttached({timeout:20000});
});

async function start(page){
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await page.getByRole('button',{name:'Read document',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Reading',{timeout:15000});
}
async function seek(page,seconds){await page.locator('.recording-seek').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}))},seconds)}
async function highlighted(page){return page.evaluate(()=>[...(CSS.highlights.get('document-audio')||[])].map(r=>r.toString()).join(' '))}

test('clean opinion keeps complete inline notes, headings and meaningful statute links',async({page})=>{
 const article=page.locator('.prepared-document');
 await expect(article.locator('h1')).toHaveText('Opinion of the Court');
 await expect(article).not.toContainText(/Page Proof|Reporter’s Note|falsifcation|contem plation/);
 const note=page.getByRole('complementary',{name:'Footnote 1',exact:true});
 await expect(note).toContainText('contemplation of any such matter');
 await expect(note.locator('.page-text')).toHaveCount(2);
 await expect(page.locator('.prepared-footnote').last()).toContainText('Nothing we say today is meant to address');
 await expect(article.locator('.prepared-paragraph').first().locator('.citation')).toContainText(['18 U. S. C. § 1519','§ 1519']);
 await expect(page.getByRole('button',{name:'Play',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Contents',exact:true}).click();
 const target=page.locator('[data-action="heading-jump"]').filter({hasText:/^II$/});
 await target.click();
 await expect.poll(async()=>page.locator('.prepared-section-heading').last().evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.doc-scroll').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom})).toBe(true);
});

test('paused footnote seeking resumes, voice switching preserves text, and playback returns to the body',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await start(page);await page.getByRole('button',{name:'Pause',exact:true}).click();
 const text=page.getByRole('complementary',{name:'Footnote 1',exact:true}).locator('.page-text').first();
 await text.scrollIntoViewIfNeeded();await text.click({position:{x:15,y:8}});
 await expect(page.getByRole('button',{name:'Audio',exact:true})).toHaveAttribute('aria-expanded','false');
 await expect.poll(()=>highlighted(page)).toContain('The full text of the statute');
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Reading');
 const position=Number(await page.locator('.recording-seek').inputValue());
 await expect.poll(async()=>Number(await page.locator('.recording-seek').inputValue()),{timeout:10000}).toBeGreaterThan(position+.2);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 const current=await highlighted(page);
 await page.getByRole('button',{name:'Audio options',exact:true}).click();
 await page.getByLabel('Document voice',{exact:true}).selectOption('male');
 await expect(page.locator('.recording-status')).toHaveText('Paused');
 await expect.poll(()=>highlighted(page)).toBe(current);
 await page.getByRole('button',{name:'Audio options',exact:true}).click();
 const timeline=cues('male'),closing=timeline.find(c=>c.footnote==='1'&&c.transition),after=timeline[timeline.indexOf(closing)+1];
 await seek(page,closing.start+.01);await page.getByRole('button',{name:'Play',exact:true}).click();
 await expect.poll(()=>highlighted(page),{timeout:15000}).toContain('The indictment alleged');
 expect(Number(await page.locator('.recording-seek').inputValue())).toBeGreaterThanOrEqual(after.start-.2);
 await expect(page.locator('.audio-options')).toHaveCount(0);
 expect(errors).toEqual([]);
});
