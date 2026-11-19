import {openSettings} from './helpers.js';
import {test,expect} from '@playwright/test';
import {defaultConfig} from '../../src/keyboard-engine.js';
test.setTimeout(90000);
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
async function open(page){
 const config=defaultConfig(3);config.modes[0].bindings.push({id:'legacy-seven',trigger:'7',action:{type:'depth',depth:7}},{id:'legacy-seventeen',trigger:'Shift+7',action:{type:'depth',depth:17}},{id:'dependent',trigger:'2+G',action:{type:'move',face:'R',dir:1,kind:'outer',depth:1}});
 await page.addInitScript(config=>{if(!localStorage.getItem('master-fto-keyboard-v2'))localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:{3:config},display:config.display}));},config);
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await openSettings(page);await page.locator('#animate').uncheck();await page.locator('#edit-keyboard').click();await page.locator('#customize-bindings').click();
}
async function typeMove(page,code='Digit2'){
 await page.locator(`#binding-board-svg [data-code="${code}"]`).click({modifiers:['Control']});await expect(page.locator('#key-role-dialog')).toBeVisible();await page.locator('#key-role-type').selectOption('move');await expect(page.locator('#key-role-action')).toHaveCount(0);
}
async function close(page){await page.locator('#close-bindings').click();await page.locator('#close-keyboard').click();await page.locator('#close-settings').click();}
test('changing a suffix previews dependent keys and removes only the old combinations',async({page})=>{
 await open(page);await typeMove(page);await expect(page.locator('#key-role-impact')).toContainText('2+G');await expect(page.locator('#key-role-impact')).toContainText('base move keys stay assigned');
 await page.locator('#key-role-save').click();await expect(page.locator('#key-role-dialog')).not.toBeVisible();let config=(await snapshot(page)).keyboard.config;expect(config.modes[0].keyRoles.Digit2).toBe('move');expect(config.modes[0].bindings.some(b=>b.id==='dependent')).toBe(false);expect(config.modes[0].bindings.some(b=>b.trigger==='F')).toBe(true);expect(config.modes[1].bindings.some(b=>b.action.type==='depth'&&b.action.depth===2)).toBe(true);
 await page.locator('#binding-board-svg [data-code="Digit2"]').click();await expect(page.locator('#assign-action-dialog')).toBeVisible();await page.locator('#close-assign-action').click();await close(page);await page.keyboard.press('Digit2');expect((await snapshot(page)).history).toHaveLength(0);
 await page.reload();await page.waitForFunction(()=>window.fto?.snapshot().ready);expect((await snapshot(page)).keyboard.config.modes[0].keyRoles.Digit2).toBe('move');
});
test('replacement relocates the suffix and its chords, rejecting occupied keys',async({page})=>{
 await open(page);await typeMove(page);await page.locator('#key-role-replacement').fill('F');await page.locator('#key-role-save').click();await expect(page.locator('#key-role-message')).toContainText('already has bindings');await expect(page.locator('#key-role-dialog')).toBeVisible();await page.locator('#key-role-record').click();await page.keyboard.press('Control+F8');await expect(page.locator('#key-role-replacement')).toHaveValue('Ctrl+F8');await page.locator('#key-role-save').click();
 const bindings=(await snapshot(page)).keyboard.config.modes[0].bindings;expect(bindings.find(b=>b.id==='dependent').trigger).toBe('Ctrl+F8+G');expect(bindings.some(b=>b.trigger==='Ctrl+F8'&&b.action.type==='depth')).toBe(true);await close(page);await page.clock.install();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));await page.keyboard.press('Control+F8');await page.keyboard.press('KeyF');expect((await snapshot(page)).history.at(-1).count).toBe(2);
});
test('Ctrl plus a physical key opens the type dialog and Meta can become a move key',async({page})=>{
 await open(page);await page.keyboard.press('Control+Digit2');await expect(page.locator('#key-role-dialog')).toBeVisible();await expect(page.locator('#key-role-title')).toContainText('2');await page.locator('#close-key-role').click();
 await typeMove(page,'MetaLeft');await page.locator('#key-role-save').click();await page.locator('#binding-board-svg [data-code="MetaLeft"]').click();await expect(page.locator('#assign-action-dialog')).toBeVisible();await page.locator('#assign-action-search').fill('R');await page.locator('#assign-action-search').press('Enter');await close(page);
 await page.keyboard.down('MetaLeft');expect((await snapshot(page)).history.at(-1).name).toBe('R');await page.keyboard.press('KeyF');expect((await snapshot(page)).history.at(-1).name).toBe('U');await page.keyboard.up('MetaLeft');
});

test('7 and 8 are plain unassigned keys on 3x3 and show no fictitious suffix dependencies',async({page})=>{
 await open(page);for(const code of ['Digit7','Digit8']){
  await page.locator(`#binding-board-svg [data-code="${code}"]`).click();await expect(page.locator('#assign-action-dialog')).toBeVisible();await expect(page.locator('#assign-action-current')).toHaveText('Currently unassigned.');await page.locator('#close-assign-action').click();
  await page.locator(`#binding-board-svg [data-code="${code}"]`).click({modifiers:['Control']});await expect(page.locator('#key-role-type')).toHaveValue('move');await expect(page.locator('#key-role-impact li')).toHaveCount(0);await expect(page.locator('#key-role-action')).toHaveCount(0);await expect(page.locator('#key-role-replacement-label')).toBeHidden();await page.locator('#close-key-role').click();
 }
});
