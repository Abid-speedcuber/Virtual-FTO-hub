import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {SolveRecorder} from '../../src/solve-recording.js';
import {defaultConfig} from '../../src/keyboard-engine.js';
const U={normal:[1,1,1],layer:'outer',dir:1,name:'U'};
const ready=page=>page.waitForFunction(()=>window.fto?.snapshot().ready);
async function seed(page,{size=3,rotation,enabled=true}={}){
 await page.addInitScript(({size,rotation,enabled,U})=>{
  if(sessionStorage.getItem('projection-seeded'))return;sessionStorage.setItem('projection-seeded','yes');
  localStorage.setItem('master-fto-v1',JSON.stringify({size,solves:{[size]:{history:[U],redo:[],undoFloor:1,timer:{status:'ready'}}}}));
  localStorage.setItem('master-fto-settings-v1',JSON.stringify({animate:false,follow:true,disableSounds:true,...(typeof enabled==='boolean'?{showInspectionFaces:enabled}:{}),...(rotation?{view:{rotation,radius:10}}:{})}));
 },{size,rotation,enabled,U});
}
test('rear stickers appear in the puzzle canvas and orbit with it, with no atlas or layout changes',async({page})=>{
 const camera=new THREE.PerspectiveCamera();camera.position.set(1,1,1).normalize().multiplyScalar(10);camera.lookAt(0,0,0);await seed(page,{rotation:camera.quaternion.clone().invert().toArray()});
 await page.goto('/');await ready(page);await expect(page.locator('#inspection-faces,.inspection-face-grid')).toHaveCount(0);
 const before=await page.evaluate(()=>window.fto.snapshot());expect(before.inspectionProjection.visible).toBe(true);expect(before.inspectionProjection.faces.length).toBeGreaterThan(0);expect(before.inspectionProjection.faces.every(face=>face.opacity===1)).toBe(true);
 await page.locator('#viewport').screenshot({path:'test-results/inspection-projection-desktop.png'});
 const box=await page.locator('#viewport>canvas').boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+box.height*.4);await page.mouse.down({button:'right'});await page.mouse.move(box.x+box.width*.4+110,box.y+box.height*.4+40,{steps:8});await page.mouse.up({button:'right'});
 const after=await page.evaluate(()=>window.fto.snapshot());expect(after.camera).not.toEqual(before.camera);expect(after.inspectionProjection.faces).not.toEqual(before.inspectionProjection.faces);expect(after.state).toEqual(before.state);expect(after.timer.status).toBe('ready');
 await page.locator('#viewport').screenshot({path:'test-results/inspection-projection-orbited.png'});
 await page.keyboard.press('KeyI');await expect.poll(async()=>(await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(false);await page.keyboard.press('Escape');expect((await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(false);
});
test('projection preference persists, replay hides it, and exiting replay restores inspection',async({page})=>{
 await seed(page);await page.goto('/');await ready(page);await page.locator('#settings').click();await page.locator('#show-inspection-faces').uncheck();await page.locator('#close-settings').click();expect((await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(false);
 await page.reload();await ready(page);await page.locator('#settings').click();await expect(page.locator('#show-inspection-faces')).not.toBeChecked();await page.locator('#show-inspection-faces').check();await page.locator('#close-settings').click();expect((await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(true);
 let time=0;const recorder=new SolveRecorder({},()=>time);recorder.arm({size:3,scramble:[U],view:{rotation:[0,0,0,1],radius:10},keyboard:defaultConfig(3)});recorder.event('start');time=1000;const recording=recorder.finish(1000,false);
 await page.locator('#album').click();await page.locator('#album-import-recording').click();await page.locator('#recording-paste').fill(JSON.stringify(recording));await page.locator('#recording-paste-load').click();expect((await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(false);await page.locator('#home-replay-exit').click();expect((await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(true);
 await page.locator('#mobile-reset').click();await page.locator('#confirm-accept').click();await expect.poll(async()=>(await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(false);
});
test('mobile projection stays in the original canvas without adding panels or intercepting touch',async({page})=>{
 await page.setViewportSize({width:390,height:844});await seed(page,{size:4});await page.goto('/');await ready(page);
 const canvas=page.locator('#viewport>canvas'),before=await canvas.boundingBox();await page.screenshot({path:'test-results/inspection-projection-mobile.png'});
 await page.locator('#settings').click();await page.locator('#show-inspection-faces').uncheck();await page.locator('#close-settings').click();expect(await canvas.boundingBox()).toEqual(before);
 await page.locator('#settings').click();await page.locator('#show-inspection-faces').check();await page.locator('#close-settings').click();expect(await canvas.boundingBox()).toEqual(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('projection shows only hidden faces and preserves front pixels through edge, vertex and rolled views',async({page})=>{
 test.setTimeout(60000);
 await page.goto('/');await ready(page);
 const result=await page.evaluate(async()=>{
  const {PuzzleViewer}=await import('/src/puzzle-viewer.js'),{InspectionProjection}=await import('/src/inspection-projection.js'),{FACES,solvedState,applyMove}=await import('/src/puzzle.js');
  const source=await(await fetch('/src/main.js')).text(),url=source.match(/import \* as THREE from ["']([^"']+)["']/)[1],THREE=await import(url);
  const host=document.createElement('div');host.style.cssText='position:fixed;top:0;left:0;width:240px;height:240px';document.body.append(host);
  const viewer=new PuzzleViewer(host),projection=new InspectionProjection(viewer.scene),state=Array.from({length:16},(_,i)=>({normal:FACES[i%8].normal,layer:'outer',dir:i%2?1:-1})).reduce(applyMove,solvedState(3)),colors=Object.fromEntries(FACES.map(face=>[face.name,face.color]));viewer.resize();
  const sheet=document.createElement('canvas');sheet.width=480;sheet.height=960;const context=sheet.getContext('2d');context.fillStyle='#111719';context.fillRect(0,0,480,960);
  let checked=0,maxError=0;const directions=[[1,1,1],[1,0,0],[0,1,0],[0,0,-1],[2,4,-4],[-3,-1,2],[.02,-1,.01],[1,2,3]];
  directions.forEach((direction,index)=>{
   const camera=new THREE.PerspectiveCamera();camera.position.fromArray(direction).normalize().multiplyScalar(10);camera.lookAt(0,0,0);camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),index*.41));
   projection.setVisible(false);viewer.setFrame(3,state,null,[],{radius:10,rotation:camera.quaternion.clone().invert().toArray()});
   const gl=viewer.renderer.getContext(),before=new Uint8Array(240*240*4),after=new Uint8Array(before.length);gl.readPixels(0,0,240,240,gl.RGBA,gl.UNSIGNED_BYTE,before);
   for(const [outward,backward] of [[1,.65],[0,0],[0,2],[2,0],[2,2]]){
   projection.setVisible(true);projection.setDistances(outward,backward);projection.render({size:3,state,colors,camera:viewer.camera});
   for(const mesh of projection.meshes){
    const normal=new THREE.Vector3(...FACES[mesh.userData.face].normal).normalize();
    if(normal.dot(viewer.camera.position)>=2/Math.sqrt(3)&&mesh.visible)throw Error('Visible real face also has a projected copy');
   }
   viewer.draw();gl.readPixels(0,0,240,240,gl.RGBA,gl.UNSIGNED_BYTE,after);
   for(let y=2;y<238;y++)for(let x=2;x<238;x++){
    const i=(y*240+x)*4;
    if(before[i+3]!==255||before[i]+before[i+1]+before[i+2]<100||[-4,4,-960,960].some(offset=>before[i+offset+3]!==255))continue;
    for(let channel=0;channel<3;channel++)maxError=Math.max(maxError,Math.abs(before[i+channel]-after[i+channel]));checked++;
   }
   }
   projection.setDistances(1,.65);projection.render({size:3,state,colors,camera:viewer.camera});viewer.draw();
   context.drawImage(viewer.renderer.domElement,(index%2)*240,Math.floor(index/2)*240,240,240);
  });
  const png=sheet.toDataURL('image/png');projection.dispose();viewer.dispose();host.remove();return {checked,maxError,png};
 });
 expect(result.checked).toBeGreaterThan(10000);expect(result.maxError).toBeLessThanOrEqual(1);
 await writeFile('test-results/inspection-projection-angles.png',Buffer.from(result.png.split(',')[1],'base64'));
});
test('projection defaults off and distance sliders enable, update placement, and persist independently',async({page})=>{
 await seed(page,{enabled:null});await page.goto('/');await ready(page);expect((await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(false);
 await page.locator('#settings').click();const toggle=page.getByRole('switch',{name:'Show back sticker projection during inspection',exact:true}),outward=page.locator('#inspection-projection-outward'),backward=page.locator('#inspection-projection-backward');
 await expect(toggle).not.toBeChecked();await expect(outward).toBeDisabled();await expect(backward).toBeDisabled();await expect(outward).toHaveValue('100');await expect(backward).toHaveValue('65');
 await toggle.check();await expect(outward).toBeEnabled();await expect(backward).toBeEnabled();
 const change=(input,value)=>input.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
 await change(outward,150);await change(backward,120);await expect(page.locator('#inspection-projection-outward-value')).toHaveText('150%');await expect(page.locator('#inspection-projection-backward-value')).toHaveText('120%');
 await expect.poll(async()=>{const p=(await page.evaluate(()=>window.fto.snapshot())).inspectionProjection;return [p.outward,p.backward,Math.round(Math.hypot(...p.setback)*100)];}).toEqual([1.5,1.2,120]);
 const projection=(await page.evaluate(()=>window.fto.snapshot())).inspectionProjection;expect(projection.faces.length).toBeGreaterThan(0);for(const face of projection.faces)expect(Math.hypot(...face.offset)).toBeCloseTo(1.5,10);
 await toggle.uncheck();await expect(outward).toBeDisabled();await expect(backward).toBeDisabled();await page.locator('#close-settings').click();await page.reload();await ready(page);
 await page.locator('#settings').click();await expect(toggle).not.toBeChecked();await expect(outward).toBeDisabled();await expect(backward).toBeDisabled();await expect(outward).toHaveValue('150');await expect(backward).toHaveValue('120');
 await toggle.check();await page.locator('#close-settings').click();await expect.poll(async()=>(await page.evaluate(()=>window.fto.snapshot())).inspectionProjection.visible).toBe(true);
 await page.reload();await ready(page);const restored=(await page.evaluate(()=>window.fto.snapshot())).inspectionProjection;expect(restored.visible).toBe(true);expect(restored.outward).toBe(1.5);expect(restored.backward).toBe(1.2);
});
test('projection settings fit narrow screens and saved out-of-range distances are clamped',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.addInitScript(()=>{localStorage.setItem('master-fto-settings-v1',JSON.stringify({showInspectionFaces:true,inspectionProjectionOutward:50,inspectionProjectionBackward:-5}));});
 await page.goto('/');await ready(page);await page.locator('#settings').click();await expect(page.locator('#inspection-projection-outward')).toHaveValue('200');await expect(page.locator('#inspection-projection-backward')).toHaveValue('0');
 await page.locator('#inspection-projection-settings').scrollIntoViewIfNeeded();expect(await page.locator('.settings-body').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await page.locator('#settings-dialog').screenshot({path:'test-results/inspection-projection-settings-mobile.png'});
});
