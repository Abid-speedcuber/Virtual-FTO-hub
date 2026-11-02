import {installKeyboard} from './keyboard-fixture.js';
import {test,expect} from '@playwright/test';
import {withSettings,scramble,confirmAction} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().timer);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const freeze=async page=>page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
const click=async(page,id)=>page.locator(id).evaluate(el=>el.click());
async function manualInstant(page){await withSettings(page,()=>page.locator('#animate').uncheck());}
async function setSize(page,size){await page.locator('#settings').evaluate(el=>el.click());await page.locator('#size').evaluate((el,size)=>{el.value=size;el.dispatchEvent(new Event('change',{bubbles:true}));},String(size));await click(page,'#close-settings');}
test.beforeEach(async({page})=>{await installKeyboard(page);await page.clock.install();await page.goto('/');await ready(page);});
test('square occupies min(width,height); controls and side panel use their intended corners',async({page})=>{
 await page.setViewportSize({width:1360,height:720});
 const square=await page.locator('#viewport').boundingBox(),settings=await page.locator('#settings').boundingBox(),undo=await page.locator('.history-tools').boundingBox(),scrambleButton=await page.locator('.puzzle-actions').boundingBox(),panel=await page.locator('#solve-panel').boundingBox();
 expect(square).toEqual({x:0,y:0,width:720,height:720});expect(settings.x+settings.width).toBeGreaterThan(1330);expect(settings.y).toBeLessThan(20);expect(undo.x+undo.width).toBe(708);expect(scrambleButton.x+scrambleButton.width).toBe(708);expect(scrambleButton.y+scrambleButton.height).toBe(708);expect(panel.x).toBe(720);
 await withSettings(page,()=>page.locator('#show-keyboard').check());await page.screenshot({path:'test-results/square-side-panel.png'});
 await page.setViewportSize({width:390,height:844});const mobileSquare=await page.locator('#viewport').boundingBox(),mobileUndo=await page.locator('.history-tools').boundingBox(),mobileSettings=await page.locator('#settings').boundingBox();
 expect(mobileSquare.width).toBe(390);expect(mobileSquare.height).toBe(390);expect(mobileUndo.y).toBeGreaterThan(mobileSettings.y+mobileSettings.height);expect((await page.locator('#solve-panel').boundingBox()).y).toBeGreaterThanOrEqual(390);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'test-results/square-side-panel-mobile.png'});
});
test('scramble confirmation protects progress and free play never starts the timer',async({page})=>{
 await manualInstant(page);await page.keyboard.press('KeyF');const before=await snap(page);expect(before.timer.status).toBe('idle');
 await confirmAction(page,()=>page.locator('#scramble').click(),false);const after=await snap(page);expect(after.state).toEqual(before.state);expect(after.history).toEqual(before.history);expect(after.timer.status).toBe('idle');
 await scramble(page);const prepared=await snap(page);expect(prepared.timer.status).toBe('ready');expect(prepared.timer.elapsedMs).toBe(0);expect(prepared.busy).toBe(false);expect(prepared.history).toHaveLength(50);expect(prepared.solved).toBe(false);
});
test('timer starts only on an accepted turn, pauses while away, and resumes after reload',async({page})=>{
 await manualInstant(page);await scramble(page);await freeze(page);await page.clock.runFor(2000);expect((await snap(page)).timer).toMatchObject({status:'ready',elapsedMs:0});
 await page.keyboard.press('Digit3');await page.keyboard.press('KeyQ');expect((await snap(page)).keyboard.pending).toBe(3);expect((await snap(page)).timer.status).toBe('ready');
 await page.keyboard.press('KeyF');expect((await snap(page)).keyboard.pending).toBe(null);await page.clock.runFor(1250);expect((await snap(page)).timer).toMatchObject({status:'running',elapsedMs:1250});
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.clock.runFor(10000);expect((await snap(page)).timer).toMatchObject({status:'paused',elapsedMs:1250});
 await page.reload();await ready(page);expect((await snap(page)).timer).toMatchObject({status:'running',elapsedMs:1250});await page.clock.runFor(500);expect((await snap(page)).timer.elapsedMs).toBe(1750);
});
test('finishing records a per-size PB; reset preserves it and a faster attempt improves it',async({page})=>{
 await manualInstant(page);await scramble(page);await freeze(page);
 const finishWithMoves=async duration=>{
  await click(page,'#settings');await page.locator('#follow').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});await click(page,'#close-settings');await page.clock.runFor(20);
  const sequence=(await snap(page)).history.slice().reverse();
  const send=async moves=>page.evaluate(moves=>{
   const faces=[[1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]],keys=['U','R','F','J','L','B','K','D'];
   const event=(type,code,shiftKey=false,altKey=false)=>document.body.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true,shiftKey,altKey}));
   for(const move of moves){
    const digit=`Digit${move.depth??1}`,code=`Key${keys[faces.findIndex(n=>n.every((v,i)=>v===move.normal[i]))]}`,reverse=move.dir===1;
    event('keydown',digit);event('keyup',digit);event('keydown','ShiftLeft',true);
    if(reverse)event('keydown','AltLeft',true,true);event('keydown',code,true,reverse);event('keyup',code,true,reverse);
    if(reverse)event('keyup','AltLeft',true,false);event('keyup','ShiftLeft');
   }
  },moves);
  await send(sequence.slice(0,1));await page.clock.runFor(duration);await send(sequence.slice(1));
 };
 await finishWithMoves(2500);expect((await snap(page)).timer).toMatchObject({status:'finished',bestMs:2500,completed:1});await expect(page.locator('#solve-times li')).toHaveCount(1);await expect(page.locator('#solve-times li time')).toHaveText('2.50');await page.reload();await ready(page);expect((await snap(page)).timer.bestMs).toBe(2500);
 await setSize(page,3);expect((await snap(page)).timer.bestMs).toBe(null);await setSize(page,4);expect((await snap(page)).timer.bestMs).toBe(2500);
 await confirmAction(page,()=>click(page,'#freeplay-reset'));expect((await snap(page)).timer).toMatchObject({status:'idle',bestMs:2500});
 await confirmAction(page,()=>click(page,'#scramble'));await finishWithMoves(2000);expect((await snap(page)).timer).toMatchObject({status:'finished',bestMs:2000,completed:2,newBest:true});await expect(page.locator('#solve-times li')).toHaveCount(2);await expect(page.locator('#solve-times li time').first()).toHaveText('2.00');
});
test('animated scrambling is independent, blocks turns, and restores an interrupted sequence',async({page})=>{
 test.setTimeout(60000);
 await withSettings(page,async()=>{await page.locator('#animate').uncheck();await page.locator('#animate-scrambling').check();});await freeze(page);
 await confirmAction(page,()=>click(page,'#scramble'));let state=await snap(page);expect(state.timer.status).toBe('scrambling');expect(state.busy).toBe(true);expect(state.queued).toBeGreaterThan(0);
 await page.keyboard.press('KeyF');expect((await snap(page)).keyboard.stats.total).toBe(0);await page.clock.runFor(90);expect((await snap(page)).history.length).toBeGreaterThan(0);
 await page.reload();await ready(page);expect((await snap(page)).timer.status).toBe('scrambling');await page.clock.runFor(5000);state=await snap(page);expect(state.history).toHaveLength(50);expect(state.queued).toBe(0);expect(state.busy).toBe(false);expect(state.timer).toMatchObject({status:'ready',elapsedMs:0});
 await click(page,'#settings');expect(await page.locator('#animate-scrambling').isChecked()).toBe(true);await click(page,'#close-settings');
});
test('reload preserves a manual turn interrupted in mid-animation',async({page})=>{
 await freeze(page);await page.keyboard.press('KeyF');expect((await snap(page)).busy).toBe(true);await page.reload();await ready(page);await page.clock.runFor(300);expect((await snap(page)).history).toHaveLength(1);expect((await snap(page)).timer.status).toBe('idle');
});

