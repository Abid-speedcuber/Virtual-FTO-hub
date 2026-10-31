import test from 'node:test';
import assert from 'node:assert/strict';
import {FACES,solvedState,applyMove,inverse,signature,isSolved,scrambleMoves,selected,rotatePoint} from '../src/puzzle.js';
import {FRAMES,transformedNormal,frameForCamera,HOME_POSITION} from '../src/orientation.js';
import * as THREE from 'three';
const solved=solvedState();const initial=signature(solved);
test('128 distinct triangular stickers, 16 per face',()=>{assert.equal(solved.length,128);for(let i=0;i<8;i++)assert.equal(solved.filter(s=>s.color===i).length,16);assert.equal(new Set(solved.map(s=>signature([s]))).size,128);});
for(const face of FACES)for(const layer of ['outer','inner','wide','ultra'])test(`${face.name} ${layer}: order three, inverse and lattice preserved`,()=>{
 const m={normal:face.normal,layer,dir:1};const once=applyMove(solved,m);assert.notEqual(signature(once),initial);
 assert.equal(signature(applyMove(once,inverse(m))),initial);assert.equal(signature(applyMove(applyMove(once,m),m)),initial);
 for(const s of once)for(const v of s.vertices){assert.ok(v.every(Number.isInteger));assert.equal(v.reduce((a,n)=>a+Math.abs(n),0),4);}
 // Every turn is a permutation of the actual surface triangles.
 const key=s=>s.vertices.map(p=>p.join(',')).sort().join(';');assert.deepEqual(once.map(key).sort(),solved.map(key).sort());
});
test('wide equals outer followed by inner',()=>{for(const f of FACES){const base={normal:f.normal,dir:1};assert.equal(signature(applyMove(solved,{...base,layer:'wide'})),signature(applyMove(applyMove(solved,{...base,layer:'outer'}),{...base,layer:'inner'})));}});
test('2000 random turns and complete undo restore every sticker exactly',()=>{const moves=scrambleMoves(2000);const mixed=moves.reduce(applyMove,solved);assert.ok(!isSolved(mixed));const restored=moves.toReversed().map(inverse).reduce(applyMove,mixed);assert.equal(signature(restored),initial);assert.deepEqual(restored,solved);});
test('outer turns 40 stickers, inner turns 24',()=>{for(const f of FACES){assert.equal(solved.filter(s=>selected(s,{normal:f.normal,layer:'outer'})).length,40);assert.equal(solved.filter(s=>selected(s,{normal:f.normal,layer:'inner'})).length,24);}});
test('all 48 CIF/EIF holds map labels bijectively and match the camera',()=>{
 assert.equal(FRAMES.length,48);assert.equal(FRAMES.filter(f=>f.notation==='CIF').length,24);
 for(const expected of FRAMES){
  const normals=FACES.map(f=>transformedNormal(f.normal,expected));
  assert.equal(new Set(normals.map(String)).size,8);
  for(const n of normals)assert.ok(FACES.some(f=>String(f.normal)===String(n)));
  const up=new THREE.Vector3(...FACES.find(f=>f.name===expected.up).normal).normalize();
  const front=new THREE.Vector3(...FACES.find(f=>f.name===expected.front).normal);
  const forward=front.addScaledVector(up,-front.dot(up)).normalize();
  for(const elevation of [-4,0,4]){
   const camera=new THREE.PerspectiveCamera();camera.position.copy(forward).multiplyScalar(9).addScaledVector(up,elevation);camera.up.copy(up);camera.lookAt(0,0,0);
   assert.deepEqual(frameForCamera(camera),expected,`${expected.up},${expected.front} at elevation ${elevation}`);
  }
 }
});
test('reported square holds and EIF hold label the physical faces correctly',()=>{
 const mapping=(up,front)=>Object.fromEntries(FACES.map(f=>[f.name,transformedNormal(f.normal,FRAMES.find(h=>h.up===up&&h.front===front)).join() ]));
 const square=mapping('R','L');
 assert.equal(square.U,FACES.find(f=>f.name==='R').normal.join());
 assert.equal(square.F,FACES.find(f=>f.name==='L').normal.join());
 assert.equal(square.L,FACES.find(f=>f.name==='B').normal.join());
 assert.equal(square.R,FACES.find(f=>f.name==='U').normal.join());
 const eif=mapping('L','BL');
 assert.equal(eif.U,FACES.find(f=>f.name==='L').normal.join());
 assert.equal(eif.F,FACES.find(f=>f.name==='BL').normal.join());
 assert.equal(eif.L,FACES.find(f=>f.name==='D').normal.join());
 assert.equal(eif.R,FACES.find(f=>f.name==='F').normal.join());
});

