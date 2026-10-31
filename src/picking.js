import * as THREE from 'three';

// Pick the continuous outer surface, not the shrunken sticker triangles.
// Sticker gaps must not let a ray hit a hidden face on the far side.
const surface=new THREE.Mesh(new THREE.OctahedronGeometry(2),new THREE.MeshBasicMaterial({side:THREE.FrontSide}));
surface.updateMatrixWorld(true);
export function pickFaceNormal(raycaster){
 const hit=raycaster.intersectObject(surface,false)[0];
 return hit?hit.face.normal.toArray().map(Math.sign):null;
}
