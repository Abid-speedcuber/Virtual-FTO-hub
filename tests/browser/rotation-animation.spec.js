import {test,expect} from '@playwright/test';
import {withSettings} from './helpers.js';
import {solvedState,applyMove,signature} from '../../src/puzzle.js';
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const angle=(a,b)=>2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))));
const freeze=async page=>page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
async function setup(page,size=3){await page.clock.install();await page.goto('/');await ready(page);await page.locator('#size').selectOption(String(size));await withSettings(page,()=>page.locator('#animate').check());await freeze(page);}
test('120-degree rotations show intermediate poses, finish exactly, and leave state/TPS/suffix untouched',async({page})=>{
 await setup(page,20);await page.keyboard.press('Digit6');const before=await snap(page);await page.keyboard.press('Backquote');const started=await snap(page);expect(started.rotating).toBe(true);expect(angle(before.orbit,started.orbit)).toBeCloseTo(2*Math.PI/3,7);expect(angle(before.viewOrbit,started.viewOrbit)).toBeLessThan(.001);
 await page.clock.runFor(64);const middle=await snap(page);expect(middle.rotating).toBe(true);expect(angle(before.viewOrbit,middle.viewOrbit)).toBeGreaterThan(.1);expect(angle(middle.viewOrbit,middle.orbit)).toBeGreaterThan(.1);expect(middle.state).toEqual(before.state);expect(middle.timer.status).toBe('idle');expect(middle.keyboard.stats.total).toBe(0);expect(middle.keyboard.pending).toBe(6);await page.screenshot({path:'test-results/rotation-midpoint.png'});
 await page.clock.runFor(200);const end=await snap(page);expect(end.rotating).toBe(false);expect(angle(end.viewOrbit,end.orbit)).toBeLessThan(.000001);expect(end.orbit).toEqual(started.orbit);
});
test('csTimer 90-degree vertex rotations animate and Animate turns off restores immediate rotation',async({page})=>{
 await setup(page);await withSettings(page,async()=>{await page.locator('#edit-keyboard').click();await page.locator('#keyboard-reset-cstimer').click();await page.locator('#close-keyboard').click();});const before=await snap(page);await page.keyboard.press('KeyP');expect(angle(before.orbit,(await snap(page)).orbit)).toBeCloseTo(Math.PI/2,7);await page.clock.runFor(64);let state=await snap(page);expect(state.rotating).toBe(true);expect(angle(before.viewOrbit,state.viewOrbit)).toBeGreaterThan(.1);expect(angle(state.viewOrbit,state.orbit)).toBeGreaterThan(.1);await page.clock.runFor(200);expect((await snap(page)).rotating).toBe(false);
 await withSettings(page,()=>page.locator('#animate').uncheck());await page.keyboard.press('KeyQ');state=await snap(page);expect(state.rotating).toBe(false);expect(angle(state.viewOrbit,state.orbit)).toBeLessThan(.000001);expect(angle(before.orbit,state.orbit)).toBeLessThan(.000001);
});
test('rotation bursts catch up without a backlog and a following move uses the final logical hold',async({page})=>{
 await setup(page);await page.evaluate(()=>{for(let i=0;i<100;i++)for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'Backquote',bubbles:true}));});await page.clock.runFor(16);const rotated=await snap(page);expect(rotated.rotating).toBe(false);expect(angle(rotated.viewOrbit,rotated.orbit)).toBeLessThan(.000001);expect(rotated.history).toHaveLength(0);expect(rotated.queued).toBe(0);expect(rotated.keyboard.stats.total).toBe(0);
 await page.clock.runFor(500);await page.keyboard.press('Backquote');expect((await snap(page)).rotating).toBe(true);const target=await snap(page);await page.keyboard.press('KeyF');await page.clock.runFor(300);const after=await snap(page);expect(after.history).toHaveLength(1);const normal=target.frame.slice(0,3);expect(signature(after.state)).toBe(signature(applyMove(solvedState(3),{normal,layer:'outer',dir:-1})));expect(after.rotating).toBe(false);expect(after.busy).toBe(false);expect(after.keyboard.stats.total).toBe(1);
});
test('switching size and reloading park the final view, without a stale rotation animation',async({page})=>{
 await setup(page);await page.keyboard.press('Backquote');await page.clock.runFor(48);const target=await snap(page);expect(target.rotating).toBe(true);await page.locator('#size').selectOption('4');expect((await snap(page)).rotating).toBe(false);const four=await snap(page);await page.clock.runFor(300);expect((await snap(page)).orbit).toEqual(four.orbit);await page.locator('#size').selectOption('3');let restored=await snap(page);expect(restored.rotating).toBe(false);expect(restored.orbit).toEqual(target.orbit);await page.keyboard.press('Backquote');const nextTarget=(await snap(page)).orbit;await page.reload();await ready(page);restored=await snap(page);expect(restored.rotating).toBe(false);restored.orbit.forEach((v,i)=>expect(v).toBeCloseTo(nextTarget[i],9));expect(angle(restored.viewOrbit,restored.orbit)).toBeLessThan(.000001);
});

test('grabbing the puzzle interrupts the tween at the displayed pose and hands control to the pointer',async({page})=>{
 await setup(page);await page.keyboard.press('Backquote');await page.clock.runFor(48);const visible=await snap(page);expect(visible.rotating).toBe(true);const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.width/2,box.height/2);await page.mouse.down({button:'right'});const grabbed=await snap(page);expect(grabbed.rotating).toBe(false);expect(angle(grabbed.orbit,visible.viewOrbit)).toBeLessThan(.000001);await page.mouse.move(box.width/2+50,box.height/2+20);await page.mouse.up({button:'right'});await page.clock.runFor(32);const dragged=await snap(page);expect(dragged.rotating).toBe(false);expect(angle(dragged.viewOrbit,dragged.orbit)).toBeLessThan(.000001);expect(dragged.history).toHaveLength(0);
});

test('continuous input faster than display refresh keeps the visible rotation catching up',async({page})=>{
 await setup(page);await withSettings(page,()=>page.locator('#disable-sounds').check());
 await page.evaluate(()=>{window.rotations=setInterval(()=>{for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{code:'Backquote',bubbles:true}));},1);});
 await page.clock.runFor(32);const first=await snap(page);await page.clock.runFor(16);const second=await snap(page);expect(angle(first.viewOrbit,second.viewOrbit)).toBeGreaterThan(1);await page.evaluate(()=>clearInterval(window.rotations));await page.clock.runFor(32);const end=await snap(page);expect(end.rotating).toBe(false);expect(angle(end.viewOrbit,end.orbit)).toBeLessThan(.000001);expect(end.history).toHaveLength(0);expect(end.queued).toBe(0);
});
