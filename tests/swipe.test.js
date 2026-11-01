import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {swipeMove} from '../src/swipe.js';
import {FACES,solvedState,centroid,dot,selected} from '../src/puzzle.js';

test('projected swipes choose the physical slice and reverse with the drag across sizes and holds',()=>{
 for(const size of [2,3,4,9,20])for(const face of FACES){
  const stickers=solvedState(size).filter(s=>s.color===FACES.indexOf(face));
  // Sample both triangle orientations and an off-center row.
  for(const sticker of [stickers[0],stickers[1],stickers[Math.floor(stickers.length*.6)]]){
   const point=new THREE.Vector3(...centroid(sticker.vertices)).multiplyScalar(2/size);
   for(const roll of [0,.8,2.5]){
    const normal=new THREE.Vector3(...face.normal).normalize();
    const camera=new THREE.PerspectiveCamera(36,1.3,.1,100);camera.position.copy(normal).multiplyScalar(9);camera.lookAt(0,0,0);camera.rotateZ(roll);camera.updateMatrixWorld();
    for(const axis of FACES.filter(f=>dot(f.normal,face.normal)===1)){
     const tangent=new THREE.Vector3(...axis.normal).normalize().cross(point).negate();
     const start=point.clone().project(camera),end=point.clone().addScaledVector(tangent,.01).project(camera);
     const dx=(end.x-start.x)*650,dy=-(end.y-start.y)*500;
     const move=swipeMove({point,normal:face.normal},dx,dy,camera,650,500,size);
     assert.deepEqual(move.normal,axis.normal);assert.equal(move.dir,1);assert.ok(selected(sticker,move));
     const reverse=swipeMove({point,normal:face.normal},-dx,-dy,camera,650,500,size);
     assert.deepEqual(reverse,{...move,dir:-1});
    }
   }
  }
 }
});
