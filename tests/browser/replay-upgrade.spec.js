import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {SolveRecorder} from '../../src/solve-recording.js';
import {defaultConfig} from '../../src/keyboard-engine.js';
import {namedMethod} from '../../src/split-methods.js';
const snap=page=>page.evaluate(()=>window.fto.snapshot()),ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const U={normal:[1,1,1],layer:'slice',depth:1,count:1,dir:1,name:'U'},view={rotation:[0,0,0,1],radius:10};
function recording(){
 let now=0;const method=namedMethod(3,{customVersion:2,phases:[{name:'FB',type:'pattern',stickers:[0]},{name:'LL',type:'finish'}]},'Source method','source');
 const previous={profile:method,groups:[{start:0,end:0,ms:60},{start:1,end:1,ms:200}],complete:true};
 const recorder=new SolveRecorder({},()=>now);recorder.arm({size:3,scramble:[U],view,keyboard:defaultConfig(3),colors:{U:'#ffffff'},previousBest:{ms:200,splitData:previous}});
 now=10000;recorder.event('key',{edge:'down',code:'KeyF'});recorder.event('start');recorder.event('accept',{id:1,action:'move',source:'keyboard',elapsedMs:0});recorder.event('sound',{kind:'move'});recorder.event('animate',{id:1,move:{...U,dir:-1},duration:100});
 now=10080;recorder.event('key',{edge:'up',code:'KeyF'});now=10100;recorder.event('turn',{id:1,move:{...U,dir:-1}});
 recorder.finish(100,true,{profile:method,groups:[{start:0,end:0,ms:50},{start:1,end:1,ms:100}],complete:true,detectorVersion:2});return recorder.last;
}
async function seedFinished(page){
 const data=recording(),user=defaultConfig(3);user.modes[0].bindings.find(b=>b.trigger==='F').action={type:'move',face:'R',dir:1,kind:'outer',depth:1};
 await page.addInitScript(({data,user})=>{if(window.name==='upgrade-seeded')return;window.name='upgrade-seeded';localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[],redo:[],undoFloor:0,timer:{status:'finished',elapsedMs:100,lastMs:100,bestMs:100,completed:1,times:[{ms:100,splitData:data.splitData}]},recordings:{last:data,pbIsLast:true}}}}));localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,phaseMethods:{3:[data.splitData.profile]},phaseProfiles:{3:data.splitData.profile},outerTurnBias:93}));localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({profiles:{3:user},display:user.display}));localStorage.setItem('master-fto-future','{"retained":true}');},{data,user});
 return data;
}
async function range(page,selector,value){await page.locator(selector).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);}

test('replay runs on home with solver bindings, audible events, previous-PB splits and moving backing',async({page})=>{
 test.setTimeout(90000);const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));const data=await seedFinished(page);await page.goto('/');await ready(page);const before=await snap(page);
 await expect(page.locator('#keyboard-svg [data-code=KeyF] text')).toContainText('R');await expect(page.locator('#share-current')).toBeVisible();await expect(page.locator('#share-pb')).toBeVisible();
 const download=page.waitForEvent('download');await page.locator('#share-pb').click();await page.locator('#share-json').click();const file=await download;await page.locator('#close-share').click();const shared=JSON.parse(await readFile(await file.path(),'utf8'));expect(shared.duration).toBe(100);
 await expect(page.locator('#export-solve')).toHaveCount(0);await page.locator('#share-current').click();await page.locator('#share-watch').click();
 await expect(page.locator('#home-replay-view canvas')).toBeVisible();await expect(page.locator('#mobile-controls')).toBeHidden();await expect(page.locator('#home-replay-progress')).toBeVisible();await expect(page.locator('#keyboard-overlay')).toBeHidden();
 const duration=(await snap(page)).replay.duration,intro=duration-data.duration;
 await range(page,'#home-replay-progress',intro);await expect(page.locator('#replay-keyboard [data-code=KeyF]')).toHaveClass(/pressed/);await expect(page.locator('#replay-keyboard [data-code=KeyF] text')).toContainText('U');
 await range(page,'#home-replay-progress',intro+50);await expect(page.locator('#split-reference')).toContainText('Solver’s previous PB');await expect(page.locator('#timer-pb')).toHaveText('0.20');await expect(page.locator('#split-rows tr').first()).toContainText('−0.01');
 const moving=(await snap(page)).replay.bodies;expect(moving.length).toBeGreaterThan(1);expect(moving.some(q=>Math.abs(q[3])<.999)).toBe(true);
 await page.locator('.solve-layout').screenshot({path:'test-results/home-replay.png'});
 await range(page,'#home-replay-progress',0);await page.locator('#home-replay-play').click();await expect.poll(async()=>(await snap(page)).replay.playing,{timeout:15000}).toBe(false);expect((await snap(page)).replay.solved).toBe(true);expect((await snap(page)).replay.sounds).toBeGreaterThanOrEqual(2);expect(pageErrors).toEqual([]);
 await page.locator('#home-replay-exit').click();expect((await snap(page)).replay).toBe(null);expect((await snap(page)).state).toEqual(before.state);expect((await snap(page)).keyboard.config).toEqual(before.keyboard.config);expect((await snap(page)).timer.times).toEqual(before.timer.times);
});

