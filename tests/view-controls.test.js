import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ViewControls} from '../src/view-controls.js';
class Surface extends EventTarget{
 captured=new Set();
 setPointerCapture(id){this.captured.add(id);}
 hasPointerCapture(id){return this.captured.has(id);}
 releasePointerCapture(id){this.captured.delete(id);}
}
const setup=()=>{const camera=new THREE.PerspectiveCamera();camera.position.set(6,4.8,7);return {camera,controls:new ViewControls(camera,new Surface())};};
const event=(x,y,extra={})=>({pointerId:1,button:0,clientX:x,clientY:y,preventDefault(){},...extra});
const drag=(controls,dx,dy)=>{controls.down(event(100,100));controls.move(event(100+dx,100+dy));controls.up(event(100+dx,100+dy));};
test('both axes permit repeated full revolutions without clamps',()=>{
 for(const [dx,dy] of [[0,4*Math.PI/.008],[4*Math.PI/.008,0]]){
  const {camera,controls}=setup();const start=camera.position.clone(),up=camera.up.clone();
  drag(controls,dx,dy);
  assert.ok(camera.position.distanceTo(start)<1e-10);assert.ok(camera.up.distanceTo(up)<1e-10);
 }
});
test('a small click remains a tap; drag, cancellation, and pinch do not turn faces',()=>{
 const {controls}=setup();const taps=[];controls.addEventListener('tap',e=>taps.push(e));
 controls.down(event(20,20,{button:2}));controls.move(event(22,21));controls.up(event(22,21,{shiftKey:true,ctrlKey:true}));
 assert.equal(taps.length,1);assert.equal(taps[0].button,2);assert.equal(taps[0].ctrlKey,true);assert.equal(taps[0].shiftKey,true);
 controls.down(event(0,0));controls.move(event(40,40));controls.up(event(0,0));
 controls.down(event(0,0));controls.cancel(event(0,0));controls.up(event(0,0));
 controls.down(event(0,0));controls.down(event(30,0,{pointerId:2}));controls.move(event(60,0,{pointerId:2}));controls.up(event(0,0));controls.up(event(60,0,{pointerId:2}));
 assert.equal(taps.length,1);
});
test('fixed viewer axes follow every drag direction across 512 orientations, including roll and poles',()=>{
 const {camera,controls}=setup();
 for(let x=0;x<8;x++)for(let y=0;y<8;y++)for(let z=0;z<8;z++){
  const start=new THREE.Quaternion().setFromEuler(new THREE.Euler(x*Math.PI/4,y*Math.PI/4,z*Math.PI/4));
  for(const [dx,dy] of [[20,0],[-20,0],[0,20],[0,-20],[20,20],[-20,20],[20,-20],[-20,-20]]){
   controls.rotation.copy(start);controls.update();
   const point=camera.position.clone().normalize().multiplyScalar(1.5),before=point.clone().project(camera);
   drag(controls,dx,dy);
   const after=point.clone().project(camera),sx=after.x-before.x,sy=before.y-after.y;
   assert.ok(sx*dx+sy*dy>0,`reversed drag at ${x},${y},${z}: ${dx},${dy}`);
   assert.ok(Math.abs(sx*dy-sy*dx)<1e-10,`axis drift at ${x},${y},${z}: ${dx},${dy}`);
   assert.ok(Math.abs(controls.rotation.length()-1)<1e-12);
  }
 }
});
test('X/Y composition can produce Z roll without a Z input',()=>{
 const {controls}=setup();controls.rotation.identity();
 drag(controls,0,Math.PI/2/.008);drag(controls,Math.PI/2/.008,0);drag(controls,0,-Math.PI/2/.008);
 const expected=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI/2);
 assert.ok(controls.rotation.angleTo(expected)<1e-7);
});
test('long diagonal drag is independent of pointer event subdivision',()=>{
 const a=setup().controls,b=setup().controls;
 drag(a,210,-170);
 b.down(event(100,100));for(let i=1;i<=100;i++)b.move(event(100+210*i/100,100-170*i/100));b.up(event(310,-70));
 assert.ok(a.rotation.angleTo(b.rotation)<1e-7);
});

test('held wheel rolls 3 degrees per step on Z without zoom or a face tap',()=>{
 const {camera,controls}=setup(),before=controls.rotation.clone(),position=camera.position.clone(),radius=controls.radius,taps=[];
 controls.addEventListener('tap',e=>taps.push(e));controls.down(event(100,100));
 controls.wheel({deltaY:-120,preventDefault(){}});
 const expected=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/60).multiply(before);
 assert.ok(controls.rotation.angleTo(expected)<1e-7);assert.equal(controls.radius,radius);assert.ok(camera.position.distanceTo(position)<1e-10);
 controls.wheel({deltaY:3,preventDefault(){}});assert.ok(controls.rotation.angleTo(before)<1e-7);
 controls.up(event(100,100));assert.equal(taps.length,0);
 controls.wheel({deltaY:120,preventDefault(){}});assert.ok(controls.radius>radius);assert.ok(controls.rotation.angleTo(before)<1e-7);
});
