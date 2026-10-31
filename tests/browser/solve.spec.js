import {test,expect} from '@playwright/test';
const snapshot=page=>page.evaluate(()=>window.fto.snapshot());
const idle=page=>page.waitForFunction(()=>window.fto&&!window.fto.snapshot().busy&&!window.fto.snapshot().queued);
const signature=state=>state.map(s=>`${s.color}:${s.vertices.map(v=>v.join(',')).sort().join(';')}`).sort().join('|');
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>window.fto);});
test('rapid keyboard input queues, undo restores, redo and reload retain the solve',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const initial=signature((await snapshot(page)).state);
 for(const key of ['u','r','f','j','l','b','k','d','Control+u','Shift+r','Shift+f','k'])await page.keyboard.press(key);
 await idle(page);expect((await snapshot(page)).history).toHaveLength(12);
 const mixed=signature((await snapshot(page)).state);expect(mixed).not.toBe(initial);
 for(let i=0;i<12;i++)await page.keyboard.press('Control+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(initial);
 for(let i=0;i<12;i++)await page.keyboard.press('Control+Shift+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(mixed);
 await page.reload();await idle(page);expect(signature((await snapshot(page)).state)).toBe(mixed);expect(errors).toEqual([]);
});
test('inner and wide selectors, modifiers and numeric keys work',async({page})=>{
 await page.getByRole('button',{name:'Inner slice',exact:true}).click();await page.keyboard.press('u');await idle(page);
 expect((await snapshot(page)).history.at(-1).layer).toBe('inner');
 await page.getByRole('button',{name:'Wide',exact:true}).click();await page.keyboard.press('Shift+Digit3');await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({layer:'wide',dir:1,name:'F'});
 await page.getByRole('button',{name:'Outer',exact:true}).click();await page.keyboard.press('Control+r');await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({layer:'inner',name:'R'});
});
test('keyboard remains usable after toggling settings',async({page})=>{
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();await page.keyboard.press('u');await idle(page);expect((await snapshot(page)).history).toHaveLength(1);
 await page.getByRole('switch',{name:'Follow the view'}).uncheck();await page.keyboard.press('r');await idle(page);expect((await snapshot(page)).history).toHaveLength(2);
});
test('orbit changes mapping and undo remains physical',async({page})=>{
 const before=await snapshot(page);const canvas=page.locator('canvas');const box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.9,box.y+box.height*.5,{steps:20});await page.mouse.up();
 await expect.poll(async()=>JSON.stringify((await snapshot(page)).frame)).not.toBe(JSON.stringify(before.frame));
 expect((await snapshot(page)).history).toHaveLength(0);
 await page.keyboard.press('u');await idle(page);expect((await snapshot(page)).history).toHaveLength(1);
 await page.getByRole('button',{name:'Home view'}).click();await page.keyboard.press('Control+z');await idle(page);expect(signature((await snapshot(page)).state)).toBe(signature(before.state));
});
test('mobile viewport fits without horizontal scrolling',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(page.locator('canvas')).toBeVisible();
});

