import {test,expect} from '@playwright/test';
import {phaseProfile} from '../../src/solve-phases.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
async function configure(page){await page.locator('#settings').click();await page.locator('#configure-splits').click();}
async function choose(page,size){await page.locator('#puzzles').click();await page.locator(`[data-size="${size}"]`).click();}

test('desktop island unifies controls, always includes undo/redo, and the timer heading is gone',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');await ready(page);
 await expect(page.locator('#mobile-controls')).toBeVisible();await expect(page.locator('#mobile-undo')).toBeVisible();await expect(page.locator('#mobile-redo')).toBeVisible();await expect(page.locator('#mobile-history')).toBeHidden();
 await expect(page.locator('.history-tools,.puzzle-actions')).toHaveCount(2);for(const id of ['.history-tools','.puzzle-actions'])await expect(page.locator(id)).toBeHidden();
 await expect(page.locator('.timer-heading,#timer-size,#timer-status')).toHaveCount(0);
 expect(await page.locator('.time-columns').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
 await page.locator('#settings').click();await page.locator('#show-keyboard').check();await page.locator('#close-settings').click();
 await page.screenshot({path:'test-results/desktop-split-island.png'});
 await page.setViewportSize({width:390,height:844});await expect(page.locator('#mobile-history')).toBeVisible();await expect(page.locator('#mobile-undo')).toBeHidden();await expect(page.locator('#mobile-redo')).toBeHidden();
});

test('automatic method choice is saved per size; custom sticker patterns support 20x20',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/');await ready(page);await configure(page);await page.locator('#split-method').selectOption('nautilus');await page.locator('#close-splits').click();await page.locator('#close-settings').click();
 expect((await snap(page)).splits.profile.method).toBe('nautilus');
 await choose(page,20);await configure(page);await expect(page.locator('#split-method option[value=nautilus]')).toHaveCount(0);await page.locator('#split-method').selectOption('custom');await page.locator('#method-name').fill('Large method');
 await page.getByLabel('Phase 1 name',{exact:true}).fill('U face');await page.getByRole('button',{name:'Select pieces (0)'}).click();
 await page.locator('#pattern-face-all').click();await expect(page.locator('#pattern-count')).toContainText('400 stickers');await page.locator('#close-phase-pattern').click();await page.locator('#save-splits').click();await page.locator('#close-splits').click();await page.locator('#close-settings').click();
 let current=await snap(page);expect(current.splits.profile.method).toBe('custom');expect(current.splits.profile.phases[0].stickers).toHaveLength(400);
 await page.reload();await ready(page);expect((await snap(page)).splits.profile.phases[0].stickers).toHaveLength(400);
 await choose(page,3);expect((await snap(page)).splits.profile.method).toBe('nautilus');
});

test('custom solved-piece goals replace manual markers and persist after a solve',async({page})=>{
 const config={method:'custom',customVersion:2,methodId:'face',name:'Face method',phases:[{name:'U face',type:'pattern',stickers:[0,1,2,3,4,5,6,7,8]},{name:'LL',type:'finish'}]},profile=phaseProfile(3,config);
 await page.addInitScript(({config})=>{
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false,phaseProfiles:{3:config}}));
  localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[{normal:[1,1,1],layer:'outer',dir:1,name:'U'}],redo:[],undoFloor:1,timer:{status:'ready'}}}}));
 },{config});
 await page.goto('/');await ready(page);await expect(page.locator('#mobile-split')).toBeHidden();
 await page.keyboard.press('KeyF');const current=await snap(page);expect(current.timer.status).toBe('finished');expect(current.timer.times.at(-1).splitData.complete).toBe(true);
 expect(current.splits.profile).toEqual(profile);
});

test('automatic tracking groups unobserved boundaries instead of assigning a zero split',async({page})=>{
 await page.addInitScript(()=>{
  if(window.name==='auto-split-seeded')return;window.name='auto-split-seeded';
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false,phaseProfiles:{3:{method:'bencisco'}}}));
  localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[{normal:[1,1,1],layer:'outer',dir:1,name:'U'}],redo:[],undoFloor:1,timer:{status:'ready'}}}}));
 });
 await page.clock.install();await page.goto('/');await ready(page);await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 await page.keyboard.press('KeyJ');await page.clock.runFor(1000);await page.keyboard.press('KeyJ');const current=await snap(page);expect(current.timer.status).toBe('finished');expect(current.splits.complete).toBe(true);expect(current.splits.groups.at(-1).kind).toBe('combined');
 const final=page.locator('#split-rows tr').last();await expect(final).toContainText('1.00');await expect(final).toContainText('Last bottom triple + Last three triples');
});

