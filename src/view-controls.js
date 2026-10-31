import * as THREE from 'three';

// Store the puzzle-to-view rotation. Drag deltas premultiply it about fixed
// viewer X/Y axes, never the puzzle's rotated local axes. The inverse rotation
// orbits the camera, leaving exact puzzle geometry and move coordinates intact.
export class ViewControls extends THREE.EventDispatcher {
 constructor(camera,element){
  super();this.camera=camera;this.element=element;this.pointers=new Map();this.minDistance=6;this.maxDistance=20;
  this.setPosition(camera.position);
  element.addEventListener('pointerdown',e=>this.down(e));
  element.addEventListener('pointermove',e=>this.move(e));
  element.addEventListener('pointerup',e=>this.up(e));
  element.addEventListener('pointercancel',e=>this.cancel(e));
  element.addEventListener('lostpointercapture',e=>this.cancel(e));
  element.addEventListener('wheel',e=>this.wheel(e),{passive:false});
  element.addEventListener('contextmenu',e=>e.preventDefault());
 }
 setPosition(position){
  this.radius=position.length();this.camera.position.copy(position);
  this.camera.up.set(0,1,0);this.camera.lookAt(0,0,0);
  this.rotation=this.camera.quaternion.clone().invert();this.update();
 }
 update(){
  const q=this.rotation.clone().invert();
  this.camera.position.set(0,0,this.radius).applyQuaternion(q);this.camera.quaternion.copy(q);
  this.camera.up.set(0,1,0).applyQuaternion(q);this.camera.updateMatrixWorld();this.dispatchEvent({type:'change'});
 }
 rotate(dx,dy){
  const distance=Math.hypot(dx,dy);if(!distance)return;
  // An infinitesimal X/Y rotation has no Z component. Accumulating successive
  // X and Y rotations can produce roll, as real world-axis rotations should.
  const delta=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dy,dx,0).divideScalar(distance),distance*.008);
  this.rotation.premultiply(delta).normalize();this.update();
 }
 wheel(e){
  e.preventDefault();if(!e.deltaY)return;
  if([...this.pointers.values()].some(p=>p.button!==1)){
   // One wheel step rolls 3 degrees around the fixed viewer Z axis.
   // Releasing after a roll is an orbit gesture, not a face click.
   for(const p of this.pointers.values())p.moved=true;
   const delta=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.sign(e.deltaY)*Math.PI/60);
   this.rotation.premultiply(delta).normalize();this.update();
  }else this.zoom(Math.exp(e.deltaY*.001));
 }
 zoom(factor){this.radius=THREE.MathUtils.clamp(this.radius*factor,this.minDistance,this.maxDistance);this.update();}
 down(e){
  if(![0,1,2].includes(e.button))return;
  e.preventDefault();this.element.setPointerCapture(e.pointerId);
  this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,moved:false});
  if(this.pointers.size>1)for(const p of this.pointers.values())p.moved=true;
 }
 move(e){
  const p=this.pointers.get(e.pointerId);if(!p)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;
  const wasMoved=p.moved;
  if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>5)p.moved=true;
  if(this.pointers.size===2){
   const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)[1];
   const before=Math.hypot(p.x-other.x,p.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);
   if(before>0&&after>0)this.zoom(before/after);
  }else if(this.pointers.size===1&&p.moved){
   const mx=wasMoved?dx:e.clientX-p.startX,my=wasMoved?dy:e.clientY-p.startY;
   if(p.button===1)this.zoom(Math.exp(my*.01));
   else this.rotate(mx,my);
  }
  p.x=e.clientX;p.y=e.clientY;
 }
 up(e){
  const p=this.pointers.get(e.pointerId);this.pointers.delete(e.pointerId);
  if(this.element.hasPointerCapture(e.pointerId))this.element.releasePointerCapture(e.pointerId);
  if(p&&!p.moved&&Math.hypot(e.clientX-p.startX,e.clientY-p.startY)<=5&&p.button!==1)
   this.dispatchEvent({type:'tap',x:e.clientX,y:e.clientY,button:p.button,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey});
 }
 cancel(e){this.pointers.delete(e.pointerId);}
}