// Labels occupy the actual face centers, so these exercise raycasting as well
// as the complete pointer/gesture handling, without a synthetic DOM click.
async function facePoint(page){
 const label=page.locator('.face-label:not([hidden])').filter({hasText:/^F$/});
 const box=await label.boundingBox();expect(box).not.toBeNull();
 return {x:box.x+box.width/2,y:box.y+box.height/2};
}
test('mouse face turns, right-click, Shift, Control and undo work before and after orbiting',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 const initial=signature((await snapshot(page)).state);
 let point=await facePoint(page);
 await page.mouse.click(point.x,point.y);await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({name:'F',dir:1,layer:'outer'});
 await page.mouse.click(point.x,point.y,{button:'right'});await idle(page);
 expect((await snapshot(page)).history.at(-1).dir).toBe(-1);
 expect(signature((await snapshot(page)).state)).toBe(initial);
 await page.keyboard.down('Shift');await page.mouse.click(point.x,point.y);await page.keyboard.up('Shift');await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({dir:1,layer:'wide'});
 await page.keyboard.down('Control');await page.mouse.click(point.x,point.y);await page.keyboard.up('Control');await idle(page);
 expect((await snapshot(page)).history.at(-1).layer).toBe('inner');
 for(let i=0;i<4;i++)await page.keyboard.press('Control+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(initial);
 const box=await page.locator('canvas').boundingBox();
 await page.mouse.move(box.x+50,box.y+100);await page.mouse.down();await page.mouse.move(box.x+350,box.y+100,{steps:20});await page.mouse.up();
 expect((await snapshot(page)).history).toHaveLength(0);
 point=await facePoint(page);await page.mouse.click(point.x,point.y);await idle(page);
 expect((await snapshot(page)).history).toHaveLength(1);
 expect((await snapshot(page)).history[0].name).toBe('F');
 await page.keyboard.press('Control+z');await idle(page);expect(signature((await snapshot(page)).state)).toBe(initial);
 expect(errors).toEqual([]);
});
test('vertical orbit crosses both poles, repeats past 360 degrees and Home restores the view',async({page})=>{
 const before=await snapshot(page),box=await page.locator('canvas').boundingBox();
 // Track the angle traveled between drags, rather than an Euler angle.
 let previous=before.orbit,total=0;
 for(let i=0;i<4;i++){
  await page.mouse.move(box.x+box.width*.5,box.y+90);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5,box.y+box.height-40,{steps:15});await page.mouse.up();
  const current=(await snapshot(page)).orbit;
  total+=2*Math.acos(Math.min(1,Math.abs(current.reduce((v,n,i)=>v+n*previous[i],0))));previous=current;
 }
 const after=await snapshot(page);
 expect(total).toBeGreaterThan(2*Math.PI);
 expect(after.history).toHaveLength(0);
 expect(after.labels).toContain('F');expect(after.labels.length).toBeGreaterThanOrEqual(3);
 await page.getByRole('button',{name:'Home view'}).click();
 const restored=await snapshot(page);
 restored.camera.forEach((v,i)=>expect(v).toBeCloseTo(before.camera[i],10));
 expect(restored.frame).toEqual(before.frame);
});

async function orbitTo(page,yaw,pitch){
 await page.getByRole('button',{name:'Home view'}).click();
 const box=await page.locator('canvas').boundingBox(),home=(await snapshot(page)).camera;
 const homeYaw=Math.atan2(home[0],home[2]),homePitch=Math.atan2(home[1],Math.hypot(home[0],home[2]));
 async function drag(dx,dy){
  const distance=Math.hypot(dx,dy);if(distance<6)return;
  const count=Math.ceil(distance/140);
  for(let i=0;i<count;i++){
   await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
   await page.mouse.move(box.x+box.width*.5+dx/count,box.y+box.height*.5+dy/count,{steps:3});await page.mouse.up();
  }
 }
 // X(-homePitch), Y(homeYaw-targetYaw), X(targetPitch) reaches the
 // target hold entirely through fixed viewer X/Y inputs, without a test setter.
 await drag(0,-homePitch/.008);await drag((homeYaw-yaw)/.008,0);await drag(0,pitch/.008);
}

