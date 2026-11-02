import {test,expect} from '@playwright/test';
import {defaultConfig} from '../../src/keyboard-engine.js';
import {withSettings} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
test('20x20 Shift shows Slice and turns only the selected sixth layer once',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('#size').selectOption('20');await withSettings(page,async()=>{await page.locator('#show-keyboard').check();await page.locator('#animate').uncheck();});
 for(const side of ['ShiftLeft','ShiftRight'])await expect(page.locator(`[data-code="${side}"] text`)).toHaveText('Slice');
 await page.keyboard.press('Digit6');await page.keyboard.down('Shift');await expect(page.locator('[data-code="KeyF"] text')).toHaveText('6U′');await page.keyboard.press('KeyF');await page.keyboard.up('Shift');expect((await snap(page)).history.at(-1)).toMatchObject({name:'U',depth:6,count:1,dir:-1});expect((await snap(page)).keyboard.pending).toBe(null);
 await page.keyboard.press('KeyF');expect((await snap(page)).history.at(-1)).toMatchObject({depth:1,count:1});await page.reload();await ready(page);await expect(page.locator('[data-code="ShiftLeft"] text')).toHaveText('Slice');
});
test('existing profiles gain Slice once while generic and side-specific custom Shift actions survive',async({page})=>{
 const profiles=Object.fromEntries([18,19,20].map(size=>{const config=defaultConfig(size);delete config.sliceVersion;config.display.show=true;config.modes[0].bindings=config.modes[0].bindings.filter(b=>b.trigger!=='Shift');if(size<20)config.modes[0].bindings.push({id:'custom-shift',trigger:size===19?'Shift':'ShiftLeft',action:{type:'hold-wide'}});return [size,config];}));
 await page.addInitScript(profiles=>{if(sessionStorage.getItem('shift-seeded'))return;sessionStorage.setItem('shift-seeded','yes');localStorage.setItem('master-fto-v1',JSON.stringify({size:20,solves:{20:{history:[],redo:[]}}}));localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles,display:profiles[20].display}));},profiles);
 await page.goto('/');await ready(page);await expect(page.locator('[data-code="ShiftLeft"] text')).toHaveText('Slice');await page.locator('#size').selectOption('19');await expect(page.locator('[data-code="ShiftLeft"] text')).toHaveText('Wide');await expect(page.locator('[data-code="ShiftRight"] text')).toHaveText('Wide');await page.locator('#size').selectOption('18');await expect(page.locator('[data-code="ShiftLeft"] text')).toHaveText('Wide');await expect(page.locator('[data-code="ShiftRight"] text')).toHaveText('Slice');
 await page.locator('#size').selectOption('20');await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('master-fto-keyboard-v2'));saved.profiles[20].modes[0].bindings=saved.profiles[20].modes[0].bindings.filter(b=>b.trigger!=='Shift');localStorage.setItem('master-fto-keyboard-v2',JSON.stringify(saved));});await page.reload();await ready(page);await expect(page.locator('[data-code="ShiftLeft"] text')).toBeEmpty();
});
