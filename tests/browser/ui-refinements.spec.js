import {test,expect} from '@playwright/test';
import {withSettings,scramble} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
async function setup(page,size=3){await page.goto('/');await ready(page);await page.locator('#size').selectOption(String(size));await withSettings(page,async()=>{await page.locator('#show-keyboard').check();await page.locator('#animate').uncheck();});}
test('mode keys show target names on one or two lines; shortcut prefix keys stay blank',async({page})=>{
 await setup(page);await expect(page.locator('[data-code="Tab"] text')).toHaveText('EIF-R');await expect(page.locator('[data-code="KeyC"] text')).toHaveText('EIF-L');await expect(page.locator('[data-code="KeyM"] text')).toHaveText('E– cntr');await expect(page.locator('[data-code="KeyM"] tspan')).toHaveCount(2);
 for(const code of ['ControlLeft','MetaLeft','AltLeft','KeyZ'])await expect(page.locator(`[data-code="${code}"] text`)).toBeEmpty();await expect(page.locator('[data-code="ShiftLeft"] text')).toHaveText('Slice');
 await page.locator('#settings').click();await page.locator('#edit-keyboard').click();await page.locator('#binding-mode').selectOption('e-center');await page.locator('#mode-name').fill('Seven77');await page.locator('#mode-rename').click();await expect(page.locator('#binding-message')).toContainText('6 characters');
 await page.locator('#mode-name').fill('Two  Words');await page.locator('#mode-rename').click();await expect(page.locator('#binding-message')).toContainText('6 characters');await page.locator('#mode-name').fill('Ctr Mode');await page.locator('#mode-rename').click();await page.locator('#close-keyboard').click();await page.locator('#close-settings').click();await expect(page.locator('[data-code="KeyM"] text')).toHaveText('Ctr Mode');await page.reload();await ready(page);await expect(page.locator('[data-code="KeyM"] text')).toHaveText('Ctr Mode');
});
test('60 percent board omits function row, navigation, and numpad; hidden keys do not flash other positions',async({page})=>{
 await setup(page);await page.locator('#settings').click();await page.locator('#edit-keyboard').click();await page.locator('#keyboard-numpad').check();await page.locator('#keyboard-layout').selectOption('60');await expect(page.locator('#keyboard-numpad')).not.toBeVisible();await page.locator('#close-keyboard').click();await page.locator('#close-settings').click();
 await expect(page.locator('.keycap')).toHaveCount(61);for(const code of ['F1','Home','ArrowUp','Numpad0']){await expect(page.locator(`[data-code="${code}"]`)).toHaveCount(0);await page.keyboard.down(code);await expect(page.locator('.keycap.pressed')).toHaveCount(0);await page.keyboard.up(code);}
 await page.keyboard.down('KeyF');await expect(page.locator('[data-code="KeyF"]')).toHaveClass(/pressed/);await page.keyboard.up('KeyF');await page.reload();await ready(page);await expect(page.locator('.keycap')).toHaveCount(61);await page.locator('#keyboard-overlay').screenshot({path:'test-results/keyboard-60.png'});
});
test('free play and ready inspection stay colored; settings pause only a running timed solve',async({page})=>{
 await page.clock.install();await setup(page);await expect(page.locator('#timer-value')).toHaveText('00:00');const colors=(await snap(page)).stickerColors;
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));expect((await snap(page)).stickerColors).toEqual(colors);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('#settings').click();expect((await snap(page)).stickerColors).toEqual(colors);await page.locator('#close-settings').click();
 await scramble(page);await page.locator('#settings').click();expect((await snap(page)).timer.status).toBe('ready');expect((await snap(page)).stickerColors).toEqual(colors);await page.locator('#close-settings').click();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 await page.keyboard.press('KeyF');await page.clock.runFor(500);await page.locator('#settings').click();const paused=await snap(page);expect(paused.timer.status).toBe('paused');expect(paused.stickerColors).toEqual(Array(8).fill('888888'));await page.clock.runFor(10000);expect((await snap(page)).timer.elapsedMs).toBe(paused.timer.elapsedMs);
 await page.locator('#edit-keyboard').click();await page.locator('#close-keyboard').click();expect((await snap(page)).timer.status).toBe('paused');await page.mouse.click(2,2);await expect.poll(async()=>(await snap(page)).timer.status).toBe('running');expect((await snap(page)).stickerColors).toEqual(colors);
});
test('size stays top left, keyboard stays bottom, and saved times scroll between PB and keyboard',async({page})=>{
 await page.setViewportSize({width:1360,height:720});await page.addInitScript(()=>{
  if(sessionStorage.getItem('times-seeded'))return;sessionStorage.setItem('times-seeded','yes');
  localStorage.setItem('master-fto-v1',JSON.stringify({size:4,solves:{4:{history:[],redo:[],timer:{status:'idle',bestMs:10000,lastMs:109000,completed:100,times:Array.from({length:100},(_,i)=>({ms:10000+i*1000,at:'2026-11-02T00:00:00.000Z'}))}}}}));
 });
 await setup(page,4);await expect(page.locator('#solve-times li')).toHaveCount(100);await expect(page.locator('#solve-times li').first()).toContainText('1:49.00');await expect(page.locator('#timer-value')).toHaveText('00:00');
 const check=async()=>{const board=await page.locator('#keyboard-overlay').boundingBox(),list=await page.locator('#solve-times').boundingBox(),picker=await page.locator('#size').boundingBox();expect(Math.abs(board.y+board.height-(await page.evaluate(()=>innerHeight))-(-12))).toBeLessThan(2);expect(list.y+list.height).toBeLessThanOrEqual(board.y);expect(picker.x).toBe(12);expect(picker.y).toBe(12);expect(await page.locator('#solve-times').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);};
 await check();await page.screenshot({path:'test-results/times-desktop.png'});await page.setViewportSize({width:390,height:844});await check();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'test-results/times-mobile.png'});
 await page.locator('#size').selectOption('3');await expect(page.locator('#solve-times li')).toHaveCount(0);await page.locator('#size').selectOption('4');await expect(page.locator('#solve-times li')).toHaveCount(100);await page.reload();await ready(page);await expect(page.locator('#solve-times li')).toHaveCount(100);
});