test('square and EIF screenshot orientations show U/F/L/R on the expected physical faces',async({page})=>{
 await orbitTo(page,-Math.PI/4,Math.PI/2);
 await expect.poll(async()=>(await snapshot(page)).hold).toEqual({up:'R',front:'L',notation:'CIF'});
 let s=await snapshot(page);
 expect(s.frame.slice(0,3)).toEqual([1,1,-1]); // red U
 expect(s.frame.slice(6,9)).toEqual([-1,1,1]); // blue F
 expect(s.frame.slice(12,15)).toEqual([-1,1,-1]); // gray L
 expect(s.frame.slice(3,6)).toEqual([1,1,1]); // white R
 await page.locator('#viewport').screenshot({path:'test-results/square-hold.png'});
 await orbitTo(page,-Math.PI/4,-.30);
 await expect.poll(async()=>(await snapshot(page)).hold).toEqual({up:'L',front:'BL',notation:'EIF'});
 s=await snapshot(page);
 expect(s.frame.slice(0,3)).toEqual([-1,1,1]); // blue U
 expect(s.frame.slice(6,9)).toEqual([-1,-1,1]); // orange F
 expect(s.frame.slice(12,15)).toEqual([-1,-1,-1]); // yellow L
 expect(s.frame.slice(3,6)).toEqual([1,-1,1]); // purple R
 await page.locator('#viewport').screenshot({path:'test-results/eif-hold.png'});
 const point=await facePoint(page);await page.mouse.click(point.x,point.y);await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({name:'F',normal:[-1,-1,1]});
});


test('both drag axes follow the pointer after arbitrary mixed rotations and roll',async({page})=>{
 test.setTimeout(60000);
 const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const normalized=a=>a.map(v=>v/Math.hypot(...a));
 const project=(point,s)=>{const back=normalized(s.camera),right=cross(s.cameraUp,back),v=point.map((n,i)=>n-s.camera[i]),depth=-dot(v,back);return [dot(v,right)/depth,-dot(v,s.cameraUp)/depth];};
 const box=await page.locator('canvas').boundingBox();
 async function drag(dx,dy){
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5+dx,box.y+box.height*.5+dy,{steps:3});await page.mouse.up();
 }
 for(let orientation=0;orientation<8;orientation++){
  await drag(95,140);await drag(-110,0); // accumulate noncommuting rotations
  for(const [dx,dy] of [[32,0],[-32,0],[0,32],[0,-32]]){
   const before=await snapshot(page),point=normalized(before.camera).map(v=>v*1.5),a=project(point,before);
   await drag(dx,dy);
   const after=await snapshot(page),b=project(point,after),sx=b[0]-a[0],sy=b[1]-a[1];
   expect(sx*dx+sy*dy).toBeGreaterThan(0);
   expect(Math.abs(sx*dy-sy*dx)).toBeLessThan(1e-8);
   expect(after.history).toHaveLength(0);
  }
 }
});


