import * as THREE from 'three';
import {FACES,dot} from './puzzle.js';

// Project the three possible row directions once, when the pointer lands.
// The gesture can then be classified without raycasting or projecting again.
export function swipeCandidates(hit,camera,width,height,size){
 const start=hit.point.clone().project(camera),candidates=[];
 for(const face of FACES){
  if(dot(face.normal,hit.normal)!==1)continue;
  const normal=new THREE.Vector3(...face.normal),axis=normal.clone().normalize();
  const tangent=axis.cross(hit.point).negate();
  const end=hit.point.clone().addScaledVector(tangent,.01).project(camera);
  const screen=new THREE.Vector2((end.x-start.x)*width,-(end.y-start.y)*height);
  if(screen.length()<1e-8)continue;
  const depth=THREE.MathUtils.clamp(Math.floor((size-hit.point.dot(normal)*size/2)/2+1e-7)+1,1,size);
  candidates.push({move:{normal:[...face.normal],depth,count:1,layer:'slice'},direction:screen.normalize(),outer:depth===1||depth===size});
 }
 return candidates;
}

export function chooseSwipeMove(candidates,dx,dy,outerBias=0){
 if(!Math.hypot(dx,dy))return null;
 const drag=new THREE.Vector2(dx,dy).normalize();let best=null;
 const hasOuter=candidates.some(candidate=>candidate.outer);
 // At maximum bias an inner slice must beat an outer turn by 30 degrees.
 // Interior stickers with no outer candidate keep their full directional range.
 const penalty=THREE.MathUtils.clamp(outerBias,0,1)*Math.PI/6;
 for(const candidate of candidates){
  const alignment=candidate.direction.dot(drag);
  const error=Math.acos(THREE.MathUtils.clamp(Math.abs(alignment),0,1))+(hasOuter&&!candidate.outer?penalty:0);
  if(!best||error<best.error)best={error,move:{...candidate.move,dir:alignment>0?1:-1}};
 }
 return best?.move??null;
}

export function swipeMove(hit,dx,dy,camera,width,height,size,outerBias=0){
 return chooseSwipeMove(swipeCandidates(hit,camera,width,height,size),dx,dy,outerBias);
}
