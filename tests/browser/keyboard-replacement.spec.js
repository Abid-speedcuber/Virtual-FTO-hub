import {test,expect} from '@playwright/test';
import {defaultConfig} from '../../src/keyboard-engine.js';
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
async function setup(page){
 const config=defaultConfig(3);config.commandVersion=1;config.sequenceTimeout=2200;config.modes.push({id:'mine',name:'Mine',bindings:[]});
 await page.addInitScript(config=>{localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({profiles:{3:config,4:config},display:config.display}));localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false}));},config);
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);await page.keyboard.press('KeyF');await page.locator('#settings').click();await page.locator('#edit-keyboard').click();
}
async function cancel(page){await page.locator('#confirm-cancel').click();await page.waitForFunction(()=>!document.querySelector('#confirm-dialog').hasAttribute('data-pending'));}
async function accept(page){await page.locator('#confirm-accept').click();await page.waitForFunction(()=>!document.querySelector('#confirm-dialog').hasAttribute('data-pending'));}
test('both named presets require confirmation and preserve progress and preferences',async({page})=>{
 test.setTimeout(60000);await setup(page);const before=await snapshot(page),other=await page.evaluate(()=>JSON.parse(localStorage.getItem('master-fto-keyboard-v2')).profiles[4]);
 for(const preset of ['abid','cstimer']){await page.locator(`#catalog-reset-${preset}`).click();await expect(page.locator('#confirm-dialog')).toBeVisible();await expect(page.locator('#confirm-message')).toContainText('Custom bindings and modes');await cancel(page);expect((await snapshot(page)).keyboard.config).toEqual(before.keyboard.config);}
 for(const preset of ['cstimer','abid']){await page.locator(`#catalog-reset-${preset}`).click();await accept(page);await expect.poll(async()=>(await snapshot(page)).keyboard.config.preset).toBe(preset);const saved=await snapshot(page);expect(saved.keyboard.config.modes.some(mode=>mode.id==='mine')).toBe(false);expect(saved.keyboard.config.sequenceTimeout).toBe(2200);expect(saved.history).toEqual(before.history);expect(saved.keyboard.stats.total).toBe(before.keyboard.stats.total);expect(saved.keyboard.config.display).toEqual(before.keyboard.config.display);}
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('master-fto-keyboard-v2')).profiles[4])).toEqual(other);
});
test('keyboard import offers file selection, validates before confirmation and supports dropping backups',async({page})=>{
 test.setTimeout(60000);await setup(page);const before=await snapshot(page);await page.locator('#catalog-choose-import').click();await expect(page.locator('#keyboard-import-dialog')).toBeVisible();await expect(page.locator('#keyboard-import-drop')).toContainText('Drop a keyboard JSON file here');await page.locator('#keyboard-import-dialog').screenshot({path:'test-results/keyboard-import-modal.png'});
 const chooser=page.waitForEvent('filechooser');await page.locator('#choose-keyboard-file').click();await (await chooser).setFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('#keyboard-import-message')).toContainText('keyboard needs');await expect(page.locator('#confirm-dialog')).toBeHidden();expect((await snapshot(page)).keyboard.config).toEqual(before.keyboard.config);
 const imported=defaultConfig(3);imported.modes[0].name='Loaded';imported.sequenceTimeout=2300;
 async function drop(){const transfer=await page.evaluateHandle(data=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(data)],'keyboard.json',{type:'application/json'}));return dt;},imported);await page.locator('#keyboard-import-drop').dispatchEvent('drop',{dataTransfer:transfer});await transfer.dispose();await expect(page.locator('#confirm-dialog')).toBeVisible();}
 await drop();await expect(page.locator('#confirm-message')).toContainText('4 modes');await cancel(page);await expect(page.locator('#choose-keyboard-file')).toBeEnabled();expect((await snapshot(page)).keyboard.config).toEqual(before.keyboard.config);await expect(page.locator('#keyboard-import-dialog')).toBeVisible();
 await drop();await accept(page);await expect(page.locator('#keyboard-import-dialog')).toBeHidden();const after=await snapshot(page);expect(after.keyboard.config.modes[0].name).toBe('Loaded');expect(after.keyboard.config.sequenceTimeout).toBe(2300);expect(after.history).toEqual(before.history);
});
test('resetting TPS and turn count clears live input statistics while keeping puzzle moves',async({page})=>{
 await setup(page);const before=await snapshot(page);expect(before.keyboard.stats.total).toBe(1);await expect(page.locator('#keyboard-reset-tps')).toHaveText('Reset TPS and turn count');await page.locator('#keyboard-reset-tps').click();const after=await snapshot(page);expect(after.keyboard.stats).toMatchObject({total:0,peak:0,tps:0});expect(after.history).toEqual(before.history);expect(after.state).toEqual(before.state);
});
