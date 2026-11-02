import {test,expect} from '@playwright/test';
import {withSettings} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
async function setup(page,size=3){
 await page.goto('/');await ready(page);await page.locator('#size').selectOption(String(size));
 await withSettings(page,async()=>{await page.locator('#show-keyboard').check();await page.locator('#animate').uncheck();await page.locator('#follow').uncheck();});
}

test('quick taps preserve Slice until release; held suffixes modify repeated turns and clear on release',async({page})=>{
 await page.clock.install();await setup(page,4);await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 await page.keyboard.down('Digit2');expect((await snap(page)).keyboard.pending).toBe(null);
 await expect(page.locator('[data-code="ShiftLeft"] text')).toHaveText('Slice');await expect(page.locator('[data-code="KeyF"] text')).toHaveText('U′');
 await page.keyboard.up('Digit2');expect((await snap(page)).keyboard.pending).toBe(2);await page.keyboard.press('KeyF');expect((await snap(page)).history.at(-1)).toMatchObject({count:2});
 await page.keyboard.down('Digit2');await page.clock.runFor(220);
 await page.keyboard.press('KeyF');await page.keyboard.press('KeyJ');let current=await snap(page);expect(current.history.slice(-2).map(m=>m.count)).toEqual([2,2]);expect(current.keyboard.pending).toBe(null);
 await page.keyboard.up('Digit2');await page.keyboard.press('KeyI');expect((await snap(page)).history.at(-1)).toMatchObject({count:1,depth:1});
 // Chording a move before the hold timeout also activates the modifier.
 await page.keyboard.down('Digit2');await page.keyboard.press('KeyF');await page.keyboard.press('KeyJ');await page.keyboard.up('Digit2');
 current=await snap(page);expect(current.history.slice(-2).map(m=>m.count)).toEqual([2,2]);expect(current.keyboard.pending).toBe(null);
});

test('E-center shows the six new moves, Backspace undo, and preset-specific EIF exits',async({page})=>{
 await setup(page);await page.keyboard.press('KeyM');
 for(const [code,label,name,dir,depth] of [['KeyF','U','U',1,1],['KeyD','U′','U',-1,1],['KeyJ','2R′','R',-1,2],['KeyU','2R','R',1,2],['KeyK','R′','R',-1,1],['KeyI','R','R',1,1]]){
  await expect(page.locator(`[data-code="${code}"] text`)).toHaveText(label);await page.keyboard.press(code);expect((await snap(page)).history.at(-1)).toMatchObject({name,dir,depth,count:1});await page.keyboard.press('Backspace');await expect.poll(async()=>(await snap(page)).history.length,{message:`Undo after ${code}`}).toBe(0);
 }
 for(const code of ['KeyH','KeyS','KeyL','KeyE'])await expect(page.locator(`[data-code="${code}"] text`)).toBeEmpty();
 await expect(page.locator('[data-code="KeyM"] text')).toHaveText('CIF');await page.keyboard.press('Tab');expect((await snap(page)).keyboard.modeName).toBe('EIF-R');
 await page.keyboard.press('KeyM');await page.keyboard.press('KeyC');expect((await snap(page)).keyboard.modeName).toBe('EIF-L');await page.keyboard.press('KeyM');await page.keyboard.press('KeyM');expect((await snap(page)).keyboard.modeName).toBe('CIF');
 await withSettings(page,async()=>{await page.locator('#edit-keyboard').click();await page.locator('#keyboard-reset-cstimer').click();await page.locator('#close-keyboard').click();});
 await page.keyboard.press('Space');await expect(page.locator('[data-code="KeyM"] text')).toHaveText('CIF');await page.keyboard.press('Shift+Tab');expect((await snap(page)).keyboard.modeName).toBe('EIF-L');
 await page.keyboard.press('Space');await page.keyboard.press('KeyM');expect((await snap(page)).keyboard.modeName).toBe('CIF');
});

test('finishing prevents queued and new undo/redo, and stays protected after reload',async({page})=>{
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('finish-seeded'))return;sessionStorage.setItem('finish-seeded','yes');
  localStorage.setItem('master-fto-v1',JSON.stringify({size:4,solves:{4:{history:[{normal:[1,1,1],name:'U',layer:'outer',dir:1,depth:1,count:1}],redo:[],undoFloor:0,timer:{status:'ready'}}}}));
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({follow:false,animate:true,disableSounds:true}));
 });
 await page.clock.install();await page.goto('/');await ready(page);await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 await page.keyboard.press('KeyF');await page.keyboard.press('Backspace');await page.clock.runFor(500);
 const finished=await snap(page);expect(finished.timer.status).toBe('finished');expect(finished.solved).toBe(true);expect(finished.history).toHaveLength(2);expect(finished.redo).toHaveLength(0);
 await expect(page.locator('#undo')).toBeDisabled();await expect(page.locator('#redo')).toBeDisabled();
 for(const code of ['Backspace','Control+z','Shift+Backspace','Control+y'])await page.keyboard.press(code);
 expect((await snap(page)).history).toEqual(finished.history);expect((await snap(page)).state).toEqual(finished.state);
 await page.reload();await ready(page);await page.keyboard.press('Backspace');expect((await snap(page)).state).toEqual(finished.state);await expect(page.locator('#undo')).toBeDisabled();
});
