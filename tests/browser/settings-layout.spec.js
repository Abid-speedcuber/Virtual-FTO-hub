import {test,expect} from '@playwright/test';
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
for(const width of [1280,390,320])test(`settings are aligned and navigable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto('/');await ready(page);await page.locator('#settings').click();
 await expect(page.locator('#settings-dialog')).toBeVisible();
 const measurements=await page.locator('#settings-dialog').evaluate(dialog=>{
  const body=dialog.querySelector('.settings-body'),box=dialog.getBoundingClientRect(),header=dialog.querySelector('.settings-header').getBoundingClientRect();
  return {width:box.width,height:box.height,overflow:body.scrollWidth-body.clientWidth,scrollbar:getComputedStyle(body).scrollbarWidth,header:header.top};
 });
 expect(measurements.width).toBeLessThanOrEqual(width-24);expect(measurements.height).toBeLessThanOrEqual(818);expect(measurements.overflow).toBeLessThanOrEqual(1);expect(measurements.scrollbar).toBe('thin');
 await page.locator('#settings-dialog').screenshot({path:`test-results/settings-display-${width}.png`});
 await page.locator('.settings-body').evaluate(body=>{const section=document.querySelector('#settings-controls');body.scrollTop+=section.getBoundingClientRect().top-body.getBoundingClientRect().top-24;});
 const header=await page.locator('.settings-header').boundingBox();expect(header.y).toBeCloseTo(measurements.header,0);
 const controls=await page.locator('#settings-controls').boundingBox(),body=await page.locator('.settings-body').boundingBox();expect(controls.y).toBeGreaterThanOrEqual(body.y);expect(controls.y-body.y).toBeLessThan(26);
 const rows=await page.locator('#settings-controls .setting').evaluateAll(rows=>rows.map(row=>{const b=row.getBoundingClientRect(),items=[...row.children].map(el=>el.getBoundingClientRect());return {right:items.at(-1).right,width:items.at(-1).width,overlap:items[0].right>items[1].left+1,rowWidth:b.width};}));
 expect(rows.every(row=>!row.overlap)).toBe(true);expect(new Set(rows.map(row=>Math.round(row.right))).size).toBe(1);
 await page.locator('#settings-dialog').screenshot({path:`test-results/settings-controls-${width}.png`});
 await page.locator('#touch-turn-bias').click();await expect(page.locator('#touch-bias-dialog')).toBeVisible();await page.locator('#close-touch-bias').click();
 await page.locator('.settings-body').evaluate(body=>body.scrollTop=body.scrollHeight);await expect(page.locator('#export-user-data')).toBeInViewport();await expect(page.locator('#save-status')).toBeHidden();
 await page.locator('#close-settings').click();await expect(page.locator('#settings-dialog')).toBeHidden();
});
