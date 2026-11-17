import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FACES,solvedState,applyMove,scrambleMoves,normalOf} from '../src/puzzle.js';
import {PROJECTION_OFFSET,projectionGeometry,projectionOpacity,InspectionProjection} from '../src/inspection-projection.js';
const normals=FACES.map(face=>new THREE.Vector3(...face.normal).normalize());
test('rear projection preserves actual sticker geometry and colors on sizes 2 through 20',()=>{
 let seed=327;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let size=2;size<=20;size++){
  const state=scrambleMoves(20,random,size).reduce(applyMove,solvedState(size)),faces=projectionGeometry(size,state);assert.equal(faces.length,8);
  faces.forEach((face,index)=>{
   assert.equal(face.positions.length,(size*size+1)*9);assert.equal(face.colors.length,size*size+1);assert.equal(face.colors[0],-1);
   assert.ok(face.positions.every(Number.isFinite));
   const stickers=state.filter(s=>normalOf(s).every((n,i)=>n===FACES[index].normal[i]));
   stickers.forEach((sticker,i)=>{
    assert.equal(face.colors[i+1],sticker.color);const points=sticker.vertices.map(p=>new THREE.Vector3(...p).multiplyScalar(2/size)),center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(3);
    points.forEach((point,vertex)=>{point.sub(center).multiplyScalar(.935).add(center).addScaledVector(normals[index],-.003);const actual=new THREE.Vector3().fromArray(face.positions,(i+1)*9+vertex*3);assert.ok(point.distanceTo(actual)<1e-12);});
   });
   // Every hint lies outside the original surface, on a separate convex shell.
   // The face patches cannot intersect one another or pierce the main puzzle.
   for(let vertex=0;vertex<face.positions.length;vertex+=3){
    const world=new THREE.Vector3().fromArray(face.positions,vertex).addScaledVector(normals[index],PROJECTION_OFFSET);
    assert.ok(world.dot(normals[index])>2/Math.sqrt(3)+PROJECTION_OFFSET-.01);
    for(const normal of normals)assert.ok(world.dot(normal)<=2/Math.sqrt(3)+PROJECTION_OFFSET+1e-12);
   }
  });
 }
});
test('rear-face visibility is finite, bounded and continuous through poles, tangents and arbitrary rolls',()=>{
 const positions=[[6,0,0],[0,0,20],[0,-6,0],[2,4,-4],[0,0,0]];
 for(let i=0;i<4096;i++){const y=1-2*(i+.5)/4096,a=i*Math.PI*(3-Math.sqrt(5)),r=6+14*(i%17)/16;positions.push([Math.sqrt(1-y*y)*Math.cos(a)*r,y*r,Math.sqrt(1-y*y)*Math.sin(a)*r]);}
 for(const position of positions)for(const normal of normals){const opacity=projectionOpacity(normal.toArray(),position);assert.ok(Number.isFinite(opacity)&&opacity>=0&&opacity<=1);if(normal.dot(new THREE.Vector3(...position))>=0)assert.equal(opacity,0);}
 for(const normal of normals){
  const tangent=new THREE.Vector3(0,1,0).cross(normal).normalize();
  for(let i=-200;i<=200;i++){
   const a=tangent.clone().addScaledVector(normal,i*.001).normalize().multiplyScalar(10),b=a.clone().addScaledVector(normal,1e-7);
   assert.ok(Math.abs(projectionOpacity(normal.toArray(),a.toArray())-projectionOpacity(normal.toArray(),b.toArray()))<1e-5);
  }
 }
});
test('orbiting reuses buffers, changing colors updates them, and disabled projection does no work',()=>{
 const scene=new THREE.Scene(),projection=new InspectionProjection(scene),camera=new THREE.PerspectiveCamera(),state=solvedState(4),colors=Object.fromEntries(FACES.map(f=>[f.name,f.color]));
 projection.render({size:4,state,colors,camera});assert.equal(projection.meshes.length,0);projection.setVisible(true);camera.position.set(5,6,7);projection.render({size:4,state,colors,camera});
 const versions=projection.meshes.map(mesh=>mesh.geometry.attributes.position.version);
 for(let i=0;i<100;i++){camera.position.set(Math.cos(i*.1)*10,3,Math.sin(i*.1)*10);projection.render({size:4,state,colors,camera});}
 assert.deepEqual(projection.meshes.map(mesh=>mesh.geometry.attributes.position.version),versions);assert.equal(projection.meshes.length,8);
 projection.render({size:4,state,colors:{...colors,U:'#123456'},camera});const expected=new THREE.Color('#123456'),actual=projection.meshes[0].geometry.attributes.color;assert.ok(Math.abs(actual.getX(3)-expected.r)<1e-6);
 projection.setVisible(false);assert.equal(projection.root.visible,false);projection.dispose();assert.equal(scene.children.length,0);
});
