import {FACES,solvedState,applyMove} from './puzzle.js';
export const RECORDING_FORMAT='fto-replay-v1';
const clone=value=>structuredClone(value),round=n=>Math.round(n*1e6)/1e6;
const finite=n=>Number.isFinite(n)&&n>=0;
const validView=v=>v&&Array.isArray(v.rotation)&&v.rotation.length===4&&v.rotation.every(Number.isFinite)&&Math.abs(Math.hypot(...v.rotation)-1)<.01&&Number.isFinite(v.radius)&&v.radius>=6&&v.radius<=20;
const validMove=(m,size)=>m&&FACES.some(f=>f.normal.every((v,i)=>v===m.normal?.[i]))&&[1,-1].includes(m.dir)&&['outer','inner','wide','ultra','slice'].includes(m.layer)&&(m.layer!=='slice'||(Number.isInteger(m.depth)&&m.depth>=1&&m.depth<=size&&Number.isInteger(m.count)&&m.count>=1&&m.depth+m.count<=size+1));
function validSplitTrace(trace){
 if(!trace)return true;
 const phases=trace.profile?.phases;
 return Array.isArray(phases)&&phases.length<=129&&phases.every(p=>p&&typeof p.name==='string'&&['builtin','pattern','manual','finish'].includes(p.type))&&Array.isArray(trace.groups)&&trace.groups.every((g,i,list)=>g&&Number.isInteger(g.start)&&Number.isInteger(g.end)&&g.start>=0&&g.end>=g.start&&g.end<phases.length&&finite(g.ms)&&(!i||g.ms>=list[i-1].ms));
}
export function validateRecording(data,{incomplete=false}={}){
 if(!data||data.format!==RECORDING_FORMAT||![2,3,4].includes(data.size)||!validView(data.initial?.view)||!Array.isArray(data.initial.scramble)||data.initial.scramble.length>600||!data.initial.scramble.every(m=>validMove(m,data.size))||!Array.isArray(data.events)||data.events.length>200000)throw Error('Invalid FTO recording');
 if(!incomplete&&(!data.complete||!finite(data.solveMs)||!finite(data.duration)))throw Error('This recording is incomplete');
 if(incomplete&&(!finite(data.epoch)||(data.startOnFirstMove&&!data.started&&(!Array.isArray(data.waitingKeys)||data.waitingKeys.some(k=>typeof k.code!=='string'||k.code.length>50)))))throw Error('Invalid unfinished recording');
 if(!validSplitTrace(data.splitData)||(data.previousBest&&(!finite(data.previousBest.ms)||!validSplitTrace(data.previousBest.splitData))))throw Error('Invalid recorded splits');
 const pending=data.initial.keyboardState?.pending;if(pending!==undefined&&pending!==null&&(!Number.isInteger(pending)||pending<1||pending>20))throw Error('Invalid initial keyboard state');
 let previous=0;
 for(const e of data.events){
  if(!e||!finite(e.at)||e.at<previous||e.at>30*86400000)throw Error('Invalid recording timeline');previous=e.at;
  if(!['view','key','pointer','accept','animate','turn','pause','resume','start','sound','reset-input'].includes(e.type))throw Error('Unknown recording event');
  if(e.type==='view'&&!validView(e.view))throw Error('Invalid recorded view');
  if(['turn','animate'].includes(e.type)&&(!validMove(e.move,data.size)||!Number.isInteger(e.id)))throw Error('Invalid recorded turn');
  if(e.type==='animate'&&(!finite(e.duration)||e.duration<=0||e.duration>60000))throw Error('Invalid recorded animation');
  if(e.type==='sound'&&!['move','suffix'].includes(e.kind))throw Error('Invalid recorded sound');
  if(e.type==='key'&&(typeof e.code!=='string'||e.code.length>50||!['down','up'].includes(e.edge)))throw Error('Invalid recorded key');
  if(e.type==='pointer'&&(!['pointerdown','pointermove','pointerup','pointercancel','wheel'].includes(e.edge)||![e.x,e.y].every(Number.isFinite)))throw Error('Invalid recorded pointer');
 }
 if(data.complete&&data.duration<previous)throw Error('Invalid recording duration');
 return data;
}
export class SolveRecorder{
 constructor(saved={},clock=()=>Date.now(),{elapsedMs}={}){
  this.clock=clock;this.last=saved.last??null;this.pb=saved.pbIsLast?this.last:saved.pb??null;this.attempt=null;this.nextId=0;this.lastView='';
  try{if(saved.attempt){
   validateRecording(saved.attempt,{incomplete:true});this.attempt=clone(saved.attempt);
   if(this.attempt.started||this.attempt.events.some(e=>e.type==='start')){
    const now=this.clock();
    if(!this.attempt.pauseFree){
     const normalized=withoutPauses(withoutInspection({...this.attempt,duration:Math.max(this.attempt.events.at(-1)?.at??0,now-this.attempt.epoch)}));
     const active=Math.max(finite(elapsedMs)?elapsedMs:normalized.duration,normalized.events.at(-1)?.at??0);
     this.attempt={...normalized,epoch:now-active,pauseOffsetMs:0,pausedAt:now,started:true};delete this.attempt.duration;
    }else if(this.attempt.pausedAt===null||this.attempt.pausedAt===undefined){
     this.attempt.pausedAt=Math.min(now,Math.max(this.attempt.epoch,this.attempt.checkpointAt??this.attempt.epoch+(this.attempt.pauseOffsetMs??0)+(this.attempt.events.at(-1)?.at??0)));
     this.attempt.events.push({at:this.time(),type:'reset-input'});
    }
   }
   this.nextId=this.attempt.events.reduce((n,e)=>Math.max(n,e.id??0),0);
  }}catch{}
 }
 arm({size,scramble,view,keyboard,colors,previousBest=null}){
  this.attempt=[2,3,4].includes(size)?{format:RECORDING_FORMAT,size,createdAt:new Date(this.clock()).toISOString(),epoch:this.clock(),complete:false,startOnFirstMove:true,started:false,pauseFree:true,pauseOffsetMs:0,pausedAt:null,waitingKeys:[],previousBest:clone(previousBest),initial:{scramble:clone(scramble),view:clone(view),keyboard:clone(keyboard),colors:clone(colors)},events:[]}:null;
  this.nextId=0;this.lastView='';
 }
 time(now=this.clock()){
  const data=this.attempt;if(!data)return 0;
  return Math.max(data.events.at(-1)?.at??0,(data.pausedAt??now)-data.epoch-(data.pauseOffsetMs??0),0);
 }
 event(type,data={}){
  if(!this.attempt||this.attempt.complete)return;
  if(this.attempt.startOnFirstMove&&!this.attempt.started){
   if(type==='key'){
    this.attempt.waitingKeys=this.attempt.waitingKeys.filter(k=>k.code!==data.code);
    if(data.edge==='down')this.attempt.waitingKeys.push(clone(data));
   }
   if(type!=='start')return;
   this.attempt.started=true;this.attempt.epoch=this.clock();
   for(const key of this.attempt.waitingKeys)this.attempt.events.push({at:0,type:'key',...key});
   delete this.attempt.waitingKeys;
  }
  if(type==='pause'){
   if(this.attempt.pausedAt===null||this.attempt.pausedAt===undefined){const at=this.time();this.attempt.pausedAt=this.clock();this.attempt.events.push({at,type:'reset-input'});this.lastView='';}
   return;
  }
  if(type==='resume'){
   if(this.attempt.pausedAt!==null&&this.attempt.pausedAt!==undefined){this.attempt.pauseOffsetMs=(this.attempt.pauseOffsetMs??0)+Math.max(0,this.clock()-this.attempt.pausedAt);this.attempt.pausedAt=null;this.lastView='';}
   return;
  }
  if(this.attempt.pausedAt!==null&&this.attempt.pausedAt!==undefined&&type!=='turn')return;
  const at=type==='start'?0:this.time();
  this.attempt.events.push({at,type,...clone(data)});
 }
 view(view,hold){
  if(!this.attempt||this.attempt.pausedAt!==null&&this.attempt.pausedAt!==undefined)return;
  if(this.attempt.startOnFirstMove&&!this.attempt.started){this.attempt.initial.view=clone(view);this.attempt.initial.hold=clone(hold);return;}
  const rounded={rotation:view.rotation.map(round),radius:round(view.radius)},key=JSON.stringify([rounded,hold]);
  if(key!==this.lastView){this.lastView=key;this.event('view',{view:rounded,hold});}
 }
 begin(view,keyboard,keyboardState){
  if(this.attempt&&!this.attempt.started){this.attempt.initial.view=clone(view);this.attempt.initial.keyboard=clone(keyboard);this.attempt.initial.keyboardState=clone(keyboardState);}
  this.event('start');
 }
 accept(action){const id=++this.nextId;this.event('accept',{id,action:action.type,source:action.source??'keyboard',elapsedMs:action.elapsedMs});return id;}
 finish(ms,newBest,splitData=null){
  if(!this.attempt)return;
  const data=this.attempt;data.solveMs=ms;data.duration=this.time();data.complete=true;data.completedAt=new Date(this.clock()).toISOString();
  data.splitData=clone(splitData);data.previousBest=data.previousBest??(this.pb?{ms:this.pb.solveMs,splitData:clone(this.pb.splitData)}:null);
  delete data.epoch;delete data.waitingKeys;delete data.pausedAt;delete data.pauseOffsetMs;delete data.checkpointAt;this.last=data;if(newBest)this.pb=data;this.attempt=null;return data;
 }
 discard(){this.attempt=null;}
 serialize(){if(this.attempt)this.attempt.checkpointAt=this.clock();return {last:this.last,...(this.pb===this.last&&this.pb?{pbIsLast:true}:{pb:this.pb}),attempt:this.attempt};}
}

