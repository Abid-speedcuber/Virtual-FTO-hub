import {test,expect} from '@playwright/test';
import {withSettings} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const freeze=async page=>page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
async function point(page){const box=await page.locator('.face-label:not([hidden])').filter({hasText:/^F$/}).boundingBox();return {x:box.x+box.width/2+13,y:box.y+box.height/2+8};}
async function range(page,id,value){await page.locator(id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},String(value));}

test('3x3 is the fresh default, named sizes are available, and existing size choice persists',async({page})=>{
 await page.goto('/');await ready(page);expect((await snap(page)).size).toBe(3);expect((await snap(page)).state).toHaveLength(72);
 await page.locator('#puzzles').click();await expect(page.locator('[data-size="2"]')).toHaveText('Baby FTO (2x2)');await expect(page.locator('[data-size="4"]')).toHaveText('Master FTO (4x4)');
 await page.locator('[data-size="4"]').click();await page.reload();await ready(page);expect((await snap(page)).size).toBe(4);
});

test('all keyboard layouts have a small padded inset without side letterboxing',async({page})=>{
 await page.setViewportSize({width:1600,height:720});await page.goto('/');await ready(page);
 await withSettings(page,()=>page.locator('#show-keyboard').check());
 for(const layout of ['60','ansi','iso'])for(const numpad of layout==='60'?[false]:[false,true]){
  await page.locator('#settings').click();await page.locator('#edit-keyboard').click();await page.locator('#keyboard-layout').selectOption(layout);
  if(layout!=='60')await page.locator('#keyboard-numpad').setChecked(numpad);
  await page.locator('#close-keyboard').click();await page.locator('#close-settings').click();
  const bounds=await page.locator('#keyboard-overlay').evaluate(el=>{
   const box=el.getBoundingClientRect(),keys=[...el.querySelectorAll('.keycap')].map(key=>key.getBoundingClientRect());
   return {left:Math.min(...keys.map(k=>k.left))-box.left,right:box.right-Math.max(...keys.map(k=>k.right)),bottom:box.bottom,height:innerHeight,overflow:el.scrollHeight>el.clientHeight};
  });
  expect(bounds.left).toBeGreaterThanOrEqual(8);expect(bounds.left).toBeLessThan(13);expect(bounds.right).toBeGreaterThanOrEqual(8);expect(bounds.right).toBeLessThan(13);expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);expect(bounds.overflow).toBe(false);
 }
 await page.screenshot({path:'test-results/keyboard-no-side-gaps.png'});
});

test('outer bias and animation speed save; 2x playback completes a turn in half the time',async({page})=>{
 await page.clock.install();await page.goto('/');await ready(page);
 await withSettings(page,async()=>{await page.locator('#touch-turn-bias').click();await range(page,'#outer-turn-bias',85);await page.locator('#close-touch-bias').click();await range(page,'#animation-speed',2);});
 await page.reload();await ready(page);expect(await snap(page)).toMatchObject({outerTurnBias:85,animationSpeed:2,animationMs:72.5});
 await freeze(page);await page.keyboard.press('KeyF');expect((await snap(page)).busy).toBe(true);await page.clock.runFor(96);expect((await snap(page)).history).toHaveLength(1);expect((await snap(page)).busy).toBe(false);
});

for(const input of ['mouse','touch'])test(`${input} swipe starts before release and interrupts the previous animation`,async({page,context})=>{
 await page.clock.install();await page.goto('/');await ready(page);await freeze(page);const p=await point(page);
 const cdp=input==='touch'?await context.newCDPSession(page):null;
 const start=async()=>input==='mouse'?(await page.mouse.move(p.x,p.y),await page.mouse.down()):cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
 const move=async()=>input==='mouse'?page.mouse.move(p.x+28,p.y+4):cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+28,y:p.y+4,id:1}]});
 const end=async()=>input==='mouse'?page.mouse.up():cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await start();await move();let current=await snap(page);expect(current.busy).toBe(true);expect(current.animating).toHaveLength(1);expect(current.history).toHaveLength(0);
 await end();await start();await move();current=await snap(page);expect(current.history).toHaveLength(1);expect(current.animating).toHaveLength(1);expect(current.queued).toBe(0);expect(current.animating[0].progress).toBeLessThan(.05);
 await move();await end();expect((await snap(page)).history).toHaveLength(1);
 await page.reload();await ready(page);await page.clock.runFor(350);current=await snap(page);expect(current.history).toHaveLength(2);expect(current.busy).toBe(false);
});