test('physical partition has 86 pieces: 6 corners, 24 edges, 56 centers',()=>{
 const groups=new Map();for(const sticker of solved){const c=[0,1,2].map(i=>sticker.vertices.reduce((s,v)=>s+v[i],0)/3);const key=FACES.map(f=>{const v=c.reduce((s,n,i)=>s+n*f.normal[i],0);return v<-2?0:v<0?1:v<2?2:3;}).join();groups.set(key,(groups.get(key)||0)+1);}
 assert.equal(groups.size,86);assert.deepEqual([...groups.values()].reduce((a,n)=>(a[n]=(a[n]||0)+1,a),{}),{1:56,2:24,4:6});
});

test('rendered rotation agrees with integer turn for every axis and direction',()=>{
 for(const f of FACES)for(const dir of [-1,1]){const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...f.normal).normalize(),-dir*2*Math.PI/3);
 for(const point of [[4,0,0],[1,-2,1],[-3,0,1]]){const visual=new THREE.Vector3(...point).applyQuaternion(q).toArray();const exact=rotatePoint(point,f.normal,dir);visual.forEach((n,i)=>assert.ok(Math.abs(n-exact[i])<1e-12));}}
});

test('ultra wide turns exactly three layers, leaving the opposite outer layer untouched',()=>{
 for(const f of FACES){
  const move={normal:f.normal,layer:'ultra',dir:1},opposite=f.normal.map(v=>-v);
  assert.equal(solved.filter(s=>selected(s,move)).length,88);
  for(const sticker of solved)assert.notEqual(selected(sticker,move),selected(sticker,{normal:opposite,layer:'outer'}));
  const composed=applyMove(applyMove(solved,{...move,layer:'wide'}),{normal:opposite,layer:'inner',dir:-1});
  assert.equal(signature(applyMove(solved,move)),signature(composed));
 }
});

test('CIF front with a visible D keeps the hidden upper face U, across all 24 holds',()=>{
 for(const expected of FRAMES.filter(f=>f.notation==='CIF')){
  const up=new THREE.Vector3(...FACES.find(f=>f.name===expected.up).normal).normalize();
  const front=new THREE.Vector3(...FACES.find(f=>f.name===expected.front).normal);
  const forward=front.clone().addScaledVector(up,-front.dot(up)).normalize();
  for(const elevation of [-.1,-.3,-.5])for(const roll of [-.1,0,.1]){
   const camera=new THREE.PerspectiveCamera();camera.position.copy(forward).addScaledVector(up,elevation).multiplyScalar(9);camera.up.copy(up);camera.lookAt(0,0,0);camera.rotateZ(roll);camera.updateMatrixWorld();
   const actual=frameForCamera(camera);
   assert.deepEqual(actual,expected,`${expected.up},${expected.front}, elevation ${elevation}, roll ${roll}`);
   const towardCamera=camera.position.clone().normalize();
   assert.ok(up.dot(towardCamera)<0,'U must be hidden in this fixture');
   assert.ok(up.clone().negate().dot(towardCamera)>0,'D must be visible');
  }
 }
});
test('white-front CIF maps blue L, red R and purple D with gray U hidden',()=>{
 const camera=new THREE.PerspectiveCamera();camera.position.copy(HOME_POSITION);camera.lookAt(0,0,0);
 const frame=frameForCamera(camera);
 assert.equal(frame.notation,'CIF');assert.equal(frame.up,'B');assert.equal(frame.front,'U');
 const physical=name=>transformedNormal(FACES.find(f=>f.name===name).normal,frame);
 assert.deepEqual(physical('F'),[1,1,1]);assert.deepEqual(physical('L'),[-1,1,1]);
 assert.deepEqual(physical('R'),[1,1,-1]);assert.deepEqual(physical('D'),[1,-1,1]);
 assert.ok(new THREE.Vector3(...physical('U')).dot(camera.position)<0);
});
