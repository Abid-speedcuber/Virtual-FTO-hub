import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {SolveRecorder,validateRecording,recordingFrame} from '../../src/solve-recording.js';
import {formatTime} from '../../src/solve-timer.js';
import {isSolved,signature} from '../../src/puzzle.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
const U={normal:[1,1,1],layer:'slice',depth:1,count:1,dir:1,name:'U'},R={normal:[1,1,-1],layer:'slice',depth:1,count:1,dir:1,name:'R'};
const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.22,.15,-.09)).toArray();
function attempt(size){const recorder=new SolveRecorder();recorder.arm({size,scramble:[U,R],view:{rotation,radius:11},keyboard:{preset:'abid'},colors:{U:'#ffffff'}});return recorder.serialize();}
async function seed(page,size){
 await page.addInitScript(({size,recordings,rotation})=>{
  if(window.name==='recording-seeded')return;window.name='recording-seeded';
  const U={normal:[1,1,1],layer:'slice',depth:1,count:1,dir:1,name:'U'},R={normal:[1,1,-1],layer:'slice',depth:1,count:1,dir:1,name:'R'};
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:false}));
  localStorage.setItem('master-fto-v1',JSON.stringify({size,solves:{[size]:{history:[U,R],redo:[],undoFloor:2,recordings,view:{rotation,radius:11},timer:{status:'ready'}}}}));
 },{size,recordings:attempt(size),rotation});
}
async function records(page){return page.evaluate(()=>{const saved=JSON.parse(localStorage.getItem('master-fto-v1'));return saved.solves[saved.size].recordings;});}

