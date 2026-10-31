import test from 'node:test';
import assert from 'node:assert/strict';
import {COLORS,FACES,dot} from '../src/puzzle.js';
const face=color=>FACES.find(f=>f.color===COLORS[color]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

test('DaYan scheme has the correct opposites and counterclockwise white-face neighbors',()=>{
 for(const [a,b] of [['white','yellow'],['red','orange'],['blue','green'],['purple','gray']]){
  assert.equal(dot(face(a).normal,face(b).normal),-3,`${a}/${b} are not opposite`);
 }
 const white=face('white').normal;
 for(const [a,b] of [['red','blue'],['blue','purple'],['purple','red']]){
  assert.equal(dot(white,face(a).normal),1,`${a} must share an edge with white`);
  assert.ok(dot(white,cross(face(a).normal,face(b).normal))>0,`${a} -> ${b} must be counterclockwise from outside white`);
 }
 for(const [a,b,middle] of [['red','blue','gray'],['blue','purple','orange'],['purple','red','green']]){
  assert.equal(dot(face(a).normal,face(middle).normal),1);
  assert.equal(dot(face(b).normal,face(middle).normal),1);
 }
 const orbits=[1,-1].map(parity=>FACES.filter(f=>f.normal.reduce((p,n)=>p*n,1)===parity).map(f=>Object.keys(COLORS).find(c=>COLORS[c]===f.color)).sort());
 assert.deepEqual(orbits,[['gray','green','orange','white'],['blue','purple','red','yellow']]);
});
