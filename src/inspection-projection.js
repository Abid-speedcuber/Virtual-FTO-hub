import * as THREE from 'three';
import {FACES,normalOf} from './puzzle.js';

const faceIndices=new Map(FACES.map((face,index)=>[face.normal.join(','),index]));
export const PROJECTION_OFFSET=.55;
const normals=FACES.map(face=>new THREE.Vector3(...face.normal).normalize());

// Offset the actual rear-face geometry along its outward normal. No screen-space
// flattening, inverse angle, or chosen hinge: this stays continuous through rolls
// and pole views, with exactly the same camera and projection as the puzzle.
export function projectionGeometry(size,state){
 const faces=FACES.map(face=>({positions:face.normal.flatMap((sign,axis)=>[0,1,2].map(i=>i===axis?2*sign:0)),colors:[-1]}));
 for(const sticker of state){
  const index=faceIndices.get(normalOf(sticker).join(',')),face=faces[index],normal=normals[index];
  const points=sticker.vertices.map(vertex=>vertex.map(value=>value*2/size));
  const center=[0,1,2].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/3);
  for(const point of points)face.positions.push(...point.map((value,axis)=>center[axis]+(value-center[axis])*.935-normal.getComponent(axis)*.003));
  face.colors.push(sticker.color);
 }
 return faces;
}
export function projectionOpacity(normal,cameraPosition){
 const length=Math.hypot(...cameraPosition);if(!length)return 0;
 const facing=normal.reduce((sum,n,i)=>sum+n*cameraPosition[i]/length,0);
 // Fade before grazing incidence instead of letting a rear sheet flash into a
 // front-facing copy or an edge-on sliver. Never divide by the facing angle.
 const t=Math.max(0,Math.min(1,(-facing-.015)/.16));return t*t*(3-2*t);
}
export class InspectionProjection{
 constructor(scene){this.root=new THREE.Group();this.root.visible=false;scene.add(this.root);this.meshes=[];}
 setVisible(visible){this.root.visible=visible;}
 render({size,state,colors,camera}){
  if(!this.root.visible)return;
  const palette=FACES.map(face=>colors[face.name]),key=palette.join(',');
  if(this.state!==state||this.size!==size||this.paletteKey!==key){
   this.state=state;this.size=size;this.paletteKey=key;
   const paletteRGB=[new THREE.Color('#080e11'),...palette.map(color=>new THREE.Color(color))];
   projectionGeometry(size,state).forEach((face,index)=>{
    let mesh=this.meshes[index];
    if(!mesh){
     mesh=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,depthWrite:true,forceSinglePass:true}));
     mesh.position.copy(normals[index]).multiplyScalar(PROJECTION_OFFSET);mesh.frustumCulled=false;mesh.userData.face=index;this.meshes[index]=mesh;this.root.add(mesh);
    }
    const rgb=face.colors.flatMap(color=>Array.from({length:3},()=>paletteRGB[color+1].toArray()).flat());
    // An inspection state is static between turns; orbiting only updates opacity.
    if(mesh.geometry.getAttribute('position')?.count!==face.positions.length/3){
     mesh.geometry.dispose();mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(face.positions,3));mesh.geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
    }else{
     mesh.geometry.attributes.position.array.set(face.positions);mesh.geometry.attributes.position.needsUpdate=true;
     mesh.geometry.attributes.color.array.set(rgb);mesh.geometry.attributes.color.needsUpdate=true;
    }
   });
  }
  const position=camera.position.toArray();this.meshes.forEach((mesh,index)=>{const opacity=projectionOpacity(normals[index].toArray(),position);mesh.visible=opacity>0;mesh.material.opacity=opacity;});
 }
 dispose(){for(const mesh of this.meshes){mesh.geometry.dispose();mesh.material.dispose();}this.root.removeFromParent();}
}
