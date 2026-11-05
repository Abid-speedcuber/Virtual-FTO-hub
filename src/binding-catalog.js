import {FACE_NAMES,actionLabel} from './keyboard-engine.js';
export const BINDING_CATEGORIES=[['all','All actions'],['turns','Outer turns'],['slices','Inner slices'],['wide','Wide turns'],['rotations','Rotations'],['suffixes','Suffixes'],['actions','Actions'],['modes','Modes'],['other','Other saved bindings']];
export function bindingActionKey(a){
 if(a.type==='move')return [a.type,a.face,a.dir,a.kind==='default'?'outer':a.kind,a.kind==='default'?1:a.depth,a.followDirection===true].join(':');
 if(a.type==='rotate')return [a.type,a.vertex?'T':a.face,a.dir].join(':');
 return [a.type,a.depth??'',a.mode??'',a.command??''].join(':');
}
export function bindingCatalog(size,config){
 const rows=[],add=(category,label,action,detail='')=>rows.push({category,label,action,detail,key:bindingActionKey(action)});
 for(const face of FACE_NAMES)for(const dir of [1,-1]){
  const suffix=dir<0?'′':'';add('turns',face+suffix,{type:'move',face,dir,kind:'outer',depth:1});
  for(let depth=2;depth<=size;depth++)add('slices',`${depth}${face}${suffix}`,{type:'move',face,dir,kind:'slice',depth},`${depth===1?'First slice':`Slice ${depth}`}${depth>size?` · needs ${depth} layers`:''}`);
  for(let depth=2;depth<=size;depth++)add('wide',`${depth===2?'':depth}${face}w${suffix}`,{type:'move',face,dir,kind:'wide',depth},`${depth} layer${depth===1?'':'s'}${depth>size?' · needs a larger puzzle':''}`);
  add('rotations',`Rot ${face}${suffix}`,{type:'rotate',face,dir,kind:'outer',depth:1},'120°');
 }
 for(const dir of [1,-1])add('rotations',`Rot T${dir<0?'′':''}`,{type:'rotate',face:'U',dir,kind:'outer',depth:1,vertex:true},'90°');
 for(let depth=2;depth<=size;depth++)add('suffixes',`Suffix ${depth}w`,{type:'depth',depth},depth>size?`Next turn width · needs ${depth} layers`:'Next turn width');
 for(const [type,label] of [['suffix-slice','Slice next'],['hold-slice','Hold slice'],['hold-wide','Hold wide'],['hold-reverse','Hold reverse']])add('suffixes',label,{type});
 for(const [command,label] of [['undo','Undo'],['redo','Redo'],['scramble','Scramble'],['reset','Reset puzzle'],['pause','Pause / resume'],['snap-view','Snap CIF / EIF view'],['fit','Fit puzzle'],['cancel','Clear pending input'],['reset-tps','Reset TPS and turn count']])add('actions',label,{type:'command',command});
 for(const mode of config.modes){add('modes',`Switch to ${mode.name}`,{type:'mode',mode:mode.id});add('modes',`Hold ${mode.name}`,{type:'hold-mode',mode:mode.id});}
 add('modes','Cycle modes',{type:'next-mode'});
 const seen=new Set(rows.map(row=>row.key));
 for(const mode of config.modes)for(const binding of mode.bindings){if(!relevantBindingAction(binding.action,size))continue;const key=bindingActionKey(binding.action);if(!seen.has(key)){seen.add(key);add('other',actionLabel(binding.action)||binding.action.type,binding.action,'Saved action');}}
 const order=BINDING_CATEGORIES.map(([key])=>key);return rows.sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category));
}

export function relevantBindingAction(action,size){return action.type==='depth'||action.type==='move'&&['slice','wide'].includes(action.kind)?action.depth>=2&&action.depth<=size:true;}

export function bindingSubgroups(category,config,size=20){
 if(category==='slices'||category==='wide')return [['all',category==='slices'?'All depths':'All widths'],...Array.from({length:size-1},(_,i)=>[`depth:${i+2}`,category==='slices'?`Depth ${i+2}`:`${i+2} layers`])];
 if(category==='turns'||category==='rotations')return [['all','All axes'],...FACE_NAMES.map(face=>[`face:${face}`,face]),...(category==='rotations'?[['vertex','T · vertex']]:[])];
 if(category==='suffixes')return [['all','All suffixes'],['widths',`Widths 2–${size}`],['slice','Slice next'],['holds','Held modifiers']];
 if(category==='modes')return [['all','All modes'],...config.modes.map(mode=>[`mode:${mode.id}`,mode.name]),['cycle','Cycle modes']];
 return [['all','All groups']];
}
export function inBindingSubgroup(row,group){
 if(group==='all')return true;
 const action=row.action;
 if(group.startsWith('depth:'))return action.depth===Number(group.slice(6));
 if(group.startsWith('face:'))return action.face===group.slice(5)&&!action.vertex;
 if(group.startsWith('mode:'))return action.mode===group.slice(5);
 if(group==='vertex')return action.type==='rotate'&&action.vertex===true;
 if(group==='widths')return action.type==='depth';
 if(group==='slice')return action.type==='suffix-slice';
 if(group==='holds')return ['hold-slice','hold-wide','hold-reverse'].includes(action.type);
 return group==='cycle'&&action.type==='next-mode';
}
