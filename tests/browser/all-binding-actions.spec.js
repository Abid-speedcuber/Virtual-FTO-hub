import {test,expect} from '@playwright/test';
test('every All filter renders the complete list without page limits',async({page})=>{
 test.setTimeout(60000);await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await page.locator('#settings').click();await page.locator('#edit-keyboard').click();
 await expect(page.locator('#catalog-rows tr')).toHaveCount(716);await expect(page.locator('#catalog-next,#catalog-prev')).toHaveCount(0);
 for(const action of ['move:BR:-1:wide:19:false','move:D:-1:slice:20:false','command:::reset','hold-slice:::','next-mode:::'])await expect(page.locator(`tr[data-action="${action}"]`)).toHaveCount(1);
 await page.locator('#catalog-category').selectOption('slices');await expect(page.locator('#catalog-rows tr')).toHaveCount(320);
 const moves=await page.locator('#catalog-rows tr').evaluateAll(rows=>rows.map(row=>row.dataset.action));expect(new Set(moves.map(key=>key.split(':')[1])).size).toBe(8);expect(new Set(moves.map(key=>key.split(':')[4])).size).toBe(20);
 const last=page.locator('tr[data-action="move:D:-1:slice:20:false"]');await last.getByRole('button',{name:'Add key for 20D′',exact:true}).click();await expect(page.locator('#bind-key-dialog')).toBeVisible();await page.locator('#close-bind-key').click();await expect(page.locator('#catalog-category')).toBeInViewport();
 await page.locator('#catalog-subgroup').selectOption('depth:16');await expect(page.locator('#catalog-rows tr')).toHaveCount(16);await page.locator('#catalog-subgroup').selectOption('all');await expect(page.locator('#catalog-rows tr')).toHaveCount(320);
 for(const [category,count] of [['wide',320],['rotations',18],['suffixes',24],['actions',9],['modes',9],['all',716]]){await page.locator('#catalog-category').selectOption(category);await expect(page.locator('#catalog-rows tr')).toHaveCount(count);await expect(page.locator('#catalog-count')).toHaveText(`${count} actions`);}
});
