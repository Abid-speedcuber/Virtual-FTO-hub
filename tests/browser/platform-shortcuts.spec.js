import {test,expect} from '@playwright/test';
for(const [platform,label] of [['Windows','Win'],['macOS','Cmd'],['Linux','Super']])test(`${platform} shows native modifier names with working Ctrl and Command alternatives`,async({page})=>{
 test.setTimeout(60000);await page.addInitScript(platform=>{Object.defineProperty(navigator,'userAgentData',{value:{platform},configurable:true});},platform);
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await page.locator('#settings').click();await page.locator('#animate').uncheck();await page.locator('#edit-keyboard').click();await page.locator('#catalog-mode').selectOption('e-center');await page.getByText('Mode settings',{exact:true}).click();await page.locator('#catalog-use-mode').click();await page.locator('#catalog-category').selectOption('actions');
 const undo=page.locator('tr[data-action="command:::undo"]'),redo=page.locator('tr[data-action="command:::redo"]');await expect(undo).toContainText('Ctrl+Z');await expect(undo).toContainText(`${label}+Z`);await expect(redo).toContainText(`${label}+Shift+Z`);await expect(redo).toContainText('Ctrl+Y');
 await page.locator('#close-keyboard').click();await page.locator('#close-settings').click();const length=()=>page.evaluate(()=>window.fto.snapshot().history.length);
 await page.keyboard.press('KeyF');await expect.poll(length).toBe(1);for(const [key,count] of [['Control+KeyZ',0],['Control+KeyY',1],['Meta+KeyZ',0],['Meta+Shift+KeyZ',1]]){await page.keyboard.press(key);await expect.poll(length).toBe(count);}
});
