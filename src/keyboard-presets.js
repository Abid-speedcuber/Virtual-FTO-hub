// SPDX-License-Identifier: GPL-3.0-only
// csTimer FTO mapping adapted from cs0x7f/cstimer, twistypoly.js (GPLv3).
// Original: csTimer contributors. Adaptation: Master FTO contributors, 2026.
// See NOTICE.md for the pinned upstream source and changes.
import {defaultConfig,parseTrigger} from './keyboard-engine.js';

// Single-key entries from csTimer's FTO bindKeyMap; numeric pairs upstream
// describe touch gestures and are intentionally outside this keyboard preset.
export const CSTIMER_FTO_KEYS=[
 ['I','R'],['K',"R'"],['D','L'],['E',"L'"],['J','U'],['F',"U'"],['H','F'],['G',"F'"],
 ['S','D'],['L',"D'"],['W','B'],['O',"B'"],['8','BR'],[',',"BR'"],['C','BL'],['3',"BL'"],
 ['U','Rw'],['M',"Rw'"],['R',"Lw'"],['V','Lw'],
 ['Y','[R]'],['N',"[R']"],['T',"[L']"],['B','[L]'],[';','[U]'],['A',"[U']"],['P','T'],['Q',"T'"]
];
function nativeAction(notation){
 const rotation=notation.startsWith('[')||notation.startsWith('T'),vertex=notation.startsWith('T');
 return {type:rotation?'rotate':'move',face:vertex?'U':notation.replace(/[\[\]'w]/g,''),dir:notation.includes("'")?-1:1,kind:notation.includes('w')?'wide':'outer',depth:notation.includes('w')?2:1,...(vertex?{vertex:true}:{})};
}
export function cstimerConfig(size=4){
 const config=defaultConfig(size),abidCenter=config.modes.find(m=>m.id==='e-center');
 config.preset='cstimer';
 // 3 and 8 retain csTimer's face turns, including with Shift held. Other
 // number suffixes and app commands remain available as modern extensions.
 const common=config.modes[0].bindings.filter(b=>
  ['command','depth','hold-slice'].includes(b.action.type)&&b.action.command!=='snap-view'&&
  !parseTrigger(b.trigger).some(step=>step.some(code=>['Digit3','Digit8','Space'].includes(code)))
 );
 const native=CSTIMER_FTO_KEYS.map(([trigger,notation],i)=>({id:`cstimer-${i}`,trigger,action:nativeAction(notation)}));
 const ring=['F','R','BR','B','BL','L'];
 config.modes=[['cif','CIF',0],['eif-r','EIF-R',1],['eif-l','EIF-L',-1]].map(([id,name,offset])=>{
  const bindings=structuredClone([...common,...native]);
  for(const binding of bindings){binding.id=`${id}-${binding.id}`;const a=binding.action;if(offset&&a.type==='move'&&ring.includes(a.face))a.face=ring[(ring.indexOf(a.face)+offset+6)%6];}
  bindings.push({id:`${id}-right`,trigger:'Tab',action:{type:'mode',mode:id==='eif-r'?'cif':'eif-r'}},{id:`${id}-left`,trigger:'Shift+Tab',action:{type:'mode',mode:id==='eif-l'?'cif':'eif-l'}});
  if(size===3)bindings.push({id:`${id}-center`,trigger:'Space',action:{type:'mode',mode:'e-center'}});
  return {id,name,bindings};
 });
 if(abidCenter){abidCenter.bindings=abidCenter.bindings.filter(b=>b.action.command!=='snap-view');abidCenter.bindings.find(b=>b.id==='center-left').trigger='Shift+Tab';abidCenter.bindings.push({id:'center-space-return',trigger:'Space',action:{type:'mode',mode:'cif'}});config.modes.push(abidCenter);}
 return config;
}
