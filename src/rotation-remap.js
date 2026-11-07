import {FACE_NAMES} from './keyboard-engine.js';

export const ROTATION_ORDER=['U','D','R','L','F','B','BR','BL'];
const OPPOSITE={U:'D',D:'U',R:'BL',BL:'R',L:'BR',BR:'L',F:'B',B:'F'};
const UPPER_RING=['U','R','F','L'];
const SIDE_ORDER=['F','L','BL','B','BR','R'];

export function rotationMap(a,b){
 const mapping={[a]:"U",[OPPOSITE[a]]:"D"};
 const inverted=!UPPER_RING.includes(a);
 const ring=UPPER_RING.filter(face=>face!==(inverted?OPPOSITE[a]:a));
 if(inverted)ring.reverse();
 for(let i=0;i<3;i++)ring.push(OPPOSITE[ring[i]]);
 const shift=ring.indexOf(b);
 if(shift<0)throw Error('The second layer must be adjacent to the first.');
 const ordered=[...ring.slice(shift),...ring.slice(0,shift)];
 SIDE_ORDER.forEach((side,i)=>{mapping[ordered[i]]=side;});
 return mapping;
}

const layerOf=text=>{const value=text.trim().toUpperCase();return FACE_NAMES.includes(value)?value:null;};
const couldBecomeLayer=text=>{const value=text.trim().toUpperCase();return !value||FACE_NAMES.some(face=>face.startsWith(value));};

export function parseRotation(raw){
 if(!raw.startsWith('{'))return null;
 const body=raw.slice(1),close=body.indexOf('}');
 const invalid=reason=>({state:'invalid',reason});
 if(close>=0&&body.slice(close+1).trim())return invalid('Nothing may follow the closing brace.');
 const parts=(close<0?body:body.slice(0,close)).split(',');
 if(parts.length>2)return invalid('A rotation has exactly two layers.');
 if(parts.length===1){
  if(close>=0)return invalid('A rotation needs two layers, e.g. {U, R}.');
  return couldBecomeLayer(parts[0])?{state:'typing'}:invalid(`“${parts[0].trim()}” is not a layer.`);
 }
 const first=layerOf(parts[0]);
 if(!first)return invalid(`“${parts[0].trim()}” is not a layer.`);
 if(close<0)return couldBecomeLayer(parts[1])?{state:'typing'}:invalid(`“${parts[1].trim()}” is not a layer.`);
 const second=layerOf(parts[1]);
 if(!second)return invalid(`“${parts[1].trim()}” is not a layer.`);
 if(second===first||second===OPPOSITE[first])return invalid('The two layers can’t be the same or opposite.');
 return {state:'valid',mapping:rotationMap(first,second)};
}

export function remappedFace(action,mapping){
 if(action.type==='move'||(action.type==='rotate'&&!action.vertex))return mapping[action.face];
 return undefined;
}
