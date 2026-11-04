import {test,expect} from '@playwright/test';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
const snap=page=>page.evaluate(()=>window.fto.snapshot());
const buttons=page=>page.locator('#mobile-controls button:visible').evaluateAll(els=>els.sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(el=>el.getAttribute('aria-label')));
async function choose(page,size){await page.locator('#puzzles').click();await page.locator(`#puzzle-choices [data-size="${size}"]`).click();}

test('topbar puzzle icon opens a modal and preserves per-size progress',async({page})=>{
 await page.goto('/');await ready(page);await expect(page.locator('#size,.size-picker')).toHaveCount(0);
 expect(await page.locator('.topbar-actions button').evaluateAll(els=>els.map(el=>el.id))).toEqual(['puzzles','settings','about']);
 await page.locator('#puzzles').click();await expect(page.locator('#puzzle-dialog')).toBeVisible();await expect(page.locator('#puzzle-choices button')).toHaveCount(19);await expect(page.locator('[data-size="3"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-size="4"]').click();await expect(page.locator('#puzzle-dialog')).toBeHidden();expect((await snap(page)).size).toBe(4);
 await page.keyboard.press('KeyF');await page.waitForFunction(()=>!window.fto.snapshot().busy);await choose(page,3);expect((await snap(page)).history).toHaveLength(0);await choose(page,4);expect((await snap(page)).history).toHaveLength(1);
 await page.locator('#puzzles').screenshot({path:'test-results/puzzle-icon.png'});
 await page.locator('#puzzles').click();await page.locator('#puzzle-dialog').screenshot({path:'test-results/puzzle-selector.png'});await page.keyboard.press('Escape');
});

test('mobile bar follows freeplay, running, and paused states; buttons control the solve',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.clock.install();await page.goto('/');await ready(page);
 for(const selector of ['#solve-panel','.history-tools','.puzzle-actions'])await expect(page.locator(selector)).toBeHidden();expect(await buttons(page)).toEqual(['Reset','Scramble','History']);await expect(page.locator('#mobile-timer')).toBeHidden();
 await page.locator('#settings').click();await page.locator('#animate').uncheck();await page.locator('#animate-scrambling').uncheck();await page.locator('#close-settings').click();
 await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));
 await page.locator('#mobile-scramble').click();await page.locator('#confirm-accept').click();await expect.poll(async()=>(await snap(page)).timer.status).toBe('ready');
 await page.keyboard.press('KeyF');expect(await buttons(page)).toEqual(['Pause','Undo','Redo']);await expect(page.locator('#mobile-timer')).toBeVisible();
 await page.locator('#mobile-undo').click();await expect(page.locator('#mobile-redo')).toBeEnabled();await page.locator('#mobile-redo').click();
 await page.clock.runFor(1250);await expect(page.locator('#mobile-timer')).toHaveText('1.25');await page.locator('#mobile-pause').click();expect(await buttons(page)).toEqual(['Resume','Scramble','Reset','History']);expect((await snap(page)).timer.status).toBe('paused');
 await page.screenshot({path:'test-results/mobile-paused-controls.png'});
 await page.locator('#mobile-history').click();await expect(page.locator('#history-dialog')).toBeVisible();await page.locator('#close-history').click();expect((await snap(page)).timer.status).toBe('paused');
 await page.locator('#mobile-pause').click();expect((await snap(page)).timer.status).toBe('running');
 await page.locator('#mobile-pause').click();await page.locator('#mobile-reset').click();await page.locator('#confirm-accept').click();await expect.poll(async()=>(await snap(page)).timer.status).toBe('idle');expect(await buttons(page)).toEqual(['Reset','Scramble','History']);
 await page.screenshot({path:'test-results/mobile-freeplay-controls.png'});
});

test('history shows the selected puzzle times and PB; compact layout fits 320px and landscape',async({page})=>{
 await page.addInitScript(()=>{if(window.name==='history-seeded')return;window.name='history-seeded';localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[],redo:[],undoFloor:0,timer:{status:'paused',bestMs:1234,completed:2,times:[{ms:1234},{ms:2345}]}}}}));});
 await page.setViewportSize({width:320,height:700});await page.goto('/');await ready(page);expect(await buttons(page)).toEqual(['Resume','Scramble','Reset','History']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(700);
 await page.locator('#mobile-history').click();await expect(page.locator('#history-pb')).toHaveText('1.23');await expect(page.locator('#history-times li time')).toHaveText(['2.34','1.23']);await page.locator('#history-dialog').screenshot({path:'test-results/mobile-history.png'});await page.locator('#close-history').click();
 await choose(page,4);await page.locator('#mobile-history').click();await expect(page.locator('#history-pb')).toHaveText('—');await expect(page.locator('#history-times li')).toHaveCount(0);await page.locator('#close-history').click();
 await choose(page,3);await page.locator('#mobile-history').click();await expect(page.locator('#history-times li')).toHaveCount(2);await page.locator('#close-history').click();
 await page.setViewportSize({width:844,height:390});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(844);expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(390);await expect(page.locator('#mobile-controls')).toBeVisible();
});

test('touch bias modal contains all three sliders and saves independently',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('#settings').click();await expect(page.locator('#outer-turn-bias')).toBeHidden();await page.locator('#touch-turn-bias').click();
 await expect(page.locator('#touch-bias-dialog')).toBeVisible();
 for(const [id,value] of [['outer-turn-bias',80],['u-turn-bias',90],['eif-u-turn-bias',75]])await page.locator(`#${id}`).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await page.locator('#touch-bias-dialog').screenshot({path:'test-results/touch-bias-settings.png'});await page.locator('#close-touch-bias').click();await expect(page.locator('#settings-dialog')).toBeVisible();await page.locator('#close-settings').click();
 await page.reload();await ready(page);expect(await snap(page)).toMatchObject({outerTurnBias:80,uTurnBias:90,eifUTurnBias:75});
});


test('finished mobile solves keep their time visible until reset to free play',async({page})=>{
 await page.addInitScript(()=>{
  if(window.name==='finished-seeded')return;window.name='finished-seeded';
  localStorage.setItem('master-fto-v1',JSON.stringify({size:3,solves:{3:{history:[],redo:[],undoFloor:0,solveEnd:0,timer:{status:'finished',elapsedMs:12340,lastMs:12340,bestMs:12340,completed:1,times:[{ms:12340}]}}}}));
 });
 await page.setViewportSize({width:320,height:700});await page.goto('/');await ready(page);
 await expect(page.locator('#mobile-controls')).toHaveAttribute('data-status','finished');
 await expect(page.locator('#mobile-timer')).toBeVisible();await expect(page.locator('#mobile-timer')).toHaveText('12.34');
 expect(await buttons(page)).toEqual(['Reset','Scramble','History']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
 await page.reload();await ready(page);await expect(page.locator('#mobile-timer')).toHaveText('12.34');await expect(page.locator('#mobile-timer')).toBeVisible();
 await page.locator('#mobile-reset').click();await expect(page.locator('#mobile-controls')).toHaveAttribute('data-status','idle');await expect(page.locator('#mobile-timer')).toBeHidden();
});