test('all modifier combinations select the same depths for keyboard, buttons and mouse; ultra wide persists',async({page})=>{
 test.setTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 const initial=signature((await snapshot(page)).state);
 // Select a conflicting default to verify that each modifier overrides it.
 await page.getByRole('button',{name:'Inner slice',exact:true}).click();
 for(const [keys,layer] of [[['Shift'],'wide'],[['Control'],'inner'],[['Control','Shift'],'ultra']]){
  for(const kind of ['keyboard','button','mouse','right-mouse']){
   for(const key of keys)await page.keyboard.down(key);
   if(kind==='keyboard')await page.keyboard.press('Digit3');
   else if(kind==='button')await page.locator('[data-face="F"]').click();
   else {const p=await facePoint(page);await page.mouse.click(p.x,p.y,{button:kind==='right-mouse'?'right':'left'});}
   for(const key of [...keys].reverse())await page.keyboard.up(key);
   await idle(page);
   const move=(await snapshot(page)).history.at(-1);
   expect(move).toMatchObject({name:'F',layer,dir:kind==='right-mouse'?-1:1});
  }
 }
 await expect(page.locator('.history-move').last()).toHaveText('3Fw′');
 const mixed=signature((await snapshot(page)).state);
 await page.reload();await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(mixed);
 expect((await snapshot(page)).history).toHaveLength(12);
 for(let i=0;i<12;i++)await page.keyboard.press('Control+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(initial);
 for(let i=0;i<12;i++)await page.keyboard.press('Control+Shift+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(mixed);
 await page.getByRole('button',{name:'Ultra wide',exact:true}).click();await page.keyboard.press('f');await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({layer:'ultra',dir:1});
 await page.getByRole('button',{name:'Clockwise',exact:false}).click();await page.keyboard.press('Shift+f');await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({layer:'wide',dir:-1});
 expect(errors).toEqual([]);
});


test('white-front CIF shows purple D and red R while the true U face stays hidden',async({page})=>{
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 await page.getByRole('button',{name:'Home view'}).click();
 await expect.poll(async()=>(await snapshot(page)).hold).toEqual({up:'B',front:'U',notation:'CIF'});
 const before=await snapshot(page);
 expect(before.labels).toEqual(expect.arrayContaining(['F','L','R','D']));
 expect(before.labels).not.toContain('U');
 await expect(page.locator('.face-label').filter({hasText:/^U$/})).toBeHidden();
 await page.locator('#viewport').screenshot({path:'test-results/cif-hidden-up.png'});
 const label=page.locator('.face-label:not([hidden])').filter({hasText:/^D$/}),box=await label.boundingBox();
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({name:'D',normal:[1,-1,1]});
 await page.keyboard.press('d');await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({name:'D',normal:[1,-1,1]});
 for(let i=0;i<2;i++)await page.keyboard.press('Control+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(signature(before.state));
});

test('Ctrl and Ctrl+Shift face-letter shortcuts turn slices and ultra-wide layers',async({page})=>{
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 const initial=signature((await snapshot(page)).state);
 for(const [modifier,layer] of [['Control','inner'],['Control+Shift','ultra']]){
  for(const [key,name] of [['u','U'],['r','R'],['f','F'],['j','BR'],['l','L'],['b','B'],['k','BL'],['d','D']]){
   await page.keyboard.press(`${modifier}+${key}`);await idle(page);
   expect((await snapshot(page)).history.at(-1)).toMatchObject({name,layer});
  }
 }
 expect((await snapshot(page)).history).toHaveLength(16);
 for(let i=0;i<16;i++)await page.keyboard.press('Control+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(initial);
});

function screenPoint(point,s,box){
 const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),back=s.camera.map(v=>v/Math.hypot(...s.camera)),up=s.cameraUp;
 const right=[up[1]*back[2]-up[2]*back[1],up[2]*back[0]-up[0]*back[2],up[0]*back[1]-up[1]*back[0]],v=point.map((n,i)=>n-s.camera[i]),depth=-dot(v,back),f=1/Math.tan(36*Math.PI/360);
 return {x:box.x+box.width/2+dot(v,right)*f*box.height/(2*depth),y:box.y+box.height/2-dot(v,up)*f*box.height/(2*depth)};
}
test('FDLR front-face seams turn F rather than the hidden U face',async({page})=>{
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 const before=await snapshot(page),box=await page.locator('canvas').boundingBox();
 for(const point of [[.5,1,.5],[1,.5,.5],[.5,.5,1]]){
  const p=screenPoint(point,before,box);
  for(const offset of [-.25,0,.25]){
   await page.mouse.click(p.x+offset,p.y);await idle(page);
   expect((await snapshot(page)).history.at(-1)).toMatchObject({name:'F',normal:[1,1,1]});
  }
 }
 expect((await snapshot(page)).history).toHaveLength(9);
});
test('wheel while holding rolls 3 degrees per step, without zoom or a release turn',async({page})=>{
 const box=await page.locator('canvas').boundingBox(),before=await snapshot(page);
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
 await page.mouse.wheel(0,-120);
 await expect.poll(async()=>{const q=(await snapshot(page)).orbit;return 2*Math.acos(Math.min(1,Math.abs(q.reduce((sum,v,i)=>sum+v*before.orbit[i],0))));}).toBeCloseTo(Math.PI/60,8);
 await page.mouse.wheel(0,120);await page.mouse.up();
 await expect.poll(async()=>{const q=(await snapshot(page)).orbit;return Math.abs(q.reduce((sum,v,i)=>sum+v*before.orbit[i],0));}).toBeCloseTo(1,10);
 const after=await snapshot(page);expect(after.history).toHaveLength(0);expect(Math.hypot(...after.camera)).toBeCloseTo(Math.hypot(...before.camera),10);
 await page.mouse.wheel(0,120);
 await expect.poll(async()=>Math.hypot(...(await snapshot(page)).camera)).toBeGreaterThan(Math.hypot(...before.camera));
});
test('input immediately after orbit uses the displayed label frame before the next render',async({page})=>{
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 const before=await snapshot(page),box=await page.locator('canvas').boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
 const move=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');
  // Force rotation and input into one event-loop turn, before a scheduled draw.
  for(let i=0;i<30;i++)canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-120,cancelable:true}));
  canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'l',code:'KeyL',bubbles:true,cancelable:true}));
  return window.fto.snapshot().history.at(-1);
 });
 await page.mouse.up();await idle(page);
 expect(move).toMatchObject({name:'L',normal:before.frame.slice(12,15)});
 expect((await snapshot(page)).history).toHaveLength(1);
});
test('Reset to solved cancels queued animations, preserves the view, and persists after reload',async({page})=>{
 const initial=await snapshot(page);
 await page.getByRole('button',{name:'Scramble',exact:false}).click();
 await page.waitForFunction(()=>window.fto.snapshot().busy&&window.fto.snapshot().queued>0);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Reset to solved',exact:false}).click();
 const cancelled=await snapshot(page);expect(cancelled.history.length+cancelled.queued+Number(cancelled.busy)).toBe(50);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reset to solved',exact:false}).click();await idle(page);
 // Allow pending animation callbacks to run; they must not restore old state.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const reset=await snapshot(page);
 expect(reset.solved).toBe(true);expect(reset.history).toHaveLength(0);expect(reset.redo).toHaveLength(0);expect(reset.queued).toBe(0);
 expect(signature(reset.state)).toBe(signature(initial.state));expect(reset.orbit).toEqual(initial.orbit);
 await page.reload();await idle(page);expect(signature((await snapshot(page)).state)).toBe(signature(initial.state));
});

