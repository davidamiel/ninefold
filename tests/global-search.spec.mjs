import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('**/account.js',route=>route.fulfill({contentType:'application/javascript',body:'export async function createAccount(){return {configured:false,user:null,ready:false}}'}));
 await page.goto('/');await page.waitForFunction(()=>window.__court);
 await page.getByRole('button',{name:'Search',exact:true}).click();
});

test('regular cases and applications have independent search sections and result limits',async({page})=>{
 const dialog=page.getByRole('dialog',{name:'Search',exact:true});
 await dialog.getByRole('searchbox').fill('v.');
 const cases=dialog.getByRole('region',{name:'Cases',exact:true}),applications=dialog.getByRole('region',{name:'Applications',exact:true});
 await expect(cases.getByRole('button')).toHaveCount(8);await expect(applications.getByRole('button')).toHaveCount(8);
 for(const docket of await cases.locator('small').allTextContents())expect(docket).not.toMatch(/\d{2}A/i);
 for(const docket of await applications.locator('small').allTextContents())expect(docket).toMatch(/\d{2}A/i);
 expect((await cases.boundingBox()).y).toBeLessThan((await applications.boundingBox()).y);
});

test('application docket variants stay out of Cases and open the correct matter from the keyboard',async({page})=>{
 const dialog=page.getByRole('dialog',{name:'Search',exact:true}),input=dialog.getByRole('searchbox');
 for(const query of ['26A560','26A-560','26a560','26-A-560']){
  await input.fill(query);await expect(dialog.getByRole('region',{name:'Cases',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('region',{name:'Applications',exact:true}).getByRole('button')).toHaveCount(1);
 }
 await input.press('Enter');await expect(dialog).toHaveCount(0);await expect(page).toHaveURL(/#\/case\/26A560(?:\?|$)/);
 await expect(page.getByRole('heading',{name:'Mullin v. Friends of the Ruidosa Church',exact:true})).toBeVisible();
});

test('empty groups stay hidden and search closes back to its trigger',async({page})=>{
 const dialog=page.getByRole('dialog',{name:'Search',exact:true}),input=dialog.getByRole('searchbox');
 await input.fill('24-1016');await expect(dialog.getByRole('region',{name:'Cases',exact:true})).toBeVisible();
 await expect(dialog.getByRole('region',{name:'Applications',exact:true})).toHaveCount(0);
 await input.fill('zzzz-nothing-matches');await expect(dialog.locator('.search-empty')).toHaveText('No matches.');await expect(dialog.getByRole('region')).toHaveCount(0);
 await input.fill('');await expect(dialog.locator('.global-search-results')).toBeEmpty();
 await input.press('Escape');await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Search',exact:true})).toBeFocused();
});
