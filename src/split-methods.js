import {phaseProfile} from './solve-phases.js';
const clone=value=>structuredClone(value);
export function namedMethod(size,config,name='My method',id=crypto.randomUUID()){
 let phases=clone(config.phases??[]);
 if(config.customVersion!==2){
  if(phases.at(-1)?.type==='finish'&&phases.at(-1).name==='Finish'&&phases.length>1)phases.pop();
  if(phases.length)phases.at(-1).type='finish';
 }
 if(!phases.length)phases=[{name:'Finish',type:'finish',stickers:[]}];
 return phaseProfile(size,{method:'custom',customVersion:2,methodId:id,name:name.trim()||'My method',phases});
}
export function migrateMethods(profiles,library){
 for(const [size,config] of Object.entries(profiles))if(config.method==='custom'){
  const list=library[size]??=[];let entry=list.find(m=>m.methodId===config.methodId);
  if(!entry){entry=namedMethod(+size,config,config.name??'My method',config.methodId??`custom-${size}`);list.push(entry);}
  profiles[size]=clone(entry);
 }
 return library;
}
export function migrateCustomTrace(trace,size){
 if(trace?.profile?.method!=='custom'||trace.profile.customVersion===2)return trace;
 const next=clone(trace);next.profile=namedMethod(size,trace.profile,trace.profile.name??'My method',trace.profile.methodId??`custom-${size}`);
 const last=next.profile.phases.length-1;
 const remap=(source,complete=true)=>{const groups=[];
 for(const group of source??[]){
  const mapped={...group,start:Math.min(group.start,last),end:Math.min(group.end,last)};
  if(!complete&&mapped.end===last)mapped.end--;if(mapped.end<mapped.start)continue;
  if(groups.at(-1)?.end>=mapped.start){const previous=groups.at(-1);previous.end=Math.max(previous.end,mapped.end);previous.ms=mapped.ms;previous.kind=previous.end>previous.start?'combined':'exact';}
  else groups.push(mapped);
 }
 return groups;};
 next.groups=remap(next.groups,next.complete===true);if(next.reference?.groups)next.reference.groups=remap(next.reference.groups);return next;
}
