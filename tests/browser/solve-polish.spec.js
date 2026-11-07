import {test,expect} from '@playwright/test';
import {defaultConfig} from '../../src/keyboard-engine.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
async function seed(page,{status='ready',auto=true,defaultMode='cif',activeMode='cif'}={}){
 const config=defaultConfig(4);config.activeMode=activeMode;config.defaultMode=defaultMode;
 await page.addInitScript(({config,status,auto})=>{
  if(sessionStorage.getItem('solve-polish-seeded'))return;sessionStorage.setItem('solve-polish-seeded','yes');
  localStorage.setItem('master-fto-v1',JSON.stringify({size:4,solves:{4:{history:[{normal:[1,1,1],name:'U',layer:'outer',dir:1,depth:1,count:1}],redo:[],undoFloor:0,timer:{status}}}}));
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({follow:false,animate:false,disableSounds:true,autoDefaultMode:auto}));
  localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:{4:config},display:config.display}));
 },{config,status,auto});
 await page.goto('/');await ready(page);
}

test('all gray pauses wait for a resume key after focus, dialogs, and reload',async({page})=>{
 await seed(page,{status:'running'});expect((await snap(page)).manualPaused).toBe(true);
 await page.keyboard.press('KeyI');const running=await snap(page);expect(running.timer.status).toBe('running');expect(running.history).toHaveLength(1);
 await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));});
 expect((await snap(page)).timer.status).toBe('paused');await expect(page.locator('#pause-message')).toBeVisible();
 await page.locator('#settings').click();await page.locator('#close-settings').click();expect((await snap(page)).timer.status).toBe('paused');
 await page.keyboard.press('KeyI');expect((await snap(page)).history).toHaveLength(1);expect((await snap(page)).timer.status).toBe('running');
 await page.locator('#scramble').click();await page.locator('#confirm-cancel').click();expect((await snap(page)).timer.status).toBe('paused');
 await page.reload();await ready(page);expect((await snap(page)).timer.status).toBe('paused');expect((await snap(page)).stickerColors).toEqual(Array(8).fill('888888'));
 await page.keyboard.press('KeyI');expect((await snap(page)).timer.status).toBe('running');expect((await snap(page)).history).toHaveLength(1);
});

for(const options of [{auto:true,defaultMode:'cif',expected:'cif'},{auto:false,defaultMode:'cif',expected:'eif-l'},{auto:true,defaultMode:'eif-r',expected:'eif-r'}]){
 test(`completion returns to ${options.expected} with auto=${options.auto}, default=${options.defaultMode}`,async({page})=>{
  await seed(page,{...options,activeMode:'eif-l'});await page.keyboard.press('KeyF');const finished=await snap(page);
  expect(finished.timer.status).toBe('finished');expect(finished.keyboard.baseMode).toBe(options.expected);
  await page.locator('#scramble').click();await expect(page.locator('#confirm-title')).toHaveText('Start a new timed solve?');await expect(page.locator('#confirm-message')).toContainText('Saved times are kept');await expect(page.locator('#confirm-message')).not.toContainText('replaces the current solve');await page.locator('#confirm-cancel').click();
  await page.locator('#settings').click();await expect(page.locator('#auto-default-mode')).toBeChecked({checked:options.auto});await page.locator('#close-settings').click();await page.reload();await ready(page);expect((await snap(page)).keyboard.baseMode).toBe(options.expected);
 });
}

test('move and rotation pickers contain 4x4 direction grids and save the chosen action',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('#settings').click();await expect(page.locator('#auto-default-mode')).toBeChecked();await expect(page.locator('#pointer-mode option[value="legacy"]')).toHaveText('Orbit + click');await page.locator('#edit-keyboard').click();
 await page.locator('#catalog-category').selectOption('turns');await page.locator('tr[data-action="move:R:-1:outer:1:false"] .add-key').click();await page.locator('#bind-key-trigger').fill('X');await page.locator('#bind-key-save').click();
 expect((await snap(page)).keyboard.config.modes[0].bindings.find(b=>b.trigger==='X').action).toMatchObject({type:'move',face:'R',dir:-1});
 await page.locator('#catalog-category').selectOption('rotations');await page.locator('tr[data-action="rotate:D:-1"] .add-key').click();await page.locator('#bind-key-trigger').fill('N');await page.locator('#bind-key-save').click();expect((await snap(page)).keyboard.config.modes[0].bindings.find(b=>b.trigger==='N').action).toMatchObject({type:'rotate',face:'D',dir:-1});
 await page.locator('#close-keyboard').click();await page.locator('#auto-default-mode').uncheck();await page.locator('#close-settings').click();await page.reload();await ready(page);await page.locator('#settings').click();await expect(page.locator('#auto-default-mode')).not.toBeChecked();await page.locator('#edit-keyboard').click();await expect(page.locator('#keyboard-default-mode')).toHaveValue('eif-r');
});
