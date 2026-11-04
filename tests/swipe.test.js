import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {swipeMove,swipeCandidates,chooseSwipeMove} from '../src/swipe.js';
import {FACES,solvedState,centroid,dot,selected} from '../src/puzzle.js';
import {FRAMES,transformedNormal} from '../src/orientation.js';

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


test('100 percent outer bias allows only outer turns on edge stickers and preserves interior gestures',()=>{
 const camera=new THREE.PerspectiveCamera(36,1.3,.1,100);camera.position.set(6,4.8,7);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 let edges=0,interior=0;
 for(const size of [3,4,9,20])for(const sticker of solvedState(size)){
  const point=new THREE.Vector3(...centroid(sticker.vertices)).multiplyScalar(2/size);
  const candidates=swipeCandidates({point,normal:FACES[sticker.color].normal},camera,650,500,size);
  for(const inner of candidates.filter(c=>!c.outer)){
   if(candidates.some(c=>c!==inner&&Math.abs(c.direction.dot(inner.direction))>1-1e-10))continue;
   const [dx,dy]=inner.direction.toArray(),plain=chooseSwipeMove(candidates,dx,dy,0),biased=chooseSwipeMove(candidates,dx,dy,1);
   assert.deepEqual(plain.normal,inner.move.normal);
   if(candidates.some(c=>c.outer)){assert.ok(candidates.find(c=>c.outer&&c.move.normal.every((v,i)=>v===biased.normal[i])));edges++;}
   else{assert.deepEqual(biased.normal,inner.move.normal);interior++;}
   const reverse=chooseSwipeMove(candidates,-dx,-dy,1);assert.deepEqual(reverse,{...biased,dir:-biased.dir});
  }
 }
 assert.ok(edges>0);assert.ok(interior>0);
});


test('CIF U bias favors U only at the shared outer U/F edge and reaches exclusive U at 100 percent',()=>{
 const upNormal=[1,1,1],frontNormal=[1,-1,1];
 const make=(normal,angle,depth=1)=>({move:{normal,depth,count:1,layer:'slice'},direction:new THREE.Vector2(Math.cos(angle),Math.sin(angle)),outer:depth===1});
 const candidates=[make(upNormal,0),make(frontNormal,Math.PI/3)];
 const drag=angle=>[Math.cos(angle),Math.sin(angle)];
 assert.deepEqual(chooseSwipeMove(candidates,...drag(Math.PI/5),0).normal,frontNormal);
 assert.deepEqual(chooseSwipeMove(candidates,...drag(Math.PI/5),0,{upNormal,frontNormal,upBias:1}).normal,upNormal);
 assert.deepEqual(chooseSwipeMove(candidates,...drag(Math.PI/3),0,{upNormal,frontNormal,upBias:.9}).normal,frontNormal);
 for(const sign of [1,-1])assert.deepEqual(chooseSwipeMove(candidates,...drag(Math.PI/5).map(v=>v*sign),0,{upNormal,frontNormal,upBias:0}).normal,frontNormal);
 const lower=[make(upNormal,0,2),make(frontNormal,Math.PI/3)];
 assert.deepEqual(chooseSwipeMove(lower,...drag(Math.PI/5),0,{upNormal,frontNormal,upBias:1}).normal,frontNormal);
 // No CIF frame supplied: EIF and fixed-label holds remain directional.
 assert.deepEqual(chooseSwipeMove(candidates,...drag(Math.PI/5),0,{upBias:1}).normal,frontNormal);
});


test('U bias linearly reduces F angular coverage and makes shared stickers U-only at 100 percent',()=>{
 const upNormal=[1,1,1],frontNormal=[1,-1,1];
 const make=(normal,angle)=>({move:{normal,depth:1,count:1,layer:'slice'},direction:new THREE.Vector2(Math.cos(angle),Math.sin(angle)),outer:true});
 for(const roll of [0,.7,2.4])for(const separation of [.2,1,2.2]){
  const candidates=[make(upNormal,roll+separation),make(frontNormal,roll)];
  for(const bias of [0,.25,.5,.75,.9,.99,1]){
   let fCount=0;
   for(let step=0;step<2000;step++){
    const angle=roll-Math.PI/2+(step+.5)*Math.PI/2000,dx=Math.cos(angle),dy=Math.sin(angle);
    const chosen=chooseSwipeMove(candidates,dx,dy,0,{upNormal,frontNormal,upBias:bias});
    if(chosen.normal.every((v,i)=>v===frontNormal[i]))fCount++;
    const reverse=chooseSwipeMove(candidates,-dx,-dy,0,{upNormal,frontNormal,upBias:bias});
    assert.deepEqual(reverse,{...chosen,dir:-chosen.dir});
   }
   assert.ok(Math.abs(fCount-1000*(1-bias))<=2,`${bias}: F sector has ${fCount} samples`);
  }
  const withInner=[...candidates,{...make([1,1,-1],roll+.5),outer:false,move:{normal:[1,1,-1],depth:2,count:1,layer:'slice'}}];
  for(let angle=0;angle<2*Math.PI;angle+=.05)assert.deepEqual(chooseSwipeMove(withInner,Math.cos(angle),Math.sin(angle),0,{upNormal,frontNormal,upBias:1}).normal,upNormal);
 }
});


