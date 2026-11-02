import {test,expect} from '@playwright/test';
import {withSettings,confirmAction} from './helpers.js';
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const idle=page=>page.waitForFunction(()=>window.fto&&!window.fto.snapshot().busy&&!window.fto.snapshot().queued);
const signature=state=>state.map(s=>`${s.color}:${s.vertices.map(v=>v.join(',')).sort().join(';')}`).sort().join('|');
async function facePoint(page){const box=await page.locator('.face-label:not([hidden])').filter({hasText:/^F$/}).boundingBox();return {x:box.x+box.width/2,y:box.y+box.height/2};}
test.beforeEach(async({page})=>{await page.goto('/');await idle(page);});
test('rapid keyboard turns, exact undo/redo, and reload retain the solve',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const before=await snap(page);
 for(const code of ['F','I','H','D','R','S','O','A','I','H','D','R'])await page.keyboard.press(`Key${code}`);await idle(page);const mixed=await snap(page);expect(mixed.history).toHaveLength(12);expect(signature(mixed.state)).not.toBe(signature(before.state));
 for(let i=0;i<12;i++)await page.keyboard.press('Control+z');await idle(page);expect(signature((await snap(page)).state)).toBe(signature(before.state));for(let i=0;i<12;i++)await page.keyboard.press('Control+Shift+z');await idle(page);expect(signature((await snap(page)).state)).toBe(signature(mixed.state));await page.reload();await idle(page);expect(signature((await snap(page)).state)).toBe(signature(mixed.state));expect(errors).toEqual([]);
});
test('legacy clicks consume wide suffixes, right-click direction, and held slice exactly once',async({page})=>{
 await page.locator('#size').selectOption('3');await withSettings(page,async()=>{await page.locator('#pointer-mode').selectOption('legacy');await page.locator('#animate').uncheck();});const p=await facePoint(page);
 await page.keyboard.press('Digit2');await page.mouse.click(p.x,p.y,{button:'right'});expect((await snap(page)).history.at(-1)).toMatchObject({name:'F',depth:1,count:2,dir:-1});expect((await snap(page)).keyboard.pending).toBe(null);
 await page.keyboard.press('Digit2');await page.keyboard.down('Shift');await page.mouse.click(p.x,p.y);await page.keyboard.up('Shift');expect((await snap(page)).history.at(-1)).toMatchObject({name:'F',depth:2,count:1,dir:1});await page.mouse.click(p.x,p.y);expect((await snap(page)).history.at(-1)).toMatchObject({name:'F',depth:1,count:1,dir:1});expect((await snap(page)).keyboard.stats.total).toBe(3);
});
test('full-width pointer suffix rotates the view without altering the puzzle or TPS',async({page})=>{
 await page.locator('#size').selectOption('2');await withSettings(page,()=>page.locator('#pointer-mode').selectOption('legacy'));const before=await snap(page),p=await facePoint(page);await page.keyboard.press('Digit2');await page.mouse.click(p.x,p.y);const after=await snap(page);expect(after.state).toEqual(before.state);expect(after.orbit).not.toEqual(before.orbit);expect(after.history).toHaveLength(0);expect(after.keyboard.stats.total).toBe(0);expect(after.keyboard.pending).toBe(null);
});
test('reset cancels accepted animations, preserves the view, and persists free play',async({page})=>{
 for(const code of ['KeyF','KeyI','KeyH'])await page.keyboard.press(code);const before=await snap(page);await confirmAction(page,()=>page.locator('#freeplay-reset').click());await idle(page);const after=await snap(page);expect(after).toMatchObject({solved:true,history:[],redo:[],queued:0,busy:false,timer:{status:'idle'}});expect(after.camera).toEqual(before.camera);await page.reload();await idle(page);expect((await snap(page)).solved).toBe(true);
});
test('orbit and held-wheel roll never introduce a turn, and the Home binding restores view',async({page})=>{
 await withSettings(page,()=>page.locator('#pointer-mode').selectOption('legacy'));const before=await snap(page),box=await page.locator('canvas').boundingBox();await page.mouse.move(box.width/2,90);await page.mouse.down();await page.mouse.move(box.width/2,330,{steps:10});await page.mouse.wheel(0,120);await page.mouse.up();await expect.poll(async()=>(await snap(page)).orbit).not.toEqual(before.orbit);expect((await snap(page)).history).toHaveLength(0);await page.keyboard.press('Home');await expect.poll(async()=>(await snap(page)).camera).toEqual(before.camera);
});