test('Nautilus recognizes the last-layer state separately from its last triple',async({page})=>{
 await page.addInitScript(()=>{
  if(window.name==='nautilus-last-layer')return;window.name='nautilus-last-layer';
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false,phaseProfiles:{3:{method:'nautilus'}}}));
  localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[{normal:[1,1,1],layer:'outer',dir:1,name:'U'}],redo:[],undoFloor:1,timer:{status:'ready'}}}}));
 });
 await page.clock.install();await page.goto('/');await ready(page);await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 expect((await snap(page)).splits.groups[0]).toMatchObject({start:0,end:2,kind:'inspection'});
 await page.keyboard.press('KeyJ');await page.clock.runFor(1000);await page.keyboard.press('KeyJ');const current=await snap(page);
 expect(current.splits.groups.at(-1)).toMatchObject({start:3,end:3,ms:1000,kind:'exact'});
 await expect(page.locator('#split-rows tr').last()).toContainText('Last layer');await expect(page.locator('#split-rows tr').last()).toContainText('1.00');
});

test('the old split diagnostic export is replaced by a complete user-data backup',async({page},testInfo)=>{
 await page.goto('/');await ready(page);await page.locator('#settings').click();await expect(page.locator('#export-solve')).toHaveCount(0);
 const downloaded=page.waitForEvent('download');await page.locator('#export-user-data').click();const download=await downloaded;const path=testInfo.outputPath('user-data.json');await download.saveAs(path);
 const {readFile}=await import('node:fs/promises');const exported=JSON.parse(await readFile(path,'utf8'));expect(exported.format).toBe('fto-user-data-v1');expect(exported.entries['master-fto-v1']).toBeTruthy();expect(exported.entries['master-fto-settings-v1']).toBeTruthy();
});

test('compact summary uses right-side PB and ao5, with invisible but working scrollbars',async({page})=>{
 const profile=phaseProfile(3,{method:'nautilus'});
 await page.addInitScript(profile=>{
  if(window.name==='summary-metrics')return;window.name='summary-metrics';
  const times=[...Array.from({length:55},(_,i)=>({ms:200000+i*1000})),...[110000,120000,130000,140000,96370].map(ms=>({ms}))];
  const splits={detectorVersion:2,profile,groups:[20290,58780,72840,96370].map((ms,i)=>({start:i,end:i,ms,kind:'exact',turnIndex:i+1})),complete:true,reference:null,anchor:null,turnIndex:4};
  localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[],redo:[],undoFloor:0,solveEnd:0,splits,timer:{status:'finished',elapsedMs:96370,lastMs:96370,bestMs:96370,completed:60,newBest:true,times}}}}));
 },profile);
 await page.setViewportSize({width:1600,height:720});await page.goto('/');await ready(page);
 await page.locator('#settings').click();await page.locator('#show-keyboard').check();await page.locator('#close-settings').click();
 await expect(page.locator('#timer-hint')).toHaveCount(0);await expect(page.locator('#timer-pb')).toHaveText('1:36.37');await expect(page.locator('#timer-ao5')).toHaveText('2:00.00');
 const timer=await page.locator('#timer-value').boundingBox(),metrics=await page.locator('.timer-metrics').boundingBox();expect(timer.x+timer.width).toBeLessThan(metrics.x);
 for(const selector of ['.splits-panel','#solve-times'])expect(await page.locator(selector).evaluate(el=>getComputedStyle(el).scrollbarWidth)).toBe('none');
 await page.locator('#solve-times').hover();await page.mouse.wheel(0,400);await expect.poll(()=>page.locator('#solve-times').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.screenshot({path:'test-results/compact-summary-metrics.png'});
 await choose(page,4);await expect(page.locator('#timer-ao5')).toHaveText('—');await choose(page,3);await expect(page.locator('#timer-ao5')).toHaveText('2:00.00');
});
