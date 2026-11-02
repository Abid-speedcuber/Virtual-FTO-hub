import {test,expect} from '@playwright/test';
import {withSettings} from './helpers.js';
import {FACES,solvedState,applyMove,signature} from '../../src/puzzle.js';
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const move=(face,dir,depth=1,count=1)=>({normal:FACES.find(f=>f.name===face).normal,layer:'slice',depth,count,dir});
const expected=moves=>signature(moves.reduce(applyMove,solvedState(4)));
test.beforeEach(async({page})=>{
 await page.clock.install();await page.goto('/');await ready(page);
 await withSettings(page,async()=>{await page.locator('#animate').check();await page.locator('#follow').uncheck();await page.locator('#disable-sounds').check();});
 await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
});

test('nonparallel requests snap earlier turns and give the newest turn its full normal animation',async({page})=>{
 await page.keyboard.press('KeyF');await page.clock.runFor(40);await page.keyboard.press('KeyI');
 let current=await snap(page);expect(current.history).toHaveLength(1);expect(current.animating).toHaveLength(1);expect(current.animating[0].move.name).toBe('R');expect(current.animating[0].progress).toBeLessThan(.05);expect(current.animationMs).toBe(145);expect(current.queued).toBe(0);
 expect(signature(current.state)).toBe(expected([move('U',-1)]));
 await page.clock.runFor(40);await page.keyboard.press('KeyH');current=await snap(page);
 expect(current.history).toHaveLength(2);expect(current.animating).toHaveLength(1);expect(current.animating[0].move.name).toBe('F');expect(current.animating[0].progress).toBeLessThan(.05);
 await page.clock.runFor(160);current=await snap(page);expect(current.busy).toBe(false);expect(current.history).toHaveLength(3);expect(signature(current.state)).toBe(expected([move('U',-1),move('R',1),move('F',1)]));
});

test('parallel slices, overlapping wides, and opposite faces overlap until a different axis snaps the whole group',async({page})=>{
 await page.keyboard.press('KeyF');await page.clock.runFor(40);await page.keyboard.press('Shift+KeyF');
 let current=await snap(page);expect(current.history).toHaveLength(0);expect(current.animating).toHaveLength(2);expect(current.animating[0].progress).toBeGreaterThan(.25);expect(current.animating[1].progress).toBeLessThan(.05);
 await page.clock.runFor(40);await page.keyboard.press('Digit2');await page.keyboard.press('KeyF');await page.keyboard.press('KeyA');
 current=await snap(page);expect(current.history).toHaveLength(0);expect(current.animating).toHaveLength(4);expect(current.animating[0].progress).toBeGreaterThan(.5);expect(current.queued).toBe(0);
 await page.clock.runFor(16);await page.screenshot({path:'test-results/parallel-turns.png'});
 await page.keyboard.press('KeyI');current=await snap(page);expect(current.history).toHaveLength(4);expect(current.animating).toHaveLength(1);expect(current.animating[0].move.name).toBe('R');expect(current.animating[0].progress).toBeLessThan(.05);
 await page.clock.runFor(160);current=await snap(page);expect(current.busy).toBe(false);expect(signature(current.state)).toBe(expected([move('U',-1),move('U',-1,2),move('U',-1,1,2),move('D',1),move('R',1)]));
});

test('the earlier parallel turn completes independently; undo and reload retain the remaining input order',async({page})=>{
 await page.keyboard.press('KeyF');await page.clock.runFor(40);await page.keyboard.press('KeyF');await page.clock.runFor(112);
 let current=await snap(page);expect(current.history).toHaveLength(1);expect(current.animating).toHaveLength(1);expect(current.animating[0].progress).toBeGreaterThan(.7);
 await page.keyboard.press('Control+z');current=await snap(page);expect(current.animating).toHaveLength(2);
 await page.reload();await ready(page);await page.clock.runFor(350);current=await snap(page);
 expect(current.busy).toBe(false);expect(current.queued).toBe(0);expect(current.history).toHaveLength(1);expect(current.redo).toHaveLength(1);expect(signature(current.state)).toBe(expected([move('U',-1)]));
});