test('right-click face buttons issue one CCW move at every depth and prevent the context menu',async({page})=>{
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 await page.evaluate(()=>{
  window.buttonMenus=[];
  document.addEventListener('contextmenu',e=>{if(e.target.closest('.move-button'))window.buttonMenus.push(e.defaultPrevented);});
 });
 const initial=signature((await snapshot(page)).state);
 let count=0;
 for(const [keys,layer] of [[[],'outer'],[['Shift'],'wide'],[['Control'],'inner'],[['Control','Shift'],'ultra']]){
  for(const key of keys)await page.keyboard.down(key);
  for(const name of ['U','R','F','BR','L','B','BL','D']){
   await page.locator(`[data-face="${name}"]`).click({button:'right'});await idle(page);count++;
   const s=await snapshot(page);expect(s.history).toHaveLength(count);expect(s.history.at(-1)).toMatchObject({name,layer,dir:-1});
  }
  for(const key of [...keys].reverse())await page.keyboard.up(key);
 }
 expect(await page.evaluate(()=>window.buttonMenus)).toEqual(Array(32).fill(true));
 await page.getByRole('button',{name:'Clockwise',exact:false}).click();
 await page.locator('[data-face="F"]').click({button:'right'});await idle(page);
 expect((await snapshot(page)).history.at(-1).dir).toBe(-1);
 for(let i=0;i<33;i++)await page.keyboard.press('Control+z');await idle(page);
 expect(signature((await snapshot(page)).state)).toBe(initial);
});
test('depth tabs preview modifiers, restore the selected depth, and clear on focus loss',async({page})=>{
 const selected=()=>page.locator('#layers [aria-pressed="true"]');
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 await page.getByRole('button',{name:'Inner slice',exact:true}).click();
 await expect(selected()).toHaveAttribute('data-layer','inner');
 await page.keyboard.down('Shift');await expect(selected()).toHaveAttribute('data-layer','wide');
 await page.keyboard.down('Control');await expect(selected()).toHaveAttribute('data-layer','ultra');
 await page.locator('[data-face="F"]').click({button:'right'});await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({layer:'ultra',dir:-1});
 await page.keyboard.up('Shift');await expect(selected()).toHaveAttribute('data-layer','inner');
 await page.keyboard.up('Control');await expect(selected()).toHaveAttribute('data-layer','inner');
 await page.getByRole('button',{name:'Wide',exact:true}).click();
 await page.keyboard.down('Control');await expect(selected()).toHaveAttribute('data-layer','inner');
 await page.keyboard.down('Shift');await expect(selected()).toHaveAttribute('data-layer','ultra');
 await page.keyboard.up('Control');await expect(selected()).toHaveAttribute('data-layer','wide');
 await page.keyboard.up('Shift');await expect(selected()).toHaveAttribute('data-layer','wide');
 await page.keyboard.down('Control');await expect(selected()).toHaveAttribute('data-layer','inner');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await expect(selected()).toHaveAttribute('data-layer','wide');
 await page.keyboard.up('Control');
 await page.locator('[data-face="F"]').click();await idle(page);
 expect((await snapshot(page)).history.at(-1)).toMatchObject({layer:'wide'});
 expect(await selected().count()).toBe(1);
});

