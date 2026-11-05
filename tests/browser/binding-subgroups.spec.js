import {test,expect} from '@playwright/test';
test('subgroups browse every face at a depth and stay usable on narrow screens',async({page})=>{
 test.setTimeout(60000);await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await page.locator('#settings').click();await page.locator('#edit-keyboard').click();
 await page.locator('#catalog-category').selectOption('slices');await page.locator('#catalog-subgroup').selectOption('depth:16');
 await expect(page.locator('#catalog-rows tr')).toHaveCount(16);await expect(page.locator('#catalog-rows')).toContainText('16R');await expect(page.locator('#catalog-rows')).toContainText('16BR′');
 await page.locator('#catalog-subgroup').selectOption('depth:19');await expect(page.locator('#catalog-rows')).toContainText('19U′');
 await page.locator('#catalog-category').selectOption('wide');await page.locator('#catalog-subgroup').selectOption('depth:9');await expect(page.locator('#catalog-rows')).toContainText('9BRw');await expect(page.locator('#catalog-rows tr')).toHaveCount(16);
 await page.locator('#catalog-search').fill("19U'");await expect(page.locator('#catalog-subgroup')).toHaveValue('all');await expect(page.locator('#catalog-rows')).toContainText('19U′');
 await page.locator('#catalog-category').selectOption('slices');await page.locator('#catalog-subgroup').selectOption('depth:16');
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:844});expect(await page.locator('.catalog-filters').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);await expect(page.locator('#catalog-subgroup')).toBeInViewport();await expect(page.locator('#catalog-count')).toBeInViewport();await page.locator('#keyboard-dialog').screenshot({path:`test-results/binding-subgroups-${width}.png`});}
});
