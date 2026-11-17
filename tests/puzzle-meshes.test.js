import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PuzzleMeshes} from '../src/puzzle-meshes.js';
import {FACES,solvedState,selected,applyMove} from '../src/puzzle.js';

const fixture=()=>{
 const scene=new THREE.Scene(),materials=FACES.map(f=>new THREE.MeshBasicMaterial({color:f.color})),body=new THREE.MeshBasicMaterial();
 const meshes=new PuzzleMeshes(scene,materials,body);return {scene,meshes,materials,dispose:()=>{meshes.dispose();materials.forEach(m=>m.dispose());body.dispose();}};
};
test('batched geometry preserves every sticker and parallel band transforms',()=>{
 const {scene,meshes,dispose}=fixture(),size=4,state=solvedState(size),moves=[{normal:[1,1,1],layer:'slice',depth:1,count:2,dir:1},{normal:[-1,-1,-1],layer:'outer',dir:-1}];
 meshes.update(size,state,moves);meshes.rotate(band=>band.turns.reduce((angle,t)=>angle-t.sign*moves[t.index].dir*Math.PI/3,0));scene.updateMatrixWorld(true);
 const actual=[];
 for(const mesh of meshes.pool.filter(m=>m.visible&&!meshes.bodies.some(b=>b.mesh===m))){
  const a=mesh.geometry.getAttribute('position');for(let i=0;i<mesh.geometry.drawRange.count;i++)actual.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld).toArray());
 }
 const expected=[];
 for(const sticker of state){
  const points=sticker.vertices.map(v=>new THREE.Vector3(...v).multiplyScalar(2/size)),center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(3);
  const rotations=moves.filter(m=>selected(sticker,m)).map(m=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...m.normal).normalize(),-m.dir*Math.PI/3));
  for(const p of points){p.sub(center).multiplyScalar(.935).add(center);rotations.forEach(q=>p.applyQuaternion(q));expected.push(p.toArray());}
 }
 const key=v=>v.map(n=>Math.round(n*1e5)).join(',');assert.deepEqual(actual.map(key).sort(),expected.map(key).sort());dispose();
});
test('stationary replay frames reuse all buffers, and live turns retain warmed buffers',()=>{
 const {meshes,dispose}=fixture(),move={normal:[1,1,1],layer:'outer',dir:1};let state=solvedState(3);meshes.update(3,state,[move]);
 const buffers=meshes.pool.map(m=>m.geometry.getAttribute('position').array);let disposed=0;meshes.pool.forEach(m=>m.geometry.addEventListener('dispose',()=>disposed++));
 for(let i=0;i<20;i++){meshes.update(3,state,[move]);meshes.rotate(()=>i*.01);}
 assert.deepEqual(meshes.pool.map(m=>m.geometry.getAttribute('position').array),buffers);assert.equal(disposed,0);
 // Warm the maximum capacities before checking stable turn-to-turn reuse.
 for(let i=0;i<6;i++){state=applyMove(state,move);meshes.update(3,state,[]);}disposed=0;
 for(let i=0;i<6;i++){state=applyMove(state,move);meshes.update(3,state,[]);}assert.equal(disposed,0);dispose();
});
test('selection dims only unselected stickers and changing size removes stale geometry',()=>{
 const {meshes,materials,dispose}=fixture(),state=solvedState(4);meshes.update(4,state,[],new Set([0]));
 const selectedMeshes=meshes.pool.filter(m=>m.visible&&m.material===materials[0]);assert.equal(selectedMeshes.reduce((n,m)=>n+m.geometry.drawRange.count,0),3);
 assert.ok(meshes.dimMaterials[0].color.equals(materials[0].color.clone().multiplyScalar(.24)));
 meshes.update(2,solvedState(2));const count=meshes.pool.filter(m=>m.visible&&!meshes.bodies.some(b=>b.mesh===m)).reduce((n,m)=>n+m.geometry.drawRange.count,0);assert.equal(count,solvedState(2).length*3);dispose();
});
