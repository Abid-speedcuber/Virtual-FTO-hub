import {test,expect} from '@playwright/test';
async function open(page){await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await page.locator('#settings').click();await page.locator('#edit-keyboard').click();await page.locator('#customize-bindings').click();}
test('larger-puzzle bindings appear only when editing the corresponding puzzle',async({page})=>{
 test.setTimeout(60000);await open(page);await expect(page.locator('#keyboard-puzzle')).toHaveValue('3');await expect(page.locator('#catalog-category')).toHaveValue('all');
 await page.locator('#catalog-search').fill('9BRw');await expect(page.locator('#catalog-rows tr')).toHaveCount(0);await page.locator('#keyboard-puzzle').selectOption('9');const row=page.locator('tr[data-action="move:BR:1:wide:9:false"]');await expect(row).toContainText('Unassigned');await row.getByRole('button',{name:'Add key for 9BRw',exact:true}).click();await page.keyboard.press('F8');await page.locator('#bind-key-save').click();await expect(row).toContainText('F8');
 await page.locator('#keyboard-puzzle').selectOption('20');await page.locator('#catalog-search').fill("20BL'");await expect(page.locator('tr[data-action="move:BL:-1:slice:20:false"]')).toContainText('Unassigned');
 await page.locator('#catalog-category').selectOption('wide');await expect(page.locator('#catalog-search')).toHaveValue('');await expect(page.locator('#catalog-count')).toHaveText('304 actions');
 const saved=await page.evaluate(()=>window.fto.snapshot());expect(saved.size).toBe(3);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('master-fto-keyboard-v2')).profiles[9].modes[0].bindings.some(b=>b.trigger==='F8'&&b.action.depth===9&&b.action.face==='BR'&&b.action.kind==='wide'))).toBe(true);
});
