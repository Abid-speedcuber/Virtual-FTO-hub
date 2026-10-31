import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {pickFaceNormal} from '../src/picking.js';
import {FACES,solvedState,normalOf} from '../src/puzzle.js';

test('front F sticker gaps cannot pick the hidden U layer',()=>{
 const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 const stickers=solvedState().map(sticker=>{
  const points=sticker.vertices.map(v=>new THREE.Vector3(...v).multiplyScalar(.5));
  const center=points.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/3);
  const positions=points.flatMap(p=>p.clone().sub(center).multiplyScalar(.935).add(center).toArray());
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mesh=new THREE.Mesh(geometry,material);mesh.userData.sticker=sticker;return mesh;
 });
 const origin=new THREE.Vector3(6,4.8,7),point=new THREE.Vector3(.5,1,.5);
 const ray=new THREE.Raycaster(origin,point.sub(origin).normalize());
 // This is the actual failure in the old sticker-only raycast: the gap on
 // white F exposes the back gray face (U in the F/D/L/R hold).
 assert.deepEqual(normalOf(ray.intersectObjects(stickers)[0].object.userData.sticker),[-1,1,-1]);
 assert.deepEqual(pickFaceNormal(ray),[1,1,1]);
 for(const mesh of stickers)mesh.geometry.dispose();material.dispose();
});
test('continuous picking covers sticker seams on every face and misses the background',()=>{
 for(const face of FACES)for(const point of [[.5,.5,1],[.5,1,.5],[1,.5,.5],[2/3,2/3,2/3]]){
  const origin=new THREE.Vector3(...face.normal).multiplyScalar(6),target=new THREE.Vector3(...point.map((v,i)=>v*face.normal[i]));
  const ray=new THREE.Raycaster(origin,target.sub(origin).normalize());
  assert.deepEqual(pickFaceNormal(ray),face.normal);
 }
 assert.equal(pickFaceNormal(new THREE.Raycaster(new THREE.Vector3(0,0,8),new THREE.Vector3(0,1,0))),null);
});
