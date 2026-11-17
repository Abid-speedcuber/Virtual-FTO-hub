import * as THREE from 'three';
import {selected} from './puzzle.js';
import {bodyGeometry} from './body-geometry.js';
import {parallelBands} from './parallel-turns.js';

// Keep GPU buffers alive across turns. Stickers share a mesh per color and
// physical band; animation changes group transforms, never sticker vertices.
export class PuzzleMeshes{
 constructor(parent,materials,bodyMaterial,{gap=.935}={}){
  this.root=new THREE.Group();parent.add(this.root);this.materials=materials;this.bodyMaterial=bodyMaterial;this.gap=gap;
  this.pool=[];this.groups=[];this.bands=[];this.bodies=[];this.dimMaterials=[];this.bodyCache=new Map();
 }
 update(size,state,moves=[],selection=null){
  const key=JSON.stringify([size,moves.map(m=>[m.normal,m.layer,m.depth,m.count])]);
  const selectionKey=selection?[...selection].sort((a,b)=>a-b).join(','):null;
  if(this.state===state&&this.key===key&&this.selectionKey===selectionKey)return;
  this.state=state;this.key=key;this.selectionKey=selectionKey;
  this.bands=moves.length?parallelBands(size,moves):[{move:null,turns:[]}];
  for(const group of this.groups){group.clear();group.visible=false;group.quaternion.identity();}
  for(const mesh of this.pool)mesh.visible=false;
  this.bands.forEach((band,i)=>{
   if(!this.groups[i]){this.groups[i]=new THREE.Group();this.root.add(this.groups[i]);}
   this.groups[i].visible=true;
  });
  let used=0;
  const write=(positions,material,group)=>{
   if(!positions.length)return null;
   let mesh=this.pool[used++];
   if(!mesh){mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);mesh.frustumCulled=false;this.pool.push(mesh);}
   let attribute=mesh.geometry.getAttribute('position');
   if(!attribute||attribute.array.length<positions.length){
    // Dispose only when growing a buffer, so Three also frees the old GPU buffer.
    if(attribute)mesh.geometry.dispose();
    const capacity=2**Math.ceil(Math.log2(Math.max(positions.length,9)));
    attribute=new THREE.BufferAttribute(new Float32Array(capacity),3).setUsage(THREE.DynamicDrawUsage);mesh.geometry.setAttribute('position',attribute);
   }
   attribute.array.set(positions);attribute.needsUpdate=true;mesh.geometry.setDrawRange(0,positions.length/3);
   mesh.material=material;mesh.visible=true;mesh.quaternion.identity();group.add(mesh);return mesh;
  };
  this.bodies=this.bands.map((band,i)=>{
   const cacheKey=JSON.stringify([size,band.move]);let body=this.bodyCache.get(cacheKey);
   if(!body){body=bodyGeometry(size,band.move);if(this.bodyCache.size>=128)this.bodyCache.delete(this.bodyCache.keys().next().value);this.bodyCache.set(cacheKey,body);}
   return {mesh:write(band.move?body.turning:body.stationary,this.bodyMaterial,this.groups[i]),band,group:this.groups[i]};
  }).filter(b=>b.mesh);
  const positions=this.bands.map(()=>Array.from({length:selection?16:8},()=>[]));
  const scale=2/size,gap=this.gap;
  for(const sticker of state){
   const section=this.bands.length===1?0:this.bands.findIndex(band=>selected(sticker,band.move));
   const color=sticker.color+(selection&&!selection.has(sticker.id)?8:0),out=positions[section][color],vertices=sticker.vertices;
   const center=[0,1,2].map(axis=>(vertices[0][axis]+vertices[1][axis]+vertices[2][axis])*scale/3);
   for(const vertex of vertices)for(let axis=0;axis<3;axis++)out.push((vertex[axis]*scale-center[axis])*gap+center[axis]);
  }
  positions.forEach((colors,section)=>colors.forEach((pos,color)=>{
   let material=this.materials[color%8];
   if(color>=8){if(!this.dimMaterials[color-8])this.dimMaterials[color-8]=material.clone();material=this.dimMaterials[color-8];material.color.copy(this.materials[color-8].color).multiplyScalar(.24);}
   write(pos,material,this.groups[section]);
  }));
 }
 rotate(angles){this.bands.forEach((band,i)=>{
  if(band.move)this.groups[i].quaternion.setFromAxisAngle(new THREE.Vector3(...band.move.normal).normalize(),angles(band));
 });}
 refreshDimColors(){this.dimMaterials.forEach((material,i)=>material.color.copy(this.materials[i].color).multiplyScalar(.24));}
 dispose(){for(const mesh of this.pool)mesh.geometry.dispose();for(const material of this.dimMaterials)material.dispose();this.root.removeFromParent();}
}
