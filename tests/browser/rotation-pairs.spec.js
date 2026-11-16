import {test,expect} from '@playwright/test';
import {defaultConfig} from '../../src/keyboard-engine.js';
import {ROTATION_PAIRS} from '../../src/rotation-actions.js';
import {withSettings} from './helpers.js';
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
test.setTimeout(120000);
test('all 47 pair bindings execute against the current hold and persist after reload',async({page})=>{
 const config=defaultConfig(3);config.modes=[{id:'cif',name:'CIF',bindings:ROTATION_PAIRS.map((pair,i)=>({id:`pair-${i}`,trigger:`${'ABCDEFGH'[Math.floor(i/8)]} ${'ABCDEFGH'[i%8]}`,action:{type:'rotate',face:pair[0],dir:1,kind:'outer',depth:1,pair}}))}];
 config.defaultMode=config.activeMode='cif';
 await page.addInitScript(config=>localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:{3:config},display:config.display})),config);
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);
 await withSettings(page,()=>page.locator('#animate').uncheck());
 const base=await snapshot(page),faceOrder=['U','R','F','BR','L','B','BL','D'],notations=new Set();
 for(let round=0;round<1;round++)for(const [i,pair] of ROTATION_PAIRS.entries()){
  const before=await snapshot(page);notations.add(before.hold.notation);
  await page.keyboard.press(`Key${'ABCDEFGH'[Math.floor(i/8)]}`);await page.keyboard.press(`Key${'ABCDEFGH'[i%8]}`);
  const after=await snapshot(page);
  expect(after.frame.slice(0,3)).toEqual(before.frame.slice(faceOrder.indexOf(pair[0])*3,faceOrder.indexOf(pair[0])*3+3));
  expect(after.frame.slice(6,9)).toEqual(before.frame.slice(faceOrder.indexOf(pair[1])*3,faceOrder.indexOf(pair[1])*3+3));
  expect(after.state).toEqual(base.state);expect(after.history).toEqual(base.history);expect(after.keyboard.stats.total).toBe(0);expect(after.timer.status).toBe(base.timer.status);
 }
 expect([...notations].sort()).toEqual(['CIF','EIF']);
 await page.reload();await page.waitForFunction(()=>window.fto?.snapshot().ready);expect((await snapshot(page)).keyboard.config.modes[0].bindings).toEqual(config.modes[0].bindings);
});
test('face-pair searches expose legacy aliases and bindable pairs while retaining remapping',async({page})=>{
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);
 await page.locator('#settings').click();await page.locator('#edit-keyboard').click();await page.locator('#customize-bindings').click();
 await page.locator('#catalog-search').fill('{U, R}');await expect(page.locator('#catalog-rows')).toContainText('Rot half-U');await expect(page.locator('tr[data-action="rotate:pair:U,R"]')).toBeVisible();await expect(page.locator('#rotation-apply')).toBeVisible();
 await page.locator('#catalog-search').fill('{L,R}');await expect(page.locator('#catalog-rows')).toContainText('Rot T');
 await page.locator('#catalog-search').fill('Rot T');await expect(page.locator('#catalog-rows tr')).toHaveCount(2);
 await page.locator('#catalog-search').fill('{F,D}');await page.locator('tr[data-action="rotate:pair:F,D"] .add-key').click();await page.locator('#bind-key-trigger').fill('F8');await page.locator('#bind-key-save').click();
 await page.locator('#close-bindings').click();await page.locator('#close-keyboard').click();await page.locator('#close-settings').click();
 await page.clock.install();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 const before=await snapshot(page);await page.keyboard.press('F8');const started=await snapshot(page);expect(started.rotating).toBe(true);expect(started.state).toEqual(before.state);await page.clock.runFor(300);const after=await snapshot(page);expect(after.frame.slice(0,3)).toEqual(before.frame.slice(6,9));expect(after.frame.slice(6,9)).toEqual(before.frame.slice(21,24));
});

test('EIF T and T prime put the requested current faces at U and F',async({page})=>{
 const config=defaultConfig(3);config.modes[0].bindings.push(...[["F8",1],["F9",-1]].map(([trigger,dir])=>({id:`t-${dir}`,trigger,action:{type:'rotate',face:'U',dir,kind:'outer',depth:1,vertex:true}})),{id:'eif',trigger:'F10',action:{type:'rotate',face:'U',dir:1,kind:'outer',depth:1,pair:['U','R']}});
 await page.addInitScript(config=>{localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:{3:config},display:config.display}));localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false}));},config);
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);
 for(const [key,up,front] of [['F8',6,4],['F9',3,1]]){
  if((await snapshot(page)).hold.notation!=='EIF')await page.keyboard.press('F10');const before=await snapshot(page);expect(before.hold.notation).toBe('EIF');await page.keyboard.press(key);const after=await snapshot(page);
  expect(after.frame.slice(0,3)).toEqual(before.frame.slice(up*3,up*3+3));expect(after.frame.slice(6,9)).toEqual(before.frame.slice(front*3,front*3+3));expect(after.state).toEqual(before.state);expect(after.keyboard.stats.total).toBe(0);
 }
});
