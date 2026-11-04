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

// Axes repeat every half turn. Find the ordinary directional sector around
// an axis, then contract both boundaries toward that axis by the same fraction.
function axialAngle(a,b){
 const angle=Math.atan2(a.cross(b),a.dot(b));
 return Math.atan2(Math.sin(2*angle),Math.cos(2*angle))/2;
}
function inAngularSector(candidate,others,drag,fraction){
 if(fraction<=0)return false;
 let lower=-Math.PI/2,upper=Math.PI/2;
 for(const other of others){
  if(other===candidate)continue;
  const separation=axialAngle(candidate.direction,other.direction);
  if(Math.abs(separation)<1e-12)return false;
  const midpoint=separation/2,opposite=(separation+(separation>0?-Math.PI:Math.PI))/2;
  lower=Math.max(lower,Math.min(midpoint,opposite));
  upper=Math.min(upper,Math.max(midpoint,opposite));
 }
 const offset=axialAngle(candidate.direction,drag);
 return offset>lower*fraction+1e-12&&offset<upper*fraction-1e-12;
}

export function chooseSwipeMove(candidates,dx,dy,outerBias=0,{upNormal,frontNormal,upBias=0,backNormals=[],eifUpBias=0}={}){
 if(!Math.hypot(dx,dy))return null;
 const drag=new THREE.Vector2(dx,dy).normalize();let best=null;
 const hasOuter=candidates.some(candidate=>candidate.outer);
 // Only edge stickers with an outer candidate lose inner-turn coverage.
 // Interior stickers keep their full directional range, even at 100%.
 const matches=(candidate,normal)=>normal&&candidate.move.depth===1&&candidate.move.normal.every((v,i)=>v===normal[i]);
 const sharedUF=candidates.some(c=>matches(c,upNormal))&&candidates.some(c=>matches(c,frontNormal));
 const bias=THREE.MathUtils.clamp(upBias,0,1);
 const up=candidates.find(c=>matches(c,upNormal)),front=candidates.find(c=>matches(c,frontNormal));
 const angleError=c=>Math.acos(THREE.MathUtils.clamp(Math.abs(c.direction.dot(drag)),0,1));
 // Shrink F's original angular sector toward its own axis. Swipe axes repeat
 // every 180 degrees; the two boundaries are the midpoints to U on either side.
 let allowFront=true;
 if(sharedUF&&bias>0){
  if(bias===1)return {...up.move,dir:up.direction.dot(drag)>0?1:-1};
  allowFront=inAngularSector(front,[up],drag,1-bias);
 }
 // In EIF, the outer U row can also share swipe axes with BR and BL.
 // Contract each back turn's sector and give the removed part to U.
 const eifBias=THREE.MathUtils.clamp(eifUpBias,0,1);
 const matchesBack=(candidate,normal)=>matches(candidate,normal)||(candidate.outer&&candidate.move.depth>1&&candidate.move.normal.every((v,i)=>v===-normal[i]));
 const backs=up?candidates.filter(c=>backNormals.some(normal=>matchesBack(c,normal))):[];
 if(backs.length&&eifBias===1)return {...up.move,dir:up.direction.dot(drag)>0?1:-1};
 const displacedBacks=eifBias>0?backs.filter(c=>!inAngularSector(c,candidates,drag,1-eifBias)):[];
 const outer=THREE.MathUtils.clamp(outerBias,0,1);
 for(const candidate of candidates){
  if((!allowFront&&candidate===front)||displacedBacks.includes(candidate))continue;
  if(hasOuter&&!candidate.outer&&outer>0&&!inAngularSector(candidate,candidates,drag,1-outer))continue;
  const alignment=candidate.direction.dot(drag);
  // Give the displaced part of F's sector to U without expanding either
  // turn's combined sector relative to other candidate layers.
  let angularError=angleError(candidate);
  if(candidate===up){
   if(!allowFront)angularError=Math.min(angularError,angleError(front));
   for(const back of displacedBacks)angularError=Math.min(angularError,angleError(back));
  }
  const error=angularError;
  if(!best||error<best.error)best={error,move:{...candidate.move,dir:alignment>0?1:-1}};
 }
 return best?.move??null;
}

export function swipeMove(hit,dx,dy,camera,width,height,size,outerBias=0){
 return chooseSwipeMove(swipeCandidates(hit,camera,width,height,size),dx,dy,outerBias);
}