test('face-button notation follows selected depth, direction, and temporary modifiers',async({page})=>{
 await page.getByRole('switch',{name:'Animate turns'}).uncheck();
 const names=['U','R','F','BR','L','B','BL','D'];
 const labels=()=>page.locator('#move-buttons .name');
 for(const [depth,prefix,suffix] of [['Outer','',''],['Inner slice','2',''],['Wide','','w'],['Ultra wide','3','w']]){
  await page.getByRole('button',{name:depth,exact:true}).click();
  await expect(labels()).toHaveText(names.map(name=>prefix+name+suffix));
  await page.locator('#direction').click();
  await expect(labels()).toHaveText(names.map(name=>prefix+name+suffix+"'"));
  const face=page.locator('[data-face="F"]');
  await expect(face).toHaveAttribute('aria-label',prefix+'F'+suffix+"'");
  await face.click();await idle(page);
  expect((await snapshot(page)).history.at(-1)).toMatchObject({name:'F',dir:-1});
  await page.locator('#direction').click();
 }
 await page.getByRole('button',{name:'Outer',exact:true}).click();
 await page.keyboard.down('Shift');await expect(labels()).toHaveText(names.map(name=>name+'w'));
 await page.keyboard.down('Control');await expect(labels()).toHaveText(names.map(name=>'3'+name+'w'));
 await page.locator('#direction').click();await expect(labels()).toHaveText(names.map(name=>'3'+name+"w'"));
 await page.keyboard.up('Shift');await expect(labels()).toHaveText(names.map(name=>'2'+name+"'"));
 await page.keyboard.up('Control');await expect(labels()).toHaveText(names.map(name=>name+"'"));
 await page.locator('#direction').click();await expect(labels()).toHaveText(names);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Ultra wide',exact:true}).click();await page.locator('#direction').click();
 await expect(labels()).toHaveText(names.map(name=>'3'+name+"w'"));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 expect(await page.locator('#move-buttons .name').evaluateAll(elements=>elements.every(el=>{
  const text=el.getBoundingClientRect(),button=el.closest('button').getBoundingClientRect();return text.left>=button.left&&text.right<=button.right;
 }))).toBe(true);
 await page.locator('#move-buttons').screenshot({path:'test-results/move-notation-mobile.png'});
});
