import {test,expect} from '@playwright/test';
import {withSettings} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
test.beforeEach(async({page})=>{await page.goto('/');await ready(page);});
test('default solve screen has only the puzzle and four essential actions',async({page})=>{
 await expect(page.getByRole('button')).toHaveText(['Scramble','↶ Undo','↷ Redo','⚙ Settings']);
 await expect(page.locator('#solve-controls')).toBeHidden();
 await expect(page.locator('canvas')).toBeVisible();
 await withSettings(page,async()=>{
  await expect(page.getByLabel('FTO size',{exact:true})).toBeVisible();
  await expect(page.locator('#history')).toBeVisible();
  await page.keyboard.press('f');expect((await snap(page)).history).toHaveLength(0);
 });
 await page.locator('#settings').click();await page.keyboard.press('Escape');await expect(page.locator('#settings-dialog')).not.toBeVisible();
 await page.keyboard.press('f');await page.waitForFunction(()=>window.fto.snapshot().history.length===1);
});
test('all preferences and the camera view survive reload',async({page})=>{
 await withSettings(page,async()=>{
  await page.getByLabel('FTO size',{exact:true}).selectOption('9');
  await page.getByLabel('Pointer controls',{exact:true}).selectOption('legacy');
  await page.getByRole('switch',{name:'Follow the view',exact:true}).uncheck();
  await page.getByRole('switch',{name:'Animate turns',exact:true}).uncheck();
  await page.getByRole('switch',{name:'Show face labels',exact:true}).uncheck();
  await page.getByRole('switch',{name:'Show move buttons',exact:true}).check();
 });
 await page.locator('[data-layer="inner"]').click();
 await page.getByLabel('Slice to turn',{exact:true}).selectOption('6');await page.locator('#direction').click();
 const box=await page.locator('canvas').boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5+60,box.y+box.height*.5+30,{steps:8});await page.mouse.up();
 await page.mouse.wheel(0,120);await page.waitForTimeout(200);
 const before=await snap(page);await page.reload();await ready(page);
 const after=await snap(page);expect(after.size).toBe(9);expect(after.pointerMode).toBe('legacy');
 after.orbit.forEach((v,i)=>expect(v).toBeCloseTo(before.orbit[i],10));
 after.camera.forEach((v,i)=>expect(v).toBeCloseTo(before.camera[i],10));
 await expect(page.locator('#solve-controls')).toBeVisible();await expect(page.locator('#labels')).toBeHidden();
 await expect(page.locator('#slice')).toHaveValue('6');await expect(page.locator('#direction')).toHaveAttribute('aria-pressed','true');
 await withSettings(page,async()=>{
  await expect(page.getByRole('switch',{name:'Follow the view',exact:true})).not.toBeChecked();
  await expect(page.getByRole('switch',{name:'Animate turns',exact:true})).not.toBeChecked();
  await expect(page.getByRole('switch',{name:'Show face labels',exact:true})).not.toBeChecked();
  await expect(page.getByRole('switch',{name:'Show move buttons',exact:true})).toBeChecked();
 });
 await page.locator('[data-face="F"]').click();const move=(await snap(page)).history.at(-1);expect(move).toMatchObject({layer:'slice',depth:6,dir:-1});
 await page.locator('[data-layer="wide"]').click();await page.reload();await ready(page);
 await expect(page.locator('[data-layer="wide"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#slice')).toHaveValue('0');
});
test('mobile canvas and settings fit without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width:390,height:844});
 await page.screenshot({path:'test-results/minimal-mobile.png'});
 await page.locator('#settings').click();
 const box=await page.locator('#settings-dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
 await page.locator('#settings-dialog').screenshot({path:'test-results/settings-mobile.png'});
});