test('outer bias proportionally shrinks every inner sector with one or two outer axes',()=>{
 const make=(normal,angle,outer)=>({move:{normal,depth:outer?1:2,count:1,layer:'slice'},direction:new THREE.Vector2(Math.cos(angle),Math.sin(angle)),outer});
 const normal=[1,1,1];
 for(const roll of [0,.8])for(const outerCount of [1,2]){
  const candidates=[make(normal,roll,false),make([1,-1,1],roll+.7,true),make([-1,1,1],roll+2.2,outerCount===2)];
  const count=bias=>{
   const result=new Map(candidates.map(c=>[c,0]));
   for(let step=0;step<3000;step++){
    const angle=roll-Math.PI/2+(step+.5)*Math.PI/3000;
    const move=chooseSwipeMove(candidates,Math.cos(angle),Math.sin(angle),bias);
    const chosen=candidates.find(c=>c.move.normal.every((v,i)=>v===move.normal[i]));
    result.set(chosen,result.get(chosen)+1);
   }
   return result;
  };
  const baseline=count(0);
  for(const bias of [.25,.5,.9,.99,1]){
   const counts=count(bias);
   for(const inner of candidates.filter(c=>!c.outer))assert.ok(Math.abs(counts.get(inner)-baseline.get(inner)*(1-bias))<=2,`${bias}: inner sector should retain ${1-bias}`);
  }
 }
});


test('EIF U bias shrinks BR/BL sectors proportionally and preserves U prime direction',()=>{
 const upNormal=[1,1,1],backNormals=[[1,-1,-1],[-1,1,-1]];
 const make=(normal,angle,depth=1)=>({move:{normal,depth,count:1,layer:'slice'},direction:new THREE.Vector2(Math.cos(angle),Math.sin(angle)),outer:depth===1});
 for(const roll of [0,.7,2]){
  const candidates=[make(upNormal,roll),make(backNormals[0],roll+.8),make(backNormals[1],roll+2.2)];
  const coverage=bias=>{
   const counts=[0,0];
   for(let i=0;i<3000;i++){
    const angle=roll+(i+.5)*Math.PI/3000,dx=Math.cos(angle),dy=Math.sin(angle);
    const move=chooseSwipeMove(candidates,dx,dy,0,{upNormal,backNormals,eifUpBias:bias});
    const index=backNormals.findIndex(n=>n.every((v,j)=>v===move.normal[j]));if(index>=0)counts[index]++;
    const reverse=chooseSwipeMove(candidates,-dx,-dy,0,{upNormal,backNormals,eifUpBias:bias});assert.deepEqual(reverse,{...move,dir:-move.dir});
   }
   return counts;
  };
  const normal=coverage(0);
  for(const bias of [.25,.5,.9,.99,1])coverage(bias).forEach((count,i)=>assert.ok(Math.abs(count-normal[i]*(1-bias))<=2));
  const lower=[make(upNormal,roll,2),...candidates.slice(1)];
  for(const angle of [.8,2.2]){
   const dx=Math.cos(roll+angle),dy=Math.sin(roll+angle);
   assert.deepEqual(chooseSwipeMove(lower,dx,dy,0,{upNormal,backNormals,eifUpBias:1}),chooseSwipeMove(lower,dx,dy,0));
   assert.deepEqual(chooseSwipeMove(candidates,dx,dy,0,{eifUpBias:1}),chooseSwipeMove(candidates,dx,dy,0));
  }
 }
});

test('both top corners on the front face of every EIF hold support exclusive U bias',()=>{
 for(const frame of FRAMES.filter(f=>f.notation==='EIF')){
  const normal=name=>transformedNormal(FACES.find(f=>f.name===name).normal,frame);
  const upNormal=normal('U'),frontNormal=normal('F'),backNormals=['BR','BL'].map(normal);
  const camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.fromArray(frontNormal).multiplyScalar(4).addScaledVector(new THREE.Vector3(...upNormal),2);camera.up.fromArray(upNormal);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const covered=new Set();
  for(const sticker of solvedState(3).filter(s=>FACES[s.color].normal.every((v,i)=>v===frontNormal[i]))){
   const point=new THREE.Vector3(...centroid(sticker.vertices)).multiplyScalar(2/3);
   const candidates=swipeCandidates({point,normal:frontNormal},camera,500,500,3);
   if(!candidates.some(c=>c.move.depth===1&&c.move.normal.every((v,i)=>v===upNormal[i])))continue;
   for(const back of candidates.filter(c=>c.outer&&backNormals.some(n=>n.every((v,i)=>(c.move.depth===1?v:-v)===c.move.normal[i])))){
    covered.add(back.move.normal.join(','));
    const move=chooseSwipeMove(candidates,...back.direction.toArray(),0,{upNormal,backNormals,eifUpBias:1});assert.deepEqual(move.normal,upNormal);
   }
  }
  assert.equal(covered.size,2,`${frame.up}/${frame.front}`);
 }
});
