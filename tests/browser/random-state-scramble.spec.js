import {test,expect} from '@playwright/test';
import {confirmAction,withSettings} from './helpers.js';
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
async function scramble(page){if((await snapshot(page)).timer.status==='running')await page.locator('#mobile-pause').click();await confirmAction(page,()=>page.locator('#mobile-scramble').click());await expect.poll(async()=>(await snapshot(page)).generatingScramble,{timeout:20000}).toBe(false);}

test('3x3 uses csTimer outer-turn scrambles, arms after generation, and preserves the attempt on reload',async({page})=>{
 await page.goto('/');await ready(page);
 await withSettings(page,async()=>{await page.locator('#animate-scrambling').uncheck();await page.locator('#animate').uncheck();});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await scramble(page);
 const first=await snapshot(page);expect(first.timer.status).toBe('ready');expect(first.solved).toBe(false);
 expect(first.history.length).toBeGreaterThan(1);expect(first.history.length).toBeLessThan(50);expect(first.undoFloor).toBe(first.history.length);
 expect(first.history.every(m=>m.layer==='slice'&&m.depth===1&&m.count===1)).toBe(true);
 await page.reload();await ready(page);expect((await snapshot(page)).history).toEqual(first.history);expect((await snapshot(page)).timer.status).toBe('ready');
 await page.keyboard.press('KeyF');expect((await snapshot(page)).timer.status).toBe('running');
 await scramble(page);const second=await snapshot(page);expect(second.timer.status).toBe('ready');expect(second.history).not.toEqual(first.history);expect(second.keyboard.stats.total).toBe(1);
 expect(errors).toEqual([]);
});

test('animated random-state scrambling reaches ready only after the complete sequence',async({page})=>{
 await page.goto('/');await ready(page);
 await withSettings(page,async()=>{await page.locator('#animation-speed').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});});
 await scramble(page);await expect.poll(async()=>(await snapshot(page)).timer.status,{timeout:20000}).toBe('ready');
 const saved=await snapshot(page);expect(saved.solved).toBe(false);expect(saved.history.length).toBeGreaterThan(1);expect(saved.undoFloor).toBe(saved.history.length);expect(saved.queued).toBe(0);expect(saved.busy).toBe(false);
 expect(saved.history.every(m=>m.depth===1)).toBe(true);
});

test('switching puzzles cancels the wait but retains the background scramble for later',async({page})=>{
 // Hold the worker response until after switching to exercise the async boundary.
 const workerCreated=page.waitForEvent('worker');
 await page.route('**/worker.js*',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{};'}));
 await page.goto('/');await ready(page);const worker=await workerCreated;
 await withSettings(page,()=>page.locator('#animate-scrambling').uncheck());
 await confirmAction(page,()=>page.locator('#mobile-scramble').click());expect((await snapshot(page)).generatingScramble).toBe(true);
 await expect(page.locator('#mobile-scramble')).toBeDisabled();
 await page.locator('#puzzles').click();await page.locator('[data-size="4"]').click();
 expect((await snapshot(page)).generatingScramble).toBe(false);expect((await snapshot(page)).solved).toBe(true);
 await scramble(page);const result=await snapshot(page);expect(result.size).toBe(4);expect(result.history).toHaveLength(50);expect(result.timer.status).toBe('ready');
 await worker.evaluate(()=>self.postMessage({scramble:'U F'}));
 await expect.poll(async()=>(await snapshot(page)).scramblePool.ready).toBe(true);
 expect((await snapshot(page)).history).toEqual(result.history);
 await page.locator('#puzzles').click();await page.locator('[data-size="3"]').click();
 expect((await snapshot(page)).solved).toBe(true);expect((await snapshot(page)).timer.status).toBe('idle');
 await scramble(page);expect((await snapshot(page)).timer.status).toBe('ready');expect((await snapshot(page)).history).toHaveLength(2);
});

test('worker failure keeps the current puzzle and lets the user retry',async({page})=>{
 await page.route('**/worker.js*',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>self.postMessage({error:"Test failure"});'}));
 await page.goto('/');await ready(page);await withSettings(page,()=>page.locator('#animate').uncheck());
 await page.keyboard.press('KeyF');const before=await snapshot(page);
 await scramble(page);await expect(page.locator('#scramble-error')).toBeVisible();const after=await snapshot(page);
 expect(after.state).toEqual(before.state);expect(after.history).toEqual(before.history);await expect(page.locator('#scramble')).toBeEnabled();
});


test('prepares before the first click and consumes cached scrambles without waiting for the refill',async({page})=>{
 const workerCreated=page.waitForEvent('worker');
 await page.route('**/worker.js*',route=>route.fulfill({contentType:'text/javascript',body:'self.onmessage=()=>{};'}));
 await page.goto('/');await ready(page);const worker=await workerCreated;
 expect((await snapshot(page)).scramblePool).toEqual({ready:false,generating:true});
 await worker.evaluate(()=>self.postMessage({scramble:'U F'}));
 await expect.poll(async()=>(await snapshot(page)).scramblePool.ready).toBe(true);
 await withSettings(page,()=>page.locator('#animate-scrambling').uncheck());
 await confirmAction(page,()=>page.locator('#mobile-scramble').click());
 const first=await snapshot(page);expect(first.timer.status).toBe('ready');expect(first.generatingScramble).toBe(false);expect(first.history).toHaveLength(2);
 // The replacement worker response is deliberately withheld: it must not block.
 expect(first.scramblePool).toEqual({ready:false,generating:true});
 await worker.evaluate(()=>self.postMessage({scramble:"R L' B"}));
 await expect.poll(async()=>(await snapshot(page)).scramblePool.ready).toBe(true);
 await confirmAction(page,()=>page.locator('#mobile-scramble').click());
 const second=await snapshot(page);expect(second.timer.status).toBe('ready');expect(second.generatingScramble).toBe(false);expect(second.history).toHaveLength(3);
 expect(second.scramblePool).toEqual({ready:false,generating:true});
});
