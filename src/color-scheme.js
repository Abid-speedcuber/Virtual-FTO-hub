import * as THREE from 'three';
import {FACES,COLORS,solvedState} from './puzzle.js';
import {DEFAULT_CIF_FRAME,defaultCifRotation} from './orientation.js';
import {PuzzleViewer} from './puzzle-viewer.js';
export const CIF_COLOR_FACES=['U','F','R','L','BR','BL','B','D'].map(name=>{
 const index=FACES.findIndex(face=>face.name===name),normal=DEFAULT_CIF_FRAME.normals[index],physical=FACES.find(face=>face.normal.every((value,i)=>value===normal[i]));return {name,physical,normal};
});
export function faceColorLabel(name,value){const color=Object.entries(COLORS).find(([,hex])=>hex.toLowerCase()===value.toLowerCase())?.[0]??(value.toLowerCase()==='#ffffff'?'white':'custom');return `${name} · ${color[0].toUpperCase()+color.slice(1)}`;}
export class ColorSchemeReference{
 constructor(host,onFace){
  this.host=host;this.state=solvedState(3);this.viewer=new PuzzleViewer(host,{onSelect:id=>{const color=this.state.find(sticker=>sticker.id===id).color;onFace(CIF_COLOR_FACES.find(face=>face.physical.name===FACES[color].name).name);}});
  this.viewer.renderer.domElement.setAttribute('aria-label','Reference FTO color scheme. Drag to orbit; select a face to edit.');
  this.labels=CIF_COLOR_FACES.map(face=>{const label=document.createElement('span');label.className='color-reference-label';label.textContent=face.name;label.dataset.face=face.name;host.append(label);return {face,label};});
  this.viewer.controls.addEventListener('change',()=>this.renderLabels());this.observer=new ResizeObserver(()=>this.renderLabels());this.observer.observe(host);this.resetView();
 }
 resetView(){this.viewer.setView({rotation:defaultCifRotation().toArray(),radius:8});this.renderLabels();}
 update(colors){this.viewer.colors=FACES.map(face=>colors[face.name]);this.viewer.setPuzzle(3,this.state);this.renderLabels();}
 renderLabels(){const camera=this.viewer.camera,{width,height}=this.host.getBoundingClientRect();for(const {face,label} of this.labels){const normal=new THREE.Vector3(...face.normal).normalize(),position=normal.clone().multiplyScalar(1.24),visible=normal.dot(camera.position.clone().sub(position))>.5,p=position.project(camera);label.hidden=!visible||p.z>1;label.style.left=`${(p.x*.5+.5)*width}px`;label.style.top=`${(-p.y*.5+.5)*height}px`;}}
 dispose(){this.observer.disconnect();this.viewer.dispose();}
}
