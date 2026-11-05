import * as THREE from 'three';
import {FACES,solvedState,selected} from './puzzle.js';
import {ViewControls} from './view-controls.js';
import {bodyGeometry} from './body-geometry.js';
import {parallelBands} from './parallel-turns.js';
import {HOME_POSITION} from './orientation.js';

// A self-contained viewer for checkpoint editing and recorded solves.
export class PuzzleViewer{
 constructor(host,{onSelect=null}={}){
  this.host=host;this.onSelect=onSelect;this.size=3;this.state=solvedState(3);this.selection=null;this.meshes=[];
  this.scene=new THREE.Scene();this.bodies=[];this.bodyKey='';this.camera=new THREE.PerspectiveCamera(36,1,.1,100);this.camera.position.copy(HOME_POSITION).multiplyScalar(.78);this.camera.lookAt(0,0,0);
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(this.renderer.domElement);
  this.renderer.domElement.setAttribute('aria-label',onSelect?'Orbitable FTO. Drag to orbit; click a piece to select it.':'Recorded FTO solve');
  this.controls=new ViewControls(this.camera,this.renderer.domElement,{mode:'legacy'});
  this.controls.addEventListener('change',()=>this.draw());
  this.controls.addEventListener('tap',event=>{
   if(!this.onSelect)return;
   const box=this.renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
   ray.setFromCamera(new THREE.Vector2((event.x-box.left)/box.width*2-1,-(event.y-box.top)/box.height*2+1),this.camera);
   // Pick full sticker triangles, so the decorative gaps are still clickable.
   const point=new THREE.Vector3();let picked=null,distance=Infinity;
   for(const sticker of this.state){
    const vertices=sticker.vertices.map(v=>new THREE.Vector3(...v).multiplyScalar(2/this.size));
    if(ray.ray.intersectTriangle(...vertices,false,point)){
     const d=point.distanceToSquared(ray.ray.origin);if(d<distance){distance=d;picked=sticker.id;}
    }
   }
   if(picked!==null)this.onSelect(picked);
  });
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);
 }
 resize(){const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height);this.draw();}
 setView(view){if(!view)return;this.controls.rotation.fromArray(view.rotation);this.controls.radius=view.radius;this.controls.update();}
 view(){return {rotation:this.controls.rotation.toArray(),radius:this.controls.radius};}
 face(normal){const target=new THREE.Vector3(...normal).normalize().multiplyScalar(10);this.controls.setPosition(target);}
 setPuzzle(size,state=solvedState(size),selection=null,motions=[]){this.size=size;this.state=state;this.selection=selection;this.render(motions);}
 render(motions=[]){
  const bodyKey=JSON.stringify([this.size,motions.map(m=>m.move)]);
  if(bodyKey!==this.bodyKey){
   this.bodyKey=bodyKey;for(const body of this.bodies){this.scene.remove(body.mesh);body.mesh.geometry.dispose();body.mesh.material.dispose();}
   const bands=motions.length?parallelBands(this.size,motions.map(m=>m.move)):[null];
   this.bodies=bands.map(band=>{
    const positions=band?bodyGeometry(this.size,band.move).turning:bodyGeometry(this.size).stationary;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#080e11',side:THREE.DoubleSide}));this.scene.add(mesh);return {mesh,band};
   });
  }
  for(const {mesh,band} of this.bodies){
   if(!band)continue;const angle=band.turns.reduce((n,t)=>{const m=motions[t.index],p=m.progress;return n-t.sign*m.move.dir*2*Math.PI/3*p*p*(3-2*p);},0);
   mesh.quaternion.setFromAxisAngle(new THREE.Vector3(...band.move.normal).normalize(),angle);
  }
  if(this.meshes.length!==this.state.length){for(const mesh of this.meshes){this.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}this.meshes=[];}
  for(const sticker of this.state){
   const points=sticker.vertices.map(v=>new THREE.Vector3(...v).multiplyScalar(2/this.size)),center=points.reduce((a,p)=>a.add(p),new THREE.Vector3()).divideScalar(3);
   const rotations=motions.filter(m=>selected(sticker,m.move)).map(m=>new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...m.move.normal).normalize(),-m.move.dir*2*Math.PI/3*(m.progress*m.progress*(3-2*m.progress))));
   const vertices=points.flatMap(p=>{p.sub(center).multiplyScalar(.93).add(center);for(const rotation of rotations)p.applyQuaternion(rotation);return p.toArray();});
   const chosen=!this.selection||this.selection.has(sticker.id),color=new THREE.Color(this.colors?.[sticker.color]??FACES[sticker.color].color);if(!chosen)color.multiplyScalar(.24);
   let mesh=this.meshes[sticker.id];
   if(!mesh){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));mesh.frustumCulled=false;mesh.userData.id=sticker.id;this.meshes[sticker.id]=mesh;this.scene.add(mesh);
   }else{mesh.geometry.attributes.position.array.set(vertices);mesh.geometry.attributes.position.needsUpdate=true;mesh.material.color.copy(color);}
  }
  this.draw();
 }
 draw(){this.renderer.render(this.scene,this.camera);}
 dispose(){this.controls.cancelAll();this.observer.disconnect();for(const mesh of this.meshes){mesh.geometry.dispose();mesh.material.dispose();}for(const mesh of this.scene.children)if(!this.meshes.includes(mesh)){mesh.geometry?.dispose();mesh.material?.dispose();}this.renderer.dispose();this.renderer.forceContextLoss();this.host.replaceChildren();}
}

// Stickers on different faces sharing an outside edge belong to one piece.
export function pieceGroups(size){
 const state=solvedState(size),parent=state.map(s=>s.id),edges=new Map(),root=id=>parent[id]===id?id:parent[id]=root(parent[id]);
 for(const s of state)for(let i=0;i<3;i++){
  const key=[s.vertices[i].join(','),s.vertices[(i+1)%3].join(',')].sort().join('|');
  const other=edges.get(key);if(other&&other.color!==s.color)parent[root(s.id)]=root(other.id);else if(!other)edges.set(key,s);
 }
 const groups=new Map();for(const s of state){const id=root(s.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(s.id);}
 return new Map(state.map(s=>[s.id,groups.get(root(s.id))]));
}
