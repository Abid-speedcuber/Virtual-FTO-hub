import {FACES,solvedState,applyMove} from './puzzle.js';
export const RECORDING_FORMAT='fto-replay-v1';
const clone=value=>structuredClone(value),round=n=>Math.round(n*1e6)/1e6;
const finite=n=>Number.isFinite(n)&&n>=0;
const validView=v=>v&&Array.isArray(v.rotation)&&v.rotation.length===4&&v.rotation.every(Number.isFinite)&&Math.abs(Math.hypot(...v.rotation)-1)<.01&&Number.isFinite(v.radius)&&v.radius>=6&&v.radius<=20;
const validMove=(m,size)=>m&&FACES.some(f=>f.normal.every((v,i)=>v===m.normal?.[i]))&&[1,-1].includes(m.dir)&&['outer','inner','wide','ultra','slice'].includes(m.layer)&&(m.layer!=='slice'||(Number.isInteger(m.depth)&&m.depth>=1&&m.depth<=size&&Number.isInteger(m.count)&&m.count>=1&&m.depth+m.count<=size+1));
export function validateRecording(data,{incomplete=false}={}){
 if(!data||data.format!==RECORDING_FORMAT||![2,3,4].includes(data.size)||!validView(data.initial?.view)||!Array.isArray(data.initial.scramble)||data.initial.scramble.length>600||!data.initial.scramble.every(m=>validMove(m,data.size))||!Array.isArray(data.events)||data.events.length>200000)throw Error('Invalid FTO recording');
 if(!incomplete&&(!data.complete||!finite(data.solveMs)||!finite(data.duration)))throw Error('This recording is incomplete');
 let previous=0;
 for(const e of data.events){
  if(!e||!finite(e.at)||e.at<previous||e.at>30*86400000)throw Error('Invalid recording timeline');previous=e.at;
  if(!['view','key','pointer','accept','animate','turn','pause','resume','start'].includes(e.type))throw Error('Unknown recording event');
  if(e.type==='view'&&!validView(e.view))throw Error('Invalid recorded view');
  if(['turn','animate'].includes(e.type)&&(!validMove(e.move,data.size)||!Number.isInteger(e.id)))throw Error('Invalid recorded turn');
  if(e.type==='animate'&&(!finite(e.duration)||e.duration<=0||e.duration>60000))throw Error('Invalid recorded animation');
  if(e.type==='key'&&(typeof e.code!=='string'||e.code.length>50||!['down','up'].includes(e.edge)))throw Error('Invalid recorded key');
  if(e.type==='pointer'&&(!['pointerdown','pointermove','pointerup','pointercancel','wheel'].includes(e.edge)||![e.x,e.y].every(Number.isFinite)))throw Error('Invalid recorded pointer');
 }
 if(data.complete&&data.duration<previous)throw Error('Invalid recording duration');
 return data;
}
export class SolveRecorder{
 constructor(saved={},clock=()=>Date.now()){
  this.clock=clock;this.last=saved.last??null;this.pb=saved.pbIsLast?this.last:saved.pb??null;this.attempt=null;this.nextId=0;this.lastView='';
  try{if(saved.attempt){validateRecording(saved.attempt,{incomplete:true});this.attempt=clone(saved.attempt);this.nextId=this.attempt.events.reduce((n,e)=>Math.max(n,e.id??0),0);}}catch{}
 }
 arm({size,scramble,view,keyboard,colors}){
  this.attempt=[2,3,4].includes(size)?{format:RECORDING_FORMAT,size,createdAt:new Date(this.clock()).toISOString(),epoch:this.clock(),complete:false,initial:{scramble:clone(scramble),view:clone(view),keyboard:clone(keyboard),colors:clone(colors)},events:[]}:null;
  this.nextId=0;this.lastView='';
 }
 event(type,data={}){
  if(!this.attempt||this.attempt.complete)return;
  const at=Math.max(this.attempt.events.at(-1)?.at??0,this.clock()-this.attempt.epoch,0);
  this.attempt.events.push({at,type,...clone(data)});
 }
 view(view,hold){
  const rounded={rotation:view.rotation.map(round),radius:round(view.radius)},key=JSON.stringify([rounded,hold]);
  if(key!==this.lastView){this.lastView=key;this.event('view',{view:rounded,hold});}
 }
 accept(action){const id=++this.nextId;this.event('accept',{id,action:action.type,source:action.source??'keyboard',elapsedMs:action.elapsedMs});return id;}
 finish(ms,newBest){
  if(!this.attempt)return;
  const data=this.attempt;data.solveMs=ms;data.duration=Math.max(data.events.at(-1)?.at??0,this.clock()-data.epoch);data.complete=true;
  delete data.epoch;this.last=data;if(newBest)this.pb=data;this.attempt=null;
 }
 discard(){this.attempt=null;}
 serialize(){return {last:this.last,...(this.pb===this.last&&this.pb?{pbIsLast:true}:{pb:this.pb}),attempt:this.attempt};}
}

// Resolved turns make playback independent of keyboard presets and future
// binding changes. Raw input and displayed views remain alongside them.
export class RecordingTimeline{
 constructor(data){this.data=data;this.reset();}
 reset(){
  this.state=this.data.initial.scramble.reduce(applyMove,solvedState(this.data.size));this.view=this.data.initial.view;this.hold=null;this.keys=new Set();this.motions=new Map();this.paused=false;this.elapsed=0;this.runningSince=null;this.index=0;this.at=-1;
 }
 frame(at){
  if(at<this.at)this.reset();this.at=at;
  while(this.index<this.data.events.length){
   const e=this.data.events[this.index];if(e.at>at)break;this.index++;
   if(e.type==='view'){this.view=e.view;this.hold=e.hold;}
   if(e.type==='key'){if(e.edge==='down')this.keys.add(e.code);else this.keys.delete(e.code);}
   if(e.type==='animate')this.motions.set(e.id,{...e,started:e.at});
   if(e.type==='turn'){this.state=applyMove(this.state,e.move);this.motions.delete(e.id);}
   if(e.type==='start'||e.type==='resume'){this.runningSince=e.at;this.paused=false;}
   if(e.type==='pause'){if(this.runningSince!==null)this.elapsed+=e.at-this.runningSince;this.runningSince=null;this.paused=true;this.keys.clear();}
  }
  const finished=at>=this.data.duration,elapsed=finished?this.data.solveMs:this.elapsed+(this.runningSince!==null?at-this.runningSince:0);
  return {state:this.state,view:this.view,hold:this.hold,keys:[...this.keys],paused:finished?false:this.paused,elapsed,motions:finished?[]:[...this.motions.values()].map(m=>({...m,progress:Math.min(1,Math.max(0,(at-m.started)/m.duration))}))};
 }
}
export const recordingFrame=(data,at)=>new RecordingTimeline(data).frame(at);
