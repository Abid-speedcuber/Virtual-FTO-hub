import {FACES,solvedState,selected,isSolved,applyMove} from './puzzle.js';

export const DETECTOR_VERSION=2;
const slotKey=vertices=>vertices.map(v=>v.join(',')).sort().join('|');
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
export const ROTATIONS=permutations.flatMap(p=>{
 const inversions=p.reduce((n,v,i)=>n+p.slice(i+1).filter(w=>w<v).length,0),parity=inversions%2?-1:1;
 return [-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].filter(z=>x*y*z*parity===1).map(z=>({p,s:[x,y,z]}))));
});
const rotate=(point,r)=>r.p.map((axis,i)=>point[axis]*r.s[i]);
const colorPalettes=ROTATIONS.map(r=>FACES.map(f=>FACES.findIndex(other=>other.normal.every((v,i)=>v===rotate(f.normal,r)[i]))));
const geometryCache=new Map();
function geometry(size){
 if(geometryCache.has(size))return geometryCache.get(size);
 const solved=solvedState(size),slots=new Map(solved.map((s,i)=>[slotKey(s.vertices),i]));
 const permutations=ROTATIONS.map(r=>solved.map(s=>slots.get(slotKey(s.vertices.map(v=>rotate(v,r))))));
 const result={solved,slots,permutations};geometryCache.set(size,result);return result;
}
function colorsAt(state,g){const colors=[];for(const s of state)colors[g.slots.get(slotKey(s.vertices))]=s.color;return colors;}
const matches=(colors,pattern)=>pattern.every(([slot,color])=>colors[slot]===color);
const makePattern=(g,ids,rotation)=>ids.map(id=>[g.permutations[rotation][id],g.solved[id].color]);
let builtin;
export function builtinPatterns(){
 if(builtin)return builtin;
 const g=geometry(3),families=[],variants=[];
 for(const sign of [-1,1]){
  const axes=FACES.filter(f=>f.normal.reduce((a,v)=>a*v,1)===sign),groups=new Map();
  for(const sticker of g.solved){
   const bits=axes.reduce((bits,face,i)=>bits|(selected(sticker,{normal:face.normal,layer:'outer'})?1<<i:0),0);
   if(!groups.has(bits))groups.set(bits,[]);groups.get(bits).push(sticker.id);
  }
  const centers=[0,1,2,3].map(i=>groups.get(1<<i));
  if(centers.some(ids=>ids?.length!==9)||[...groups.values()].filter(ids=>ids.length===6).length!==6)throw Error('Invalid 3×3 reduction geometry');
  const family=families.length;families.push({axes,centers:centers.map(ids=>ROTATIONS.map((_,r)=>makePattern(g,ids,r)))});
  for(let center=0;center<4;center++)for(let up=0;up<4;up++){
   if(center===up)continue;
   const triples=[...groups].filter(([bits,ids])=>ids.length===6&&(bits&(1<<center)));
   const first=[...centers[center],...triples.filter(([bits])=>!(bits&(1<<up))).flatMap(([,ids])=>ids)];
   const lower=[...centers.flat(),...triples.flatMap(([,ids])=>ids)];
   // Nautilus fills the opposite last slot, leaving a physical last layer.
   // Bencisco instead completes the missing triple around the first center.
   const firstTriples=triples.filter(([bits])=>!(bits&(1<<up))).flatMap(([,ids])=>ids);
   const nautilusLower=[...centers.flat(),...firstTriples,...groups.get(15^((1<<center)|(1<<up)))];
   // A completed Nautilus last slot permits either U adjustment. The U
   // center stays formed but need not be aligned to its final solved angle.
   const lastLayerGoals=[0,1,-1].map(dir=>{
    const partial=nautilusLower.map(id=>g.solved[id]);
    const moved=dir?applyMove(partial,{normal:axes[up].normal,layer:'outer',dir}):partial;
    return moved.map(sticker=>[g.slots.get(slotKey(sticker.vertices)),sticker.color]);
   });
   for(let r=0;r<24;r++)variants.push({family,center,up,rotation:r,first:makePattern(g,first,r),lower:makePattern(g,lower,r),nautilusLower:makePattern(g,nautilusLower,r),nautilusGoals:lastLayerGoals.map(goal=>goal.map(([id,color])=>[g.permutations[r][id],color]))});
  }
 }
 builtin={g,families,variants};return builtin;
}
export function detectBuiltin(state,anchor=null,method='bencisco'){
 const {g,families,variants}=builtinPatterns(),colors=colorsAt(state,g),centerCache=new Map();
 const centersDone=family=>{
  if(!centerCache.has(family))centerCache.set(family,families[family].centers.every(patterns=>patterns.some(p=>matches(colors,p))));
  return centerCache.get(family);
 };
 let best={stage:0,anchor:null};
 const locked=Number.isInteger(anchor)?variants[anchor]:null;
 // Keep the chosen block's colors and missing triple, but let its rigid pose
 // change under regrips or whole-puzzle rotations.
 const options=locked?[anchor,...variants.flatMap((v,i)=>i!==anchor&&v.family===locked.family&&v.center===locked.center&&v.up===locked.up?[i]:[])]:variants.map((_,i)=>i);
 for(const index of options){
  const variant=variants[index];if(!matches(colors,variant.first))continue;
  const centers=centersDone(variant.family);
  const lastSlot=method==='nautilus'?variant.nautilusGoals.some(goal=>matches(colors,goal)):matches(colors,variant.lower);
  const stage=lastSlot&&centers?3:centers?2:1;
  if(stage>best.stage)best={stage,anchor:index};if(stage===3)break;
 }
 return best;
}
export function phaseProfile(size,config={}){
 const method=['bencisco','nautilus','custom','off'].includes(config.method)?config.method:'off';
 if(method==='off'||(size!==3&&method!=='custom'))return {method:'off',phases:[]};
 const phases=method==='custom'?(config.phases??[]).filter(p=>p.type!=='finish').slice(0,15).map((p,i)=>({name:String(p.name??`Phase ${i+1}`).trim().slice(0,40)||`Phase ${i+1}`,type:'pattern',stickers:[...new Set((p.stickers??[]).filter(n=>Number.isInteger(n)&&n>=0&&n<8*size*size))].sort((a,b)=>a-b)})):
  [{name:'First block',type:'builtin'},{name:'E centers',type:'builtin'},{name:method==='nautilus'?'Last triple':'Last bottom triple',type:'builtin'}];
 if(method==='custom'){const selected=new Set();for(const phase of phases){for(const id of phase.stickers)selected.add(id);phase.stickers=[...selected].sort((a,b)=>a-b);}}
 return {method,phases:[...phases,{name:method==='nautilus'?'Last layer':method==='bencisco'?'Last three triples':'Finish',type:'finish'}]};
}
export const profileKey=profile=>JSON.stringify(profile);
export function trackedBest(times,profile){
 return times.filter(t=>t.splitData&&profileKey(t.splitData.profile)===profileKey(profile)&&t.splitData.complete&&(!['bencisco','nautilus'].includes(profile.method)||(t.splitData.detectorVersion===DETECTOR_VERSION&&t.splitData.groups?.length>1))).reduce((best,t)=>!best||t.ms<best.ms?t:best,null);
}
export class PhaseTracker{
 constructor(size,profile,saved=null){
  this.size=size;this.profile=phaseProfile(size,profile);this.groups=[];this.anchor=null;this.complete=false;this.reference=null;this.turnIndex=0;this.detectorVersion=DETECTOR_VERSION;this.samples=[];this.historyFloor=0;this.colorAnchors=null;
  if(saved&&profileKey(saved.profile)===profileKey(this.profile)){
   const valid=Array.isArray(saved.groups)&&saved.groups.every((g,i,all)=>Number.isInteger(g.start)&&Number.isInteger(g.end)&&g.start===(i?all[i-1].end+1:0)&&g.end>=g.start&&g.end<this.profile.phases.length&&Number.isFinite(g.ms)&&g.ms>=0&&(!i||g.ms>=all[i-1].ms));
   if(valid){this.groups=structuredClone(saved.groups);this.anchor=saved.anchor;this.complete=saved.complete===true;this.reference=structuredClone(saved.reference??null);this.turnIndex=Number.isInteger(saved.turnIndex)?saved.turnIndex:0;this.detectorVersion=saved.detectorVersion??1;this.samples=structuredClone(saved.samples??[]);this.historyFloor=Number.isInteger(saved.historyFloor)?saved.historyFloor:0;this.colorAnchors=saved.colorAnchors??null;}
  }
 }
 get next(){return this.groups.length?this.groups.at(-1).end+1:0;}
 get enabled(){return this.profile.phases.length>0;}
 record(end,ms,kind='exact'){
  if(end<this.next||end>=this.profile.phases.length)return false;
  const start=this.next;this.groups.push({start,end,turnIndex:this.turnIndex,ms:Math.max(this.groups.at(-1)?.ms??0,ms),...(this.colorAnchors?{colorAnchors:[...this.colorAnchors]}:{}),kind:kind==='inspection'?'inspection':end>start?'combined':kind});
  this.complete=end===this.profile.phases.length-1;return true;
 }
 arm(state,times,{historyFloor=0}={}){
  this.groups=[];this.anchor=null;this.complete=false;this.turnIndex=0;this.detectorVersion=DETECTOR_VERSION;this.samples=[];this.historyFloor=historyFloor;this.colorAnchors=null;
  const best=trackedBest(times,this.profile);this.reference=best?{ms:best.ms,groups:structuredClone(best.splitData.groups)}:null;
  this.observe(state,0,{initial:true});
 }
 observe(state,ms,{initial=false,finished=false,turnIndex=this.turnIndex}={}){
  if(!this.enabled||this.complete)return;
  this.turnIndex=turnIndex;
  let furthest=this.next-1;
  if(['bencisco','nautilus'].includes(this.profile.method)){
   const result=detectBuiltin(state,this.anchor,this.profile.method);if(result.anchor!==null)this.anchor=result.anchor;
   this.samples.push({turnIndex,ms,stage:result.stage,anchor:result.anchor});if(this.samples.length>2000)this.samples.shift();
   furthest=Math.max(furthest,result.stage-1);
  }else if(this.profile.method==='custom'){
   const g=geometry(this.size),colors=colorsAt(state,g);
   let anchors=this.colorAnchors??ROTATIONS.map((_,i)=>i);
   for(let i=this.next;i<this.profile.phases.length-1;i++){
    const ids=this.profile.phases[i].stickers;if(!ids.length)break;
    const matching=anchors.filter(color=>g.permutations.some((_,r)=>ids.every(id=>colors[g.permutations[r][id]]===colorPalettes[color][g.solved[id].color])));
    if(!matching.length)break;
    anchors=matching;this.colorAnchors=anchors;furthest=i;
   }
  }
  if(finished||(!initial&&isSolved(state)))furthest=this.profile.phases.length-1;
  if(furthest>=this.next)this.record(furthest,ms,initial?'inspection':'exact');
 }
 manual(ms,turnIndex=this.turnIndex){this.turnIndex=turnIndex;if(this.profile.phases[this.next]?.type==='manual')return this.record(this.next,ms,'manual');return false;}
 rewind(state,ms,{turnIndex=this.turnIndex}={}){
  if(!this.enabled)return;
  this.turnIndex=turnIndex;
  // Undo reverses the move timeline, not every temporary disruption of a
  // completed block. Keep checkpoints that happened before the undone move.
  this.groups=this.groups.filter(g=>!Number.isInteger(g.turnIndex)||g.turnIndex<=turnIndex);
  if(!this.groups.length)this.anchor=null;this.colorAnchors=this.groups.at(-1)?.colorAnchors??null;
  this.complete=false;this.observe(state,ms,{turnIndex});
 }
 serialize({diagnostics=false}={}){return {...(diagnostics?{samples:structuredClone(this.samples),historyFloor:this.historyFloor}:{}),colorAnchors:this.colorAnchors,detectorVersion:this.detectorVersion,profile:structuredClone(this.profile),groups:structuredClone(this.groups),turnIndex:this.turnIndex,anchor:this.anchor,complete:this.complete,reference:structuredClone(this.reference)};}
}
export function splitRows(tracker,elapsed){
 const data=tracker.serialize?tracker.serialize():tracker,rows=[];let startMs=0;
 const baselineAt=index=>index<0?0:data.reference?.groups.find(g=>g.end===index)?.ms??null;
 for(const group of data.groups){
  const baseStart=baselineAt(group.start-1),baseEnd=baselineAt(group.end);
  rows.push({name:data.profile.phases.slice(group.start,group.end+1).map(p=>p.name).join(' + '),ms:group.ms-startMs,cumulative:group.ms,kind:group.kind,delta:baseStart!==null&&baseEnd!==null?(group.ms-startMs)-(baseEnd-baseStart):null,totalDelta:baseEnd!==null?group.ms-baseEnd:null});startMs=group.ms;
 }
 const next=data.groups.at(-1)?.end+1||0;
 for(let i=next;i<data.profile.phases.length;i++)rows.push({name:data.profile.phases[i].name,ms:i===next?Math.max(0,elapsed-startMs):null,cumulative:null,kind:i===next?'active':'waiting',delta:null,totalDelta:null});
 return rows;
}
