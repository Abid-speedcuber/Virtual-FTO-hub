import {test,expect} from '@playwright/test';
import {defaultConfig} from '../../src/keyboard-engine.js';
test.setTimeout(90000);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
async function seed(page,{timer={status:'ready'},preferences={},keyboard}={}){
 await page.route('**/worker.js*',route=>route.fulfill({contentType:'text/javascript',body:"self.onmessage=()=>self.postMessage({scramble:'U F'});"}));
 await page.addInitScript(({timer,preferences,keyboard})=>{
  if(window.name==='statistics-seeded')return;window.name='statistics-seeded';
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,animateScrambling:false,follow:false,...preferences}));
  localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[{normal:[1,1,1],layer:'outer',dir:1,name:'U'}],redo:[],undoFloor:1,timer}}}));
  if(keyboard)localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:{3:keyboard},display:keyboard.display}));
 },{timer,preferences,keyboard});await page.goto('/');await ready(page);
}
const escapes=page=>page.evaluate(()=>{for(let i=0;i<3;i++)for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'Escape',bubbles:true}));});
test('three Escapes replace a running solve without confirmation and record DNF; Tab no longer scrambles',async({page})=>{
 await seed(page);await page.keyboard.press('KeyJ');expect((await snap(page)).timer.status).toBe('running');await escapes(page);await page.waitForFunction(()=>window.fto.snapshot().timer.status==='ready');let state=await snap(page);expect(state.timer.times).toHaveLength(1);expect(state.timer.times[0]).toMatchObject({dnf:true,scramble:'U'});await expect(page.locator('#confirm-dialog')).toBeHidden();
 await escapes(page);await page.waitForFunction(()=>window.fto.snapshot().timer.status==='ready');expect((await snap(page)).timer.times).toHaveLength(1);
 await page.evaluate(()=>{for(let i=0;i<3;i++)for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'Tab',bubbles:true}));});expect((await snap(page)).timer.status).toBe('ready');
 await page.reload();await ready(page);expect((await snap(page)).timer.times[0].dnf).toBe(true);
});
test('confirmed reset records DNF, while cancelling reset retains the attempt',async({page})=>{
 await seed(page);await page.keyboard.press('KeyJ');await page.locator('#mobile-pause').click();await page.locator('#mobile-reset').click();await page.locator('#confirm-cancel').click();expect((await snap(page)).timer.times).toHaveLength(0);await page.locator('#mobile-reset').click();await page.locator('#confirm-accept').click();await page.waitForFunction(()=>window.fto.snapshot().timer.status==='idle');const state=await snap(page);expect(state.timer.status).toBe('idle');expect(state.timer.times).toHaveLength(1);expect(state.timer.times[0].dnf).toBe(true);await expect(page.locator('#solve-times')).toContainText('DNF');
});
test('next-solve setting automatically presents a scramble and resets the mode before and after',async({page})=>{
 const keyboard=defaultConfig(3);keyboard.activeMode='eif-r';await seed(page,{keyboard,preferences:{autoNextSolve:true,autoDefaultMode:true}});await page.keyboard.press('KeyF');await page.waitForFunction(()=>window.fto.snapshot().timer.status==='ready');const state=await snap(page);expect(state.timer.times).toHaveLength(1);expect(state.timer.times[0].dnf).not.toBe(true);expect(state.timer.times[0].scramble).toBe('U');expect(state.keyboard.modeName).toBe('CIF');await page.keyboard.press('Tab');expect((await snap(page)).keyboard.modeName).toBe('EIF-R');await escapes(page);await page.waitForFunction(()=>window.fto.snapshot().timer.status==='ready');expect((await snap(page)).keyboard.modeName).toBe('CIF');
});
test('statistics replace splits; times and averages open reports, comments and print settings persist',async({page})=>{
 const times=Array.from({length:12},(_,i)=>({ms:10000+i*1000,at:'2026-11-16T00:00:00.000Z',scramble:`U F ${i}`,comment:''}));times[11].dnf=true;
 await seed(page,{timer:{status:'idle',times,completed:12,bestMs:10000},preferences:{showStatistics:true}});
 await expect(page.locator('#statistics-panel')).toBeVisible();await expect(page.locator('.splits-panel')).toBeHidden();await expect(page.locator('#statistics-rows tr')).toHaveCount(7);await expect(page.getByRole('button',{name:'Current Single',exact:true})).toHaveText('DNF');
 await page.getByRole('button',{name:'Current ao5',exact:true}).click();await expect(page.locator('#statistics-report')).toHaveValue(/avg of 5:/);await expect(page.locator('#statistics-report')).toHaveValue(/U F 11/);await page.locator('#statistics-scrambles').uncheck();await expect(page.locator('#statistics-report')).not.toHaveValue(/U F/);await page.locator('#close-statistics').click();
 await page.locator('#solve-times button').first().click();await expect(page.locator('#statistics-title')).toContainText('DNF');await page.locator('#statistics-comment').fill('Lost my place');await page.locator('#statistics-comment-save').click();expect((await snap(page)).timer.times[11].comment).toBe('Lost my place');await page.locator('#close-statistics').click();await page.reload();await ready(page);await page.locator('#solve-times button').first().click();await expect(page.locator('#statistics-comment')).toHaveValue('Lost my place');await expect(page.locator('#statistics-scrambles')).not.toBeChecked();await expect(page.locator('#statistics-report')).not.toHaveValue(/U F/);
});

test('reset-on-start resolves the first move in the default mode and can be disabled',async({page})=>{
 const keyboard=defaultConfig(3);await seed(page,{keyboard});await page.keyboard.press('Tab');expect((await snap(page)).keyboard.modeName).toBe('EIF-R');await page.keyboard.press('KeyG');let state=await snap(page);expect(state.keyboard.modeName).toBe('CIF');expect(state.history.at(-1).name).toBe('F');
 await page.locator('#mobile-pause').click();await page.locator('#settings').click();await page.locator('#auto-default-mode').uncheck();await page.locator('#close-settings').click();await escapes(page);await page.waitForFunction(()=>window.fto.snapshot().timer.status==='ready');await page.keyboard.press('Tab');await page.keyboard.press('KeyG');state=await snap(page);expect(state.keyboard.modeName).toBe('EIF-R');expect(state.history.at(-1).name).toBe('R');
});

test('held Shift still produces a slice when the first turn resets the mode',async({page})=>{
 await seed(page);await page.keyboard.press('Tab');await page.keyboard.down('Shift');await page.keyboard.press('KeyG');let state=await snap(page);expect(state.timer.status).toBe('running');expect(state.keyboard.modeName).toBe('CIF');expect(state.history.at(-1)).toMatchObject({name:'F',depth:2,count:1});await page.keyboard.press('KeyH');state=await snap(page);expect(state.history).toHaveLength(3);expect(state.history.at(-1)).toMatchObject({name:'F',depth:2,count:1});await page.keyboard.up('Shift');
});
