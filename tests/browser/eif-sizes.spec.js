import {test,expect} from '@playwright/test';
import {defaultConfig} from '../../src/keyboard-engine.js';
import {withSettings} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
test('2x2 and 20x20 have both EIF modes and return shortcuts, without center mode',async({page})=>{
 await page.goto('/');await ready(page);await withSettings(page,async()=>{await page.locator('#show-keyboard').check();await page.locator('#animate').uncheck();});
 for(const size of [2,20]){
  await page.locator('#size').selectOption(String(size));expect((await snap(page)).keyboard.config.modes.map(m=>m.name)).toEqual(['CIF','EIF-R','EIF-L']);await expect(page.locator('[data-code="KeyM"] text')).toBeEmpty();
  await page.keyboard.press('Tab');expect((await snap(page)).keyboard.modeName).toBe('EIF-R');await expect(page.locator('[data-code="KeyI"] text')).toHaveText('BR');await expect(page.locator('[data-code="KeyF"] text')).toHaveText('U′');await page.keyboard.press('KeyI');expect((await snap(page)).history.at(-1)).toMatchObject({name:'BR',dir:1});await page.keyboard.press('Tab');expect((await snap(page)).keyboard.modeName).toBe('CIF');
  await page.keyboard.press('KeyC');expect((await snap(page)).keyboard.modeName).toBe('EIF-L');await expect(page.locator('[data-code="KeyI"] text')).toHaveText('F');await page.keyboard.press('KeyI');expect((await snap(page)).history.at(-1)).toMatchObject({name:'F',dir:1});await page.keyboard.press('KeyC');expect((await snap(page)).keyboard.modeName).toBe('CIF');
 }
});
test('saved CIF profiles gain EIF modes once, deriving their custom moves and preserving user modes',async({page})=>{
 const config=defaultConfig(20);delete config.eifVersion;config.display.show=true;config.modes=config.modes.filter(m=>m.id==='cif');config.modes[0].bindings=config.modes[0].bindings.filter(b=>!['Tab','C'].includes(b.trigger));config.modes[0].bindings.find(b=>b.trigger==='F').action.face='L';config.modes.push({id:'custom',name:'My Own',bindings:[]});
 await page.addInitScript(config=>{if(sessionStorage.getItem('eif-seeded'))return;sessionStorage.setItem('eif-seeded','yes');localStorage.setItem('master-fto-v1',JSON.stringify({size:20,solves:{20:{history:[],redo:[]}}}));localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:{20:config},display:config.display}));},config);
 await page.goto('/');await ready(page);expect((await snap(page)).keyboard.config.modes.map(m=>m.name)).toEqual(['CIF','My Own','EIF-R','EIF-L']);await expect(page.locator('[data-code="KeyF"] text')).toHaveText('L′');await page.keyboard.press('Tab');await expect(page.locator('[data-code="KeyF"] text')).toHaveText('F′');await page.keyboard.press('Tab');await page.keyboard.press('KeyC');await expect(page.locator('[data-code="KeyF"] text')).toHaveText('BL′');await page.keyboard.press('KeyC');await page.reload();await ready(page);expect((await snap(page)).keyboard.config.modes).toHaveLength(4);
 await page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('master-fto-keyboard-v2')),config=saved.profiles[20];config.modes=config.modes.filter(m=>m.id!=='eif-l');for(const mode of config.modes)mode.bindings=mode.bindings.filter(b=>b.action.mode!=='eif-l');localStorage.setItem('master-fto-keyboard-v2',JSON.stringify(saved));});await page.reload();await ready(page);expect((await snap(page)).keyboard.config.modes.map(m=>m.id)).not.toContain('eif-l');
});
