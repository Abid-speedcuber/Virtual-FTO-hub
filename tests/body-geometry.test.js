import test from 'node:test';
import assert from 'node:assert/strict';
import {bodyGeometry} from '../src/body-geometry.js';
import {FACES} from '../src/puzzle.js';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function volume(positions){
 let result=0;
 for(let i=0;i<positions.length;i+=9)result+=dot(positions.slice(i,i+3),cross(positions.slice(i+3,i+6),positions.slice(i+6,i+9)))/6;
 return result;
}
function closed(positions){
 const edges=new Map(),key=p=>p.map(v=>v.toFixed(7)).join(',').replaceAll('-0.0000000','0.0000000');
 for(let i=0;i<positions.length;i+=9){
  const points=[positions.slice(i,i+3),positions.slice(i+3,i+6),positions.slice(i+6,i+9)];
  for(let j=0;j<3;j++){
   const a=key(points[j]),b=key(points[(j+1)%3]),edge=[a,b].sort().join('|');
   const entry=edges.get(edge)??{count:0,balance:0};entry.count++;entry.balance+=a<b?1:-1;edges.set(edge,entry);
  }
 }
 for(const edge of edges.values()){assert.equal(edge.count,2,'each body edge is closed');assert.equal(edge.balance,0,'outward winding agrees');}
}
test('animated bodies partition the full solid into closed stationary and moving sections',()=>{
 const full=bodyGeometry(4);closed(full.stationary);const total=volume(full.stationary);assert.ok(total>0);
 for(const size of [2,3,4,7,20])for(const face of FACES)for(let depth=1;depth<=size;depth++){
  const body=bodyGeometry(size,{normal:face.normal,layer:'slice',depth,count:1});
  closed(body.stationary);closed(body.turning);
  assert.ok(volume(body.stationary)>0);assert.ok(volume(body.turning)>0);
  assert.ok(Math.abs(volume(body.stationary)+volume(body.turning)-total)<1e-10,'no missing or overlapping core volume');
  const lower=(2-4*depth/size)*.998,upper=(2-4*(depth-1)/size)*.998;
  for(let i=0;i<body.turning.length;i+=3){const level=dot(body.turning.slice(i,i+3),face.normal);assert.ok(level>=lower-1e-9&&level<=upper+1e-9);}
 }
});
test('wide and whole-puzzle turns keep closed backing geometry',()=>{
 for(const layer of ['outer','inner','wide','ultra'])for(const size of [2,3,4,20]){
  const body=bodyGeometry(size,{normal:FACES[0].normal,layer});closed(body.stationary);closed(body.turning);
  assert.ok(Math.abs(volume(body.stationary)+volume(body.turning)-volume(bodyGeometry(size).stationary))<1e-10);
 }
});
