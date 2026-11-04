import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {FRAMES,snappedViewRotation} from '../../src/orientation.js';
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
for(const notation of ['CIF','EIF'])test(`[ squares up ${notation} without changing the hold or puzzle`,async({page})=>{
 const frame=FRAMES.find(f=>f.notation===notation),ideal=snappedViewRotation(frame);
 const tilted=ideal.clone().premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(.03,-.04,.06))).toArray();
 await page.addInitScript(({rotation})=>{
  if(!localStorage.getItem('master-fto-settings-v1'))localStorage.setItem('master-fto-settings-v1',JSON.stringify({view:{rotation,radius:11}}));
 },{rotation:tilted});
 await page.goto('/');await page.waitForFunction(()=>window.fto?.snapshot().ready);
 const before=await snapshot(page);expect(before.hold.notation).toBe(notation);
 await page.keyboard.press('Home');expect((await snapshot(page)).orbit).toEqual(before.orbit);
 await page.keyboard.press('BracketLeft');
 await expect.poll(async()=>new THREE.Quaternion().fromArray((await snapshot(page)).orbit).angleTo(ideal)).toBeLessThan(1e-7);
 const after=await snapshot(page);
 expect(after.frame).toEqual(before.frame);expect(after.state).toEqual(before.state);expect(after.history).toEqual(before.history);
 expect(after.keyboard.mode).toEqual(before.keyboard.mode);expect(Math.hypot(...after.camera)).toBeCloseTo(11,8);
 await page.reload();await page.waitForFunction(()=>window.fto?.snapshot().ready);
 expect(new THREE.Quaternion().fromArray((await snapshot(page)).orbit).angleTo(ideal)).toBeLessThan(1e-7);
});