test('redo can be queued while its preceding undo is still animating',async({page})=>{
 await manualInstant(page);await page.keyboard.press('KeyF');await withSettings(page,()=>page.locator('#animate').check());await freeze(page);
 await page.keyboard.press('Control+z');await page.keyboard.press('Control+Shift+z');await page.clock.runFor(400);
 expect((await snap(page)).history).toHaveLength(1);expect((await snap(page)).redo).toHaveLength(0);expect((await snap(page)).solved).toBe(false);
});

test('Reset beside Scramble clears a timed solve and pending turns into saved free play',async({page})=>{
 await scramble(page);await freeze(page);await page.keyboard.press('KeyF');await page.keyboard.press('KeyR');
 expect((await snap(page)).timer.status).toBe('running');
 const scrambleBox=await page.locator('#scramble').boundingBox(),resetBox=await page.locator('#freeplay-reset').boundingBox();expect(resetBox.x).toBeGreaterThan(scrambleBox.x+scrambleBox.width);
 await confirmAction(page,()=>page.locator('#freeplay-reset').click());await page.clock.runFor(500);
 expect(await snap(page)).toMatchObject({solved:true,history:[],redo:[],undoFloor:0,queued:0,busy:false,timer:{status:'idle',elapsedMs:0}});
 await page.reload();await ready(page);expect((await snap(page)).timer.status).toBe('idle');expect((await snap(page)).solved).toBe(true);
 await page.keyboard.press('KeyF');await page.clock.runFor(300);expect((await snap(page)).timer.status).toBe('idle');
});

test('paused timer immediately hides every sticker color, including during animation, and resume restores them',async({page})=>{
 await scramble(page);await freeze(page);const colors=(await snap(page)).stickerColors;expect(new Set(colors).size).toBe(8);
 await page.keyboard.press('KeyF');await page.clock.runFor(32);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 let paused=await snap(page);expect(paused.timer.status).toBe('paused');expect(paused.stickerColors).toEqual(Array(8).fill('888888'));
 const elapsed=paused.timer.elapsedMs;await page.clock.runFor(2000);paused=await snap(page);expect(paused.timer.elapsedMs).toBe(elapsed);expect(paused.stickerColors).toEqual(Array(8).fill('888888'));
 await page.screenshot({path:'test-results/paused-gray.png'});
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect((await snap(page)).timer.status).toBe('running');expect((await snap(page)).stickerColors).toEqual(colors);
 await page.clock.runFor(500);expect((await snap(page)).timer.elapsedMs).toBe(elapsed+500);
});