test('fresh wide screens show the keyboard and have no split section, prompt or extra column',async({page})=>{
 await page.setViewportSize({width:1600,height:900});await page.goto('/');await ready(page);
 await expect(page.locator('#keyboard-overlay')).toBeVisible();await expect(page.locator('.splits-panel')).toBeHidden();await expect(page.locator('#splits-empty')).toBeHidden();expect((await snapshot(page)).splits.profile.method).toBe('off');
 expect(await page.locator('.time-columns').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
 await page.locator('#settings').click();await expect(page.locator('#show-keyboard')).toBeChecked();await page.locator('#show-keyboard').uncheck();await page.locator('#close-settings').click();await page.reload();await ready(page);await expect(page.locator('#keyboard-overlay')).toBeHidden();
 await page.setViewportSize({width:390,height:844});await page.locator('#settings').click();await expect(page.locator('#show-keyboard')).toBeHidden();
});

for(const size of [2,3,4])test(`${size}x${size} captures turns, keys, held view and a persistent PB; replay import never changes the current puzzle`,async({page})=>{
 await seed(page,size);await page.goto('/');await ready(page);
 const actualView=(await snapshot(page)).viewOrbit;await page.keyboard.press('KeyK');await page.waitForTimeout(100);await page.keyboard.press('KeyF');
 await expect.poll(async()=>(await snapshot(page)).timer.status).toBe('finished');
 const stored=await records(page),data=validateRecording(stored.last);expect(stored.pbIsLast).toBe(true);expect(data.size).toBe(size);expect(data.events.filter(e=>e.type==='turn')).toHaveLength(2);
 expect(data.events.filter(e=>e.type==='key').map(e=>e.code)).toContain('KeyK');data.initial.view.rotation.forEach((v,i)=>expect(v).toBeCloseTo(actualView[i],10));expect(isSolved(recordingFrame(data,data.duration).state)).toBe(true);
 await page.reload();await ready(page);expect((await snapshot(page)).recordings.pb.ms).toBe(data.solveMs);
 const before=await snapshot(page);await page.locator('#settings').click();await page.locator('#open-recordings').click();await expect(page.locator('#watch-recording')).toBeVisible();
 const download=page.waitForEvent('download');await page.locator('#recording-export').click();await page.locator('#share-json').click();expect((await download).suggestedFilename()).toContain('.ftoreplay.json');await page.locator('#close-share').click();
 await page.locator('#recording-import').setInputFiles({name:'shared.ftoreplay.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await expect(page.locator('#recording-title')).toContainText(`${size} × ${size}`);
 await page.locator('#watch-recording').click();await expect(page.locator('#home-replay-view canvas')).toBeVisible();
 const duration=(await snapshot(page)).replay.duration;await page.locator('#home-replay-progress').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},duration);await expect(page.locator('#timer-value')).toHaveText(formatTime(data.solveMs));
 await page.locator('#home-replay-exit').click();expect(signature((await snapshot(page)).state)).toBe(signature(before.state));expect((await snapshot(page)).timer.completed).toBe(before.timer.completed);
});

test('checkpoint editor uses an orbitable 3D puzzle, selects full pieces and keeps earlier goals cumulative',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/');await ready(page);await page.locator('#settings').click();await page.locator('#configure-splits').click();await page.locator('#split-method').selectOption('custom');await page.locator('#method-name').fill('Test method');
 await expect(page.getByLabel('Phase 1 detection',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Select pieces (0)'}).click();
 const canvas=page.locator('#phase-pattern-view canvas');await expect(canvas).toBeVisible();const box=await canvas.boundingBox();
 // Clicking the center hits the surface; dragging must orbit without selecting.
 await canvas.click({position:{x:box.width/2,y:box.height/2}});await expect(page.locator('#pattern-count')).not.toContainText('0 stickers');
 const selected=await page.locator('#pattern-count').textContent();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+40,{steps:8});await page.mouse.up();await expect(page.locator('#pattern-count')).toHaveText(selected);
 await page.locator('#phase-pattern-dialog').screenshot({path:'test-results/phase-picker-3d.png'});
 await page.locator('#close-phase-pattern').click();await page.locator('#phase-add').click();await page.locator('#phase-rows > div').nth(1).getByRole('button',{name:'Select pieces (0)'}).click();await expect(page.locator('#pattern-count')).toHaveText(selected);
 await page.locator('#pattern-clear').click();await expect(page.locator('#pattern-count')).toHaveText(selected);await page.locator('#close-phase-pattern').click();await page.locator('#save-splits').click();await page.locator('#close-splits').click();await page.locator('#close-settings').click();
 const profile=(await snapshot(page)).splits.profile;expect(profile.method).toBe('custom');expect(profile.phases[1].stickers).toEqual(profile.phases[0].stickers);await expect(page.locator('.splits-panel')).toBeVisible();
 await page.locator('#settings').click();await page.locator('#configure-splits').click();await page.locator('#split-method').selectOption('off');await page.locator('#close-splits').click();await page.locator('#close-settings').click();await expect(page.locator('.splits-panel')).toBeHidden();
});

test('a newly scrambled solve is recorded automatically through the real scramble and input flow',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/');await ready(page);
 await page.locator('#puzzles').click();await page.locator('[data-size="2"]').click();
 await page.locator('#settings').click();await page.locator('#animate').uncheck();await page.locator('#animate-scrambling').uncheck();await page.locator('#follow').uncheck();await page.locator('#close-settings').click();
 await page.locator('#mobile-scramble').click();await page.locator('#confirm-accept').click();await expect.poll(async()=>(await snapshot(page)).timer.status).toBe('ready');
 const scrambled=await snapshot(page);expect(scrambled.recordings.recording).toBe(true);
 const keys={U:['KeyJ','KeyF'],R:['KeyI','KeyK'],F:['KeyH','KeyG'],BR:['KeyO','KeyL'],L:['KeyD','KeyE'],B:['KeyU','KeyR'],BL:['KeyS','KeyW'],D:['KeyA','Semicolon']};
 for(const move of scrambled.history.toReversed())await page.keyboard.press(keys[move.name][move.dir===1?1:0]);
 await expect.poll(async()=>(await snapshot(page)).timer.status).toBe('finished');
 const saved=await records(page),data=validateRecording(saved.last);expect(saved.pbIsLast).toBe(true);expect(data.initial.scramble).toEqual(scrambled.history);expect(data.events.some(e=>e.type==='key')).toBe(true);expect(isSolved(recordingFrame(data,data.duration).state)).toBe(true);
 await page.locator('#settings').click();await page.locator('#open-recordings').click();await expect(page.locator('#watch-recording')).toBeVisible();await page.locator('#watch-recording').click();await page.locator('.solve-layout').screenshot({path:'test-results/solve-recording-player.png'});
});
