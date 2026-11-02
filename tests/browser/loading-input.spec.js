import {installKeyboard} from './keyboard-fixture.js';
import {test,expect} from '@playwright/test';
import {withSettings,scramble} from './helpers.js';
import {solvedState,applyMove,signature} from '../../src/puzzle.js';
test.beforeEach(async({page})=>{await installKeyboard(page);});
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const freeze=async page=>page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
const setSize=async(page,size)=>page.locator('#size').evaluate((el,size)=>{el.value=String(size);el.dispatchEvent(new Event('change',{bubbles:true}));},size);
test('nothing paints before the puzzle renders, including while the main script is delayed',async({page})=>{
 let release;const blocked=new Promise(resolve=>release=resolve);
 await page.addInitScript(()=>{
  window.sceneDraws=0;
  for(const name of ['drawArrays','drawElements']){
   const original=WebGL2RenderingContext.prototype[name];WebGL2RenderingContext.prototype[name]=function(...args){window.sceneDraws++;return original.apply(this,args);};
  }
 });
 await page.route(/\/src\/main\.js(?:\?.*)?$/,async route=>{await blocked;await route.continue();});
 await page.goto('/',{waitUntil:'commit'});await page.locator('#settings').waitFor({state:'attached'});
 await expect(page.locator('#settings')).toBeHidden();await expect(page.locator('#scramble')).toBeHidden();await expect(page.locator('#timer-value')).toBeHidden();expect(await page.evaluate(()=>getComputedStyle(document.body).visibility)).toBe('hidden');
 await page.screenshot({path:'test-results/blank-before-scene.png'});release();await ready(page);
 await expect(page.locator('#settings')).toBeVisible();expect(await page.evaluate(()=>window.sceneDraws)).toBeGreaterThan(0);await page.screenshot({path:'test-results/first-complete-frame.png'});
});
test('a burst snaps nonparallel turns and leaves only the newest normal-speed animation',async({page})=>{
 await page.clock.install();await page.goto('/');await ready(page);await freeze(page);
 const initial=await snap(page);await page.keyboard.press('KeyF');await page.clock.runFor(40);await page.keyboard.press('KeyR');expect((await snap(page)).animationMs).toBe(145);
 await page.clock.runFor(16);expect((await snap(page)).queued).toBe(0);expect((await snap(page)).busy).toBe(true);expect((await snap(page)).history).toHaveLength(1);
 const codes=['KeyU','KeyR','KeyF','KeyJ','KeyL','KeyB','KeyK','KeyD'];
 await page.evaluate(codes=>{for(let i=0;i<120;i++)for(const type of ['keydown','keyup'])document.body.dispatchEvent(new KeyboardEvent(type,{code:codes[i%codes.length],bubbles:true,cancelable:true}));},codes);
 expect((await snap(page)).queued).toBe(0);expect((await snap(page)).animating).toHaveLength(1);await page.clock.runFor(160);const after=await snap(page);expect(after.history).toHaveLength(122);expect(after.queued).toBe(0);expect(after.busy).toBe(false);expect(after.keyboard.stats.total).toBe(122);expect(after.renderedMoves).toBe(122);
 const moves=[2,1,...Array.from({length:120},(_,i)=>i%8)].map(i=>({normal:initial.frame.slice(i*3,i*3+3),layer:'outer',dir:1}));expect(signature(after.state)).toBe(signature(moves.reduce(applyMove,solvedState())));
 await page.clock.runFor(500);await page.keyboard.press('KeyF');expect((await snap(page)).animationMs).toBe(145);
});
test('undo stops at the generated scramble, including rapid excess undo and reload',async({page})=>{
 await page.goto('/');await ready(page);await withSettings(page,()=>page.locator('#animate').uncheck());await scramble(page);
 const base=await snap(page);expect(base.undoFloor).toBe(50);await expect(page.locator('#undo')).toBeDisabled();
 await page.keyboard.press('Control+z');expect(signature((await snap(page)).state)).toBe(signature(base.state));expect((await snap(page)).timer.status).toBe('ready');
 await page.keyboard.press('KeyF');const first=await snap(page);await page.keyboard.press('KeyR');await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');
 for(let i=0;i<5;i++)await page.keyboard.press('Control+z');const restored=await snap(page);expect(signature(restored.state)).toBe(signature(base.state));expect(restored.history).toHaveLength(50);expect(restored.redo).toHaveLength(2);await expect(page.locator('#undo')).toBeDisabled();
 await page.reload();await ready(page);await page.keyboard.press('Control+z');expect(signature((await snap(page)).state)).toBe(signature(base.state));await page.keyboard.press('Control+Shift+z');expect(signature((await snap(page)).state)).toBe(signature(first.state));
});
test('switching sizes parks state, redo, view, and timer, even across reload',async({page})=>{
 await page.clock.install();await page.goto('/');await ready(page);await withSettings(page,()=>page.locator('#animate').uncheck());await scramble(page);await freeze(page);
 await page.keyboard.press('KeyF');await page.keyboard.press('KeyR');await page.keyboard.press('Control+z');
 const box=await page.locator('canvas').boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down({button:'right'});await page.mouse.move(box.x+box.width*.5+60,box.y+box.height*.5+25);await page.mouse.up({button:'right'});await page.clock.runFor(20);const four=await snap(page);
 await setSize(page,7);await page.keyboard.press('KeyU');const seven=await snap(page);await page.clock.runFor(10000);await page.reload();await ready(page);await setSize(page,4);const restored=await snap(page);
 expect(signature(restored.state)).toBe(signature(four.state));expect(restored.history).toEqual(four.history);expect(restored.redo).toEqual(four.redo);expect(restored.undoFloor).toBe(50);expect(restored.timer.elapsedMs).toBe(four.timer.elapsedMs);
 restored.camera.forEach((v,i)=>expect(v).toBeCloseTo(four.camera[i],9));await setSize(page,7);expect(signature((await snap(page)).state)).toBe(signature(seven.state));
});
test('switching away mid-animation preserves all accepted pending turns',async({page})=>{
 await page.clock.install();await page.goto('/');await ready(page);await freeze(page);const initial=await snap(page);
 for(const code of ['KeyF','KeyR','KeyU'])await page.keyboard.press(code);await setSize(page,7);expect((await snap(page)).history).toHaveLength(0);await setSize(page,4);await page.clock.runFor(160);
 const after=await snap(page);expect(after.history).toHaveLength(3);expect(after.queued).toBe(0);expect(after.busy).toBe(false);
 const moves=[2,1,0].map(i=>({normal:initial.frame.slice(i*3,i*3+3),layer:'outer',dir:1}));expect(signature(after.state)).toBe(signature(moves.reduce(applyMove,solvedState())));
});

test('legacy timed saves gain a scramble boundary without losing player progress',async({page})=>{
 await page.goto('/');await ready(page);await withSettings(page,()=>page.locator('#animate').uncheck());await scramble(page);const base=await snap(page);
 await page.keyboard.press('KeyF');await page.keyboard.press('KeyR');const progressed=await snap(page);
 const legacy=await page.evaluate(()=>JSON.parse(localStorage.getItem('master-fto-v1')));delete legacy.solves[4].undoFloor;
 await page.addInitScript(data=>{if(!sessionStorage.getItem('boundary-seeded')){localStorage.setItem('master-fto-v1',JSON.stringify(data));sessionStorage.setItem('boundary-seeded','yes');}},legacy);
 await page.reload();await ready(page);expect((await snap(page)).undoFloor).toBe(50);expect(signature((await snap(page)).state)).toBe(signature(progressed.state));
 await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');expect(signature((await snap(page)).state)).toBe(signature(base.state));
});
