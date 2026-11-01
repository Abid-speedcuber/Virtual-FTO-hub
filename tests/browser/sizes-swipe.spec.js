import {test,expect} from '@playwright/test';
import {withSettings,showMoveButtons} from './helpers.js';
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
const idle=page=>page.waitForFunction(()=>window.fto&&!window.fto.snapshot().busy&&!window.fto.snapshot().queued);
const signature=state=>state.map(s=>`${s.color}:${s.vertices.map(v=>v.join(',')).sort().join(';')}`).sort().join('|');
test.beforeEach(async({page})=>{await page.goto('/');await idle(page);await showMoveButtons(page);});
async function facePoint(page){
 const box=await page.locator('.face-label:not([hidden])').filter({hasText:/^F$/}).boundingBox();
 return {x:box.x+box.width/2+13,y:box.y+box.height/2+8};
}
test('every size renders, turns its deepest slice and undoes',async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(let size=2;size<=20;size++){
  await withSettings(page,()=>page.getByLabel('FTO size',{exact:true}).selectOption(String(size)));await idle(page);
  const before=await snapshot(page);expect(before.size).toBe(size);expect(before.state).toHaveLength(8*size*size);
  await page.getByLabel('Slice to turn',{exact:true}).selectOption(String(size));
  await page.locator('[data-face="F"]').click();await idle(page);
  const after=await snapshot(page);expect(after.history.at(-1)).toMatchObject({layer:'slice',depth:size});
  expect(signature(after.state)).not.toBe(signature(before.state));
  await page.locator('#undo').click();await idle(page);expect(signature((await snapshot(page)).state)).toBe(signature(before.state));
 }
 expect(errors).toEqual([]);
});
test('sizes preserve independent histories and restore the selected size on reload',async({page})=>{
 await page.locator('[data-face="U"]').click();await idle(page);const four=signature((await snapshot(page)).state);
 await withSettings(page,()=>page.getByLabel('FTO size',{exact:true}).selectOption('20'));await page.getByLabel('Slice to turn',{exact:true}).selectOption('12');
 await page.locator('[data-face="R"]').click();await idle(page);const twenty=signature((await snapshot(page)).state);
 await page.reload();await idle(page);expect((await snapshot(page)).size).toBe(20);expect(signature((await snapshot(page)).state)).toBe(twenty);
 await withSettings(page,()=>page.getByLabel('FTO size',{exact:true}).selectOption('4'));expect(signature((await snapshot(page)).state)).toBe(four);
 await withSettings(page,()=>page.getByLabel('FTO size',{exact:true}).selectOption('20'));expect(signature((await snapshot(page)).state)).toBe(twenty);
});
test('mouse swipe turns one slice without orbit; background drag orbits without a move',async({page})=>{
 expect((await snapshot(page)).pointerMode).toBe('swipe');
 const before=await snapshot(page),point=await facePoint(page);
 await page.mouse.click(point.x,point.y);expect((await snapshot(page)).history).toHaveLength(0);
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+65,point.y+10,{steps:12});await page.mouse.up();await idle(page);
 const after=await snapshot(page);expect(after.history).toHaveLength(1);expect(after.history[0].layer).toBe('slice');expect(after.orbit).toEqual(before.orbit);
 await page.locator('#undo').click();await idle(page);expect(signature((await snapshot(page)).state)).toBe(signature(before.state));
 const box=await page.locator('canvas').boundingBox();
 await page.mouse.move(box.x+15,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+80,box.y+box.height*.5+30,{steps:8});await page.mouse.up();
 await expect.poll(async()=>(await snapshot(page)).orbit).not.toEqual(before.orbit);expect((await snapshot(page)).history).toHaveLength(0);
});
test('old 4×4 storage migrates without losing the solve',async({page})=>{
 await page.addInitScript(()=>{if(!sessionStorage.getItem('legacy-seeded')){localStorage.setItem('master-fto-v1',JSON.stringify({history:[{normal:[1,1,1],layer:'inner',dir:1,name:'U'}],redo:[]}));sessionStorage.setItem('legacy-seeded','yes');}});
 await page.reload();await idle(page);expect((await snapshot(page)).history).toHaveLength(1);expect((await snapshot(page)).solved).toBe(false);
 await withSettings(page,()=>page.getByLabel('FTO size',{exact:true}).selectOption('2'));await page.reload();await idle(page);
 await withSettings(page,()=>page.getByLabel('FTO size',{exact:true}).selectOption('4'));expect((await snapshot(page)).history).toHaveLength(1);
});
test('real touch swipe turns and pinch cancels the pending slice gesture',async({page,context})=>{
 const client=await context.newCDPSession(page);const point=await facePoint(page);
 const send=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id])=>({x,y,id}))});
 const before=await snapshot(page);
 await send('touchStart',[[point.x,point.y,1]]);
 await send('touchMove',[[point.x+65,point.y+10,1]]);await send('touchEnd',[]);await idle(page);
 const after=await snapshot(page);expect(after.history).toHaveLength(1);expect(after.orbit).toEqual(before.orbit);
 const p=await facePoint(page);
 await send('touchStart',[[p.x,p.y,1]]);await send('touchStart',[[p.x,p.y,1],[p.x+55,p.y+20,2]]);
 await send('touchMove',[[p.x-10,p.y-10,1],[p.x+85,p.y+40,2]]);await send('touchEnd',[]);await idle(page);
 expect((await snapshot(page)).history).toHaveLength(1);expect((await snapshot(page)).camera).not.toEqual(after.camera);
 await client.detach();
});