// Resolved turns make playback independent of keyboard presets and future
// binding changes. Raw input and displayed views remain alongside them.
export class RecordingTimeline{
 constructor(data){this.data=data.pauseFree?data:withoutPauses(data);this.reset();}
 reset(){
  this.state=this.data.initial.scramble.reduce(applyMove,solvedState(this.data.size));this.view=this.data.initial.view;this.hold=null;this.keys=new Set();this.motions=new Map();this.paused=false;this.elapsed=0;this.runningSince=null;this.index=0;this.at=-1;
 }
 frame(at){
  if(at<this.at)this.reset();this.at=at;
  while(this.index<this.data.events.length){
   const e=this.data.events[this.index];if(e.at>at)break;this.index++;
   if(e.type==='view'){this.view=e.view;this.hold=e.hold;}
   if(e.type==='reset-input')this.keys.clear();
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

export function withoutInspection(original){
 const data=clone(original);if(data.startOnFirstMove)return data;
 const start=data.events.find(e=>e.type==='start');if(!start)return data;
 const before=data.events.filter(e=>e.at<=start.at),view=before.filter(e=>e.type==='view').at(-1);
 if(view){data.initial.view=view.view;data.initial.hold=view.hold;}
 const keys=new Map();for(const e of before)if(e.at<start.at&&e.type==='key'){if(e.edge==='down')keys.set(e.code,e);else keys.delete(e.code);}
 // Keep all post-start camera samples, in their original stable event order.
 data.events=[...[...keys.values()].map(e=>({...e,at:0})),...original.events.filter(e=>e.at>=start.at).map(e=>({...e,at:e.at-start.at}))];
 data.duration=Math.max(0,data.duration-start.at);data.startOnFirstMove=true;data.started=true;return data;
}

// Legacy recordings keep their original bytes and album IDs. Only playback
// removes paused intervals, preserving committed turns and the resume pose.
export function withoutPauses(original){
 const data=clone(original),events=[];let pausedAt=null,removed=0,resumeView=null;
 for(const e of data.events){
  if(e.type==='pause'){
   if(pausedAt===null){pausedAt=e.at;events.push({at:Math.max(0,e.at-removed),type:'reset-input'});}continue;
  }
  if(e.type==='resume'){
   if(pausedAt!==null){removed+=e.at-pausedAt;pausedAt=null;if(resumeView)events.push({...resumeView,at:Math.max(0,e.at-removed)});resumeView=null;}continue;
  }
  if(pausedAt!==null){if(e.type==='view')resumeView=e;if(e.type!=='turn')continue;}
  events.push({...e,at:Math.max(0,(pausedAt??e.at)-removed)});
 }
 const end=data.duration??data.events.at(-1)?.at??0;if(pausedAt!==null)removed+=Math.max(0,end-pausedAt);
 data.events=events;data.duration=Math.max(events.at(-1)?.at??0,end-removed,0);data.pauseFree=true;return data;
}
