import {test,expect} from '@playwright/test';
import {withSettings} from './helpers.js';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);

test('fixed branded header, About, and new defaults',async({page})=>{
 await page.goto('/');await ready(page);
 await expect(page.locator('.site-brand')).toHaveText('FTO Simulatorby Abid Ibn Ashraf');
 expect(await page.locator('.topbar').evaluate(el=>getComputedStyle(el).position)).toBe('fixed');
 const header=await page.locator('.topbar').boundingBox(),canvas=await page.locator('#viewport').boundingBox();expect(canvas.y).toBe(header.height);
 await withSettings(page,async()=>{
  await expect(page.locator('#animate')).toBeChecked();await expect(page.locator('#animate-scrambling')).toBeChecked();
  await expect(page.locator('#settings-dialog h2')).toHaveText(['Display','Controls','Animation & sound','Your data']);
  await page.locator('#edit-keyboard').click();await expect(page.locator('#keyboard-layout')).toHaveValue('60');await page.locator('#close-keyboard').click();
  await page.locator('#animate-scrambling').uncheck();
 });
 await page.locator('#about').click();await expect(page.locator('#about-dialog')).toBeVisible();await expect(page.locator('#about-dialog')).toContainText('by Abid Ibn Ashraf');await page.keyboard.press('Escape');
 await page.reload();await ready(page);await withSettings(page,()=>expect(page.locator('#animate-scrambling')).not.toBeChecked());
});

test('keyboard and its switch disappear when space is limited and return with preference intact',async({page})=>{
 await page.setViewportSize({width:1360,height:720});await page.goto('/');await ready(page);
 await withSettings(page,()=>page.locator('#show-keyboard').check());await expect(page.locator('#keyboard-overlay')).toBeVisible();
 for(const viewport of [{width:390,height:844},{width:900,height:900},{width:1000,height:800}]){
  await page.setViewportSize(viewport);await expect(page.locator('#keyboard-overlay')).toBeHidden();
  await withSettings(page,async()=>{await expect(page.locator('#show-keyboard')).toBeHidden();await expect(page.locator('#edit-keyboard')).toBeVisible();});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(viewport.width);
 }
 await page.setViewportSize({width:1360,height:720});await expect(page.locator('#keyboard-overlay')).toBeVisible();await withSettings(page,()=>expect(page.locator('#show-keyboard')).toBeChecked());
 await page.screenshot({path:'test-results/polish-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/polish-mobile.png'});
 await page.locator('#settings').click();await page.locator('#settings-dialog').screenshot({path:'test-results/polish-settings.png'});
});

for(const method of ['same document','DevTools','other tab'])test(`cleared times stay cleared: ${method}`,async({page,context})=>{
 await page.addInitScript(()=>{
  if(window.name==='polish-times-seeded')return;
  window.name='polish-times-seeded';
  localStorage.setItem('master-fto-v1',JSON.stringify({size:4,solves:{4:{history:[],redo:[],undoFloor:0,timer:{status:'idle',bestMs:1234,completed:1,times:[{ms:1234,at:'2026-11-04T00:00:00Z'}]}}}}));
 });
 await page.goto('/');await ready(page);await expect(page.locator('#solve-times li')).toHaveCount(1);
 if(method==='same document'){
  // DevTools storage removal doesn't always send this page a storage event.
  await page.evaluate(()=>{localStorage.clear();window.dispatchEvent(new Event('blur'));});
 }else if(method==='DevTools'){
  const cdp=await context.newCDPSession(page);await cdp.send('Storage.clearDataForOrigin',{origin:new URL(page.url()).origin,storageTypes:'local_storage'});
 }else{
  const other=await context.newPage();await other.goto('/');await ready(other);await other.evaluate(()=>localStorage.clear());await other.close();
 }
 await expect(page.locator('#solve-times li')).toHaveCount(0);await expect(page.locator('#timer-pb')).toHaveText('—');
 await page.locator('#settings').click();await page.locator('#close-settings').click();await page.reload();await ready(page);await expect(page.locator('#solve-times li')).toHaveCount(0);
});