test('named methods are peers of presets and the final phase has its own name without an extra Finish',async({page})=>{
 test.setTimeout(90000);await page.goto('/');await ready(page);await page.locator('#settings').click();await page.locator('#configure-splits').click();
 await page.locator('#split-method').selectOption('bencisco');await expect(page.locator('#save-splits')).toBeHidden();expect((await snap(page)).splits.profile.method).toBe('bencisco');
 for(const name of ['My reduction','My last layer']){
  await page.locator('#split-method').selectOption('custom');await page.locator('#method-name').fill(name);await page.getByLabel('Remove phase 1',{exact:true}).click();await page.getByLabel('Phase 1 name',{exact:true}).fill('LL');await page.locator('#save-splits').click();
  await expect(page.locator('#split-method option:checked')).toHaveText(name);expect((await snap(page)).splits.profile.phases).toEqual([{name:'LL',type:'finish'}]);
 }
 const options=await page.locator('#split-method option').allTextContents();expect(options).toContain('My reduction');expect(options).toContain('My last layer');expect(options).not.toContain('Custom phases');
 await page.locator('#close-splits').click();await page.locator('#close-settings').click();await page.reload();await ready(page);await page.locator('#settings').click();await page.locator('#configure-splits').click();await expect(page.locator('#split-method option:checked')).toHaveText('My last layer');
});

test('full user backup restores bindings, named methods, PB recordings, times and preferences on a fresh browser',async({page,browser})=>{
 test.setTimeout(90000);await seedFinished(page);await page.goto('/');await ready(page);await page.locator('#settings').click();const download=page.waitForEvent('download');await page.locator('#export-user-data').click();const file=await download,buffer=await readFile(await file.path());const backup=JSON.parse(buffer.toString());expect(backup.entries['master-fto-future']).toBe('{"retained":true}');
 const context=await browser.newContext(),other=await context.newPage();await other.goto('/');await ready(other);await other.locator('#settings').click();await other.locator('#import-user-data').setInputFiles({name:'my-fto-backup.json',mimeType:'application/json',buffer});await expect(other.locator('#confirm-message')).toContainText('1 saved times');
 await Promise.all([other.waitForEvent('framenavigated'),other.locator('#confirm-accept').click()]);await ready(other);
 const restored=await other.evaluate(()=>({app:JSON.parse(localStorage.getItem('master-fto-v1')),settings:JSON.parse(localStorage.getItem('master-fto-settings-v1')),keyboard:JSON.parse(localStorage.getItem('master-fto-keyboard-v2')),future:localStorage.getItem('master-fto-future')}));
 expect(restored.app.solves[3].recordings.last.solveMs).toBe(100);expect(restored.app.solves[3].recordings.pbIsLast).toBe(true);expect(restored.app.solves[3].timer.times).toHaveLength(1);expect(restored.settings.outerTurnBias).toBe(93);expect(restored.settings.phaseMethods[3][0].name).toBe('Source method');expect(restored.keyboard.profiles[3].modes[0].bindings.find(b=>b.trigger==='F').action.face).toBe('R');expect(restored.future).toBe('{"retained":true}');await context.close();
});

test('inspection motion and inputs are not recorded; the first turn captures the starting view',async({page})=>{
 test.setTimeout(60000);const recorder=new SolveRecorder();recorder.arm({size:3,scramble:[U],view,keyboard:defaultConfig(3),colors:{}});
 await page.addInitScript(({recordings,U,view})=>{localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[U],redo:[],undoFloor:1,recordings,view,timer:{status:'ready'}}}}));localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false}));},{recordings:recorder.serialize(),U,view});
 await page.goto('/');await ready(page);await page.keyboard.press('BracketLeft');await page.waitForTimeout(1100);const initial=(await snap(page)).viewOrbit;await page.keyboard.press('KeyF');await expect.poll(async()=>(await snap(page)).timer.status).toBe('finished');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('master-fto-v1')).solves[3].recordings.last);expect(data.duration).toBeLessThan(1000);expect(data.events.find(e=>e.type==='start').at).toBe(0);expect(data.events.filter(e=>e.type==='key').map(e=>e.code)).not.toContain('BracketLeft');expect(data.initial.view.rotation).toEqual(initial);
});

