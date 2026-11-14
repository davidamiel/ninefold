import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('**/account.js',route=>route.fulfill({contentType:'application/javascript',body:'export async function createAccount(){return {configured:false,user:null,ready:false}}'}));
 await page.goto('/');await page.waitForFunction(()=>window.__court);
 await page.getByRole('button',{name:'Search',exact:true}).click();
});

test('merits and non-merits matters have independent sections and result limits',async({page})=>{
 const dialog=page.getByRole('dialog',{name:'Search',exact:true});
 await dialog.getByRole('searchbox').fill('v.');
 const merits=dialog.getByRole('region',{name:'Merits docket',exact:true}),nonMerits=dialog.getByRole('region',{name:'Non-merits docket',exact:true});
 await expect(merits.getByRole('button')).toHaveCount(8);await expect(nonMerits.getByRole('button')).toHaveCount(8);
 const meritsIds=await merits.getByRole('button').evaluateAll(els=>els.map(el=>el.dataset.value));
 const nonMeritsIds=await nonMerits.getByRole('button').evaluateAll(els=>els.map(el=>el.dataset.value));
 expect(meritsIds).not.toContain('25-52');expect(nonMeritsIds).toContain('25-52');
 expect((await merits.boundingBox()).y).toBeLessThan((await nonMerits.boundingBox()).y);
});

test('application docket variants stay out of the merits docket and open the correct matter from the keyboard',async({page})=>{
 const dialog=page.getByRole('dialog',{name:'Search',exact:true}),input=dialog.getByRole('searchbox');
 for(const query of ['26A560','26A-560','26a560','26-A-560']){
  await input.fill(query);await expect(dialog.getByRole('region',{name:'Merits docket',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('region',{name:'Non-merits docket',exact:true}).getByRole('button')).toHaveCount(1);
 }
 await input.press('Enter');await expect(dialog).toHaveCount(0);await expect(page).toHaveURL(/#\/case\/26A560(?:\?|$)/);
 await expect(page.getByRole('heading',{name:'Mullin v. Friends of the Ruidosa Church',exact:true})).toBeVisible();
});

test('empty groups stay hidden and search closes back to its trigger',async({page})=>{
 const dialog=page.getByRole('dialog',{name:'Search',exact:true}),input=dialog.getByRole('searchbox');
 await input.fill('24-1016');await expect(dialog.getByRole('region',{name:'Merits docket',exact:true})).toBeVisible();
 await expect(dialog.getByRole('region',{name:'Non-merits docket',exact:true})).toHaveCount(0);
 await input.fill('zzzz-nothing-matches');await expect(dialog.locator('.search-empty')).toHaveText('No matches.');await expect(dialog.getByRole('region')).toHaveCount(0);
 await input.fill('');await expect(dialog.locator('.global-search-results')).toBeEmpty();
 await input.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Search',exact:true})).toBeFocused();
});


test('summary dispositions and argued stay requests remain non-merits, while granted full-review cases remain merits',async({page})=>{
 const dialog=page.getByRole('dialog',{name:'Search',exact:true}),input=dialog.getByRole('searchbox');
 for(const [query,id,section] of [
  ['Clark v. Sweeney','25-52','Non-merits docket'],
  ['25A312','25A312','Non-merits docket'],
  ['24-413','24-413','Merits docket']
 ]){
  await input.fill(query);
  await expect(dialog.getByRole('region',{name:section,exact:true}).locator(`[data-action="case"][data-value="${id}"]`)).toBeVisible();
  const other=section==='Merits docket'?'Non-merits docket':'Merits docket';
  await expect(dialog.getByRole('region',{name:other,exact:true}).locator(`[data-value="${id}"]`)).toHaveCount(0);
 }
});
