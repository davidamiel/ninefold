import fs from 'node:fs';
import {test,expect} from '@playwright/test';

const read=path=>JSON.parse(fs.readFileSync(new URL('../dist/'+path,import.meta.url)));
const inventory=read('data/prepared-documents.json');
const sections={...read('data/opinion-sections.json'),...read('data/opinion-section-overrides.json')};
const documents=new Map(Object.values(sections).flat().map(d=>[d.id,d]));
const published=Object.entries(inventory).filter(([id,metadata])=>metadata.sourceDocumentId&&documents.has(id));
const guest=`export async function createAccount(notify){setTimeout(()=>notify({type:'session',user:null}),0);return {configured:false,ready:true,user:null,save(){},loadPublishedContent:async()=>[]}}`;

test.beforeEach(async({page})=>{
 await page.route('**/account.js',route=>route.fulfill({contentType:'application/javascript',body:guest}));
});

async function open(page,id){
 await page.goto('/#/reader/'+documents.get(id).caseId+'?doc='+id);
 const article=page.locator(`.prepared-document[data-document="${id}"]`);
 await expect(article).toBeVisible({timeout:20000});return article;
}

test('published batch writings open with clean text and available recordings',async({page})=>{
 test.setTimeout(120000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(const [id,metadata] of published){
  const article=await open(page,id);
  await expect(article.locator('h1')).toHaveText(metadata.title);
  await expect(article).not.toContainText(/Page Proof Pending Publication|NOTICE: This preliminary print|Reporter’s Note/);
  await expect(page.getByRole('button',{name:'Audio',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toHaveCount(0);
 }
 expect(errors).toEqual([]);
});

const tailNotes=[['24-568-21c0dda89321--4-95','7'],['24-758-71263489c308--4-194','5']].filter(([id])=>inventory[id]);
for(const [id,label] of tailNotes)test('Court footnote '+id+' remains seekable below the next writing',async({page})=>{
 const article=await open(page,id),note=article.getByRole('complementary',{name:'Footnote '+label,exact:true});
 await expect(note).toBeAttached();
 const cues=read(inventory[id].recordings.female.cuesPath).cues;
 const cue=cues.filter(c=>c.footnote===label&&!c.transition).at(-1);
 expect(cue.ranges.some(r=>r.page===documents.get(id).sourceRange.endPage&&r.start>documents.get(id).sourceRange.endOffset)).toBe(true);
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await page.getByRole('button',{name:'Read document',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Reading',{timeout:15000});
 await page.locator('.recording-seek').evaluate((el,start)=>{el.value=String(start+.02);el.dispatchEvent(new Event('input',{bubbles:true}))},cue.start);
 await expect.poll(()=>page.evaluate(value=>[...(CSS.highlights.get('document-audio')||[])].some(r=>r.startContainer.parentElement?.closest('.prepared-footnote')?.getAttribute('aria-label')==='Footnote '+value),label),{timeout:10000}).toBe(true);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 const text=note.locator('.page-text').last();await text.scrollIntoViewIfNeeded();await text.click({position:{x:14,y:8}});
 await page.getByRole('button',{name:'Audio',exact:true}).click();
 await expect(page.locator('.recording-status')).toHaveText('Reading');
});
