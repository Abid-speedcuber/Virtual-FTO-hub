import * as THREE from 'three';
import {FACES,dot} from './puzzle.js';
export const HOME_POSITION = new THREE.Vector3(6,4.8,7);
const sides=['F','L','BL','B','BR','R'];
const vector=n=>new THREE.Vector3(...n);
// A hold is defined by its upper and front faces, not by the nearest rigid
// rotation of one reference camera. The 24 CIF and 24 EIF holds have different
// side-label assignments. See https://nautilusfto.com/Notation/ .
export const FRAMES=[];
for(const up of FACES)for(const front of FACES){
 if(Math.abs(dot(up.normal,front.normal))===3)continue;
 const axis=vector(up.normal).normalize();
 const project=n=>vector(n).addScaledVector(axis,-vector(n).dot(axis));
 const forward=project(front.normal);
 const angle=f=>f===front?0:(Math.atan2(-axis.dot(forward.clone().cross(project(f.normal))),forward.dot(project(f.normal)))+2*Math.PI)%(2*Math.PI);
 const ring=FACES.filter(f=>Math.abs(dot(f.normal,up.normal))!==3).sort((a,b)=>angle(a)-angle(b));
 const names=new Map([[up,'U'],[FACES.find(f=>dot(f.normal,up.normal)===-3),'D']]);
 ring.forEach((f,i)=>names.set(f,sides[i]));
 FRAMES.push({up:up.name,front:front.name,notation:dot(up.normal,front.normal)<0?'CIF':'EIF',normals:FACES.map(f=>[...FACES.find(original=>names.get(original)===f.name).normal])});
}
export const FIXED_FRAME={notation:'fixed',normals:FACES.map(f=>[...f.normal])};
export function frameForCamera(camera) {
 camera.updateMatrixWorld();
 const screenUp=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
 const towardCamera=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,2);
 // U follows the upper direction of the hold, even when that face is on
 // the back of the puzzle. Restricting this choice to visible faces turns a
 // bottom-view CIF hold into EIF and incorrectly labels a side face U.
 // Only exact ties prefer the face toward the camera (e.g. a square silhouette).
 const upScore=f=>vector(f.normal).dot(screenUp);
 const facing=f=>vector(f.normal).dot(towardCamera);
 const up=FACES.reduce((best,f)=>{
  const difference=upScore(f)-upScore(best);
  return difference>1e-9||(Math.abs(difference)<=1e-9&&facing(f)>facing(best)+1e-9)?f:best;
 });
 const candidates=FACES.filter(f=>Math.abs(dot(f.normal,up.normal))!==3);
 const axis=vector(up.normal).normalize();
 const bearing=towardCamera.clone().addScaledVector(axis,-towardCamera.dot(axis)).normalize();
 const score=f=>{const n=vector(f.normal);return n.addScaledVector(axis,-n.dot(axis)).normalize().dot(bearing);};
 const front=candidates.reduce((best,f)=>score(f)>score(best)+1e-9?f:best);
 return FRAMES.find(f=>f.up===up.name&&f.front===front.name);
}
export const transformedNormal=(normal,frame)=>[...frame.normals[FACES.findIndex(f=>dot(f.normal,normal)===3)]];
export const faceAtNormal=normal=>FACES.findIndex(f=>dot(f.normal,normal)===3);
