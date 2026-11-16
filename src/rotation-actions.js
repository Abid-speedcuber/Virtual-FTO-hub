// Face-pair notation describes the current faces that become U and F.
// https://nautilusfto.com/Notation/
const faces=['U','D','R','L','F','B','BR','BL'];
const opposite={U:'D',D:'U',R:'BL',BL:'R',L:'BR',BR:'L',F:'B',B:'F'};
export const validRotationPair=pair=>Array.isArray(pair)&&pair.length===2&&faces.includes(pair[0])&&faces.includes(pair[1])&&pair[1]!==pair[0]&&pair[1]!==opposite[pair[0]];
export const ROTATION_PAIRS=faces.flatMap(up=>faces.filter(front=>validRotationPair([up,front])&&!(up==='U'&&front==='F')).map(front=>[up,front]));
export const pairLabel=pair=>`{${pair.join(',')}}`;
// Legacy controls retain their geometric axes and angles. Their face-pair
// equivalents depend on the starting notation; explicit pairs work in either.
const cif={U:['U,BR','U,BL'],R:['F,BR','BR,U'],L:['BL,U','F,BL'],F:['BL,F','BR,F'],halfU:['U,R','U,L'],halfF:['L,F','R,F'],T:['L,R','R,L']};
const eif={...cif,R:['L,D','B,BR'],L:['B,BL','R,D'],F:['L,F','R,F'],halfF:['BL,F','BR,F'],T:['BL,L','BR,R']};
export function legacyRotationDetail(action){
 const key=action.vertex?'T':`${action.angle===60?'half':''}${action.face}`,index=action.dir<0?1:0;
 if(!cif[key])return '';
 const a=`{${cif[key][index]}}`,b=`{${eif[key][index]}}`;
 return a===b?a:`${a} in CIF · ${b} in EIF`;
}
export const normalizeActionSearch=text=>text.toLowerCase().replaceAll('′',"'").replace(/\s*([{},])\s*/g,'$1').trim();

// T keeps its vertex-axis rotation in CIF; EIF uses the designated face pair.
export function rotationPairForMove(move,notation){
 return move.pair??(move.vertex&&notation==='EIF'?(move.dir<0?['BR','R']:['BL','L']):null);
}
