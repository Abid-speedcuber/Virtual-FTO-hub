import * as THREE from 'three';
import {FACES,dot} from './puzzle.js';

// A triangular face has three row directions. Score their projected rotation
// tangents, using the physical hit point rather than the view-relative labels.
export function swipeMove(hit,dx,dy,camera,width,height,size){
 const drag=new THREE.Vector2(dx,dy).normalize();
 const start=hit.point.clone().project(camera);let best=null;
 for(const face of FACES){
  if(dot(face.normal,hit.normal)!==1)continue;
  const axis=new THREE.Vector3(...face.normal).normalize();
  const tangent=axis.clone().cross(hit.point).negate();
  const end=hit.point.clone().addScaledVector(tangent,.01).project(camera);
  const screen=new THREE.Vector2((end.x-start.x)*width,-(end.y-start.y)*height);
  if(screen.length()<1e-8)continue;
  const alignment=screen.normalize().dot(drag);
  const depth=THREE.MathUtils.clamp(Math.floor((size-hit.point.dot(new THREE.Vector3(...face.normal))*size/2)/2+1e-7)+1,1,size);
  if(!best||Math.abs(alignment)>best.score)best={normal:[...face.normal],depth,count:1,layer:'slice',dir:alignment>0?1:-1,score:Math.abs(alignment)};
 }
 if(!best)return null;
 const {score,...move}=best;return move;
}
