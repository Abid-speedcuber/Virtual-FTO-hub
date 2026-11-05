import {test,expect} from '@playwright/test';
async function open(page){await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await page.locator('#settings').click();await page.locator('#edit-keyboard').click();}
test('3x3 exposes unassigned 9BRw and every supported layer without switching puzzles',async({page})=>{
 test.setTimeout(60000);await open(page);await expect(page.locator('#keyboard-puzzle')).toHaveValue('3');await expect(page.locator('#catalog-category')).toHaveValue('all');
 await page.locator('#catalog-search').fill('9BRw');const row=page.locator('tr[data-action="move:BR:1:wide:9:false"]');await expect(row).toContainText('Unassigned');await expect(row).toContainText('needs a larger puzzle');await row.getByRole('button',{name:'Add key for 9BRw',exact:true}).click();await page.keyboard.press('F8');await page.locator('#bind-key-save').click();await expect(row).toContainText('F8');
 await page.locator('#catalog-search').fill("20BL'");await expect(page.locator('tr[data-action="move:BL:-1:slice:20:false"]')).toContainText('Unassigned');
 await page.locator('#catalog-category').selectOption('wide');await expect(page.locator('#catalog-search')).toHaveValue('');await expect(page.locator('#catalog-count')).toHaveText('320 actions');
 const saved=await page.evaluate(()=>window.fto.snapshot());expect(saved.size).toBe(3);expect(saved.keyboard.config.modes[0].bindings.some(b=>b.trigger==='F8'&&b.action.depth===9&&b.action.face==='BR'&&b.action.kind==='wide')).toBe(true);
});
test('creating, renaming and deleting modes immediately updates the Modes action list',async({page})=>{
 test.setTimeout(60000);await open(page);await page.locator('#catalog-search').fill('9BRw');await page.locator('#catalog-category').selectOption('modes');await expect(page.locator('#catalog-search')).toHaveValue('');
 await page.getByText('Mode settings',{exact:true}).click();await page.locator('#catalog-new-mode').click();const id=await page.locator('#catalog-mode').inputValue();await expect(page.locator('#catalog-category')).toHaveValue('modes');
 const switchRow=page.locator(`tr[data-action="mode::${id}:"]`),holdRow=page.locator(`tr[data-action="hold-mode::${id}:"]`);await expect(switchRow).toContainText('Unassigned');await expect(holdRow).toContainText('Unassigned');
 await page.locator('#catalog-mode-name').fill('Custom');await page.locator('#catalog-mode-name').press('Tab');await expect(switchRow).toContainText('Switch to Custom');await expect(holdRow).toContainText('Hold Custom');
 await switchRow.getByRole('button',{name:'Add key for Switch to Custom',exact:true}).click();await page.keyboard.press('F8');await page.locator('#bind-key-save').click();await expect(switchRow).toContainText('F8');
 await page.locator('#catalog-delete-mode').click();await expect(switchRow).toHaveCount(0);await expect(holdRow).toHaveCount(0);await expect(page.locator('#catalog-mode option')).toHaveCount(4);
});