test('compact recording controls provide sharing and the solver’s PB splits without the live action bar',async({page})=>{
 test.setTimeout(60000);await seedFinished(page);await page.setViewportSize({width:390,height:844});await page.goto('/');await ready(page);await expect(page.locator('#mobile-share-current')).toBeVisible();
 await page.locator('#mobile-share-current').click();await page.locator('#share-watch').click();await expect(page.locator('#mobile-controls')).toBeHidden();await expect(page.locator('#home-replay-progress')).toBeVisible();await expect(page.locator('#home-replay-share')).toBeVisible();
 const duration=(await snap(page)).replay.duration;await range(page,'#home-replay-progress',duration);await page.locator('#home-replay-splits').click();await expect(page.locator('#history-title')).toHaveText('Recorded solve splits');await expect(page.locator('#history-split-reference')).toContainText('Solver’s previous PB');await expect(page.locator('#history-times')).toBeHidden();await expect(page.locator('#history-split-rows')).toContainText('LL');
 await page.locator('#close-history').click();await page.locator('#home-replay-exit').click();await expect(page.locator('#mobile-controls')).toBeVisible();expect((await snap(page)).replay).toBe(null);
});

test('replay keyboard fits every layout with compact insets and wrapped legends',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:900});await page.goto('/');await ready(page);
 const results=await page.evaluate(async data=>{
  const {ReplayKeyboard}=await import('/src/replay-keyboard.js');
  const host=document.querySelector('#replay-keyboard'),panel=document.querySelector('#solve-panel');document.documentElement.classList.add('replaying');
  const results=[];
  for(const display of [{layout:'60'},{layout:'ansi'},{layout:'iso',numpad:true}]){
   data.initial.keyboard.display=display;
   const keyboard=new ReplayKeyboard(host,data);panel.style.setProperty('--keyboard-aspect',String(keyboard.layout.width/keyboard.layout.height));keyboard.render(0);
   const box=host.getBoundingClientRect(),svg=host.querySelector('svg'),matrix=svg.getScreenCTM();
   const keys=[...host.querySelectorAll('.keycap')],boxes=keys.map(key=>key.firstElementChild.getBBox());
   const overflow=keys.filter(key=>{const shape=key.firstElementChild.getBBox(),label=key.querySelector('text').getBBox();return label.width>0&&(label.x<shape.x-.03||label.x+label.width>shape.x+shape.width+.03);}).map(key=>key.dataset.code);
   results.push({display,overflow,left:Math.min(...boxes.map(b=>b.x))*matrix.a+matrix.e-box.left,right:box.right-(Math.max(...boxes.map(b=>b.x+b.width))*matrix.a+matrix.e),wrapped:!!host.querySelector('[data-code=BracketLeft] tspan'),width:box.width,summary:document.querySelector('#solve-summary').getBoundingClientRect().width});
  }
  return results;
 },recording());
 for(const result of results){expect(result.overflow,JSON.stringify(result.display)).toEqual([]);expect(result.left).toBeGreaterThan(7);expect(result.left).toBeLessThan(14);expect(result.right).toBeGreaterThan(7);expect(result.right).toBeLessThan(15);expect(result.width).toBeCloseTo(result.summary,0);expect(result.wrapped).toBe(true);}
 await page.locator('#replay-keyboard').screenshot({path:'test-results/replay-keyboard-layout.png'});
});

test('a live solve recording omits a long manual pause',async({page})=>{
 test.setTimeout(60000);const R={...U,normal:[1,1,-1],name:'R'};const recorder=new SolveRecorder();recorder.arm({size:3,scramble:[U,R],view,keyboard:defaultConfig(3),colors:{}});
 await page.addInitScript(({recordings,U,R,view})=>{localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[U,R],redo:[],undoFloor:2,recordings,view,timer:{status:'ready'}}}}));localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false}));},{recordings:recorder.serialize(),U,R,view});
 await page.goto('/');await ready(page);await page.clock.install();await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 await page.keyboard.press('KeyK');expect((await snap(page)).timer.status).toBe('running');await page.clock.runFor(100);await page.locator('#mobile-pause').click();expect((await snap(page)).timer.status).toBe('paused');
 await page.clock.runFor(20000);await page.locator('#mobile-pause').click();await page.clock.runFor(100);await page.keyboard.press('KeyF');await expect.poll(async()=>(await snap(page)).timer.status).toBe('finished');
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('master-fto-v1')).solves[3].recordings.last);expect(data.duration).toBeLessThan(1000);expect(data.solveMs).toBeLessThan(1000);expect(data.events.some(e=>['pause','resume'].includes(e.type))).toBe(false);expect(data.events.some(e=>e.type==='reset-input')).toBe(true);expect(data.events.filter(e=>e.type==='turn')).toHaveLength(2);
});
