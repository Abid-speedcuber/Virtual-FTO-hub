import * as THREE from 'three';
import {solvedState,applyMove,FACES,moveRange} from './puzzle.js';
import {HOME_POSITION,frameForCamera,snappedViewRotation} from './orientation.js';
import {migrateCustomTrace} from './split-methods.js';
import {KeyboardEngine,validateConfig,defaultConfig} from './keyboard-engine.js';
import {RecordingTimeline,withoutInspection,withoutPauses} from './solve-recording.js';
export class ReplayPresentation{
 constructor(original){
  this.data=withoutPauses(withoutInspection(original));this.data.splitData=migrateCustomTrace(this.data.splitData,this.data.size);if(this.data.previousBest)this.data.previousBest.splitData=migrateCustomTrace(this.data.previousBest.splitData,this.data.size);this.soundEvents=recordedSounds(this.data);this.timeline=new RecordingTimeline(this.data);this.turnMs=160;this.scrambleMs=this.data.initial.scramble.length*this.turnMs;this.pauseMs=1000;this.orbitMs=2000;this.orbitStart=this.scrambleMs+this.pauseMs;this.readyStart=this.orbitStart+this.orbitMs;this.introMs=this.readyStart+this.pauseMs;this.duration=this.introMs+this.data.duration;
  const camera=new THREE.PerspectiveCamera();camera.position.copy(HOME_POSITION);camera.lookAt(0,0,0);const homeFrame=frameForCamera(camera),rotation=snappedViewRotation(homeFrame);this.scrambleTokens=formatScramble(this.data.initial.scramble,this.data.size,homeFrame);this.home={rotation:rotation.toArray(),radius:HOME_POSITION.length()};
  this.states=[solvedState(this.data.size)];for(const move of this.data.initial.scramble)this.states.push(applyMove(this.states.at(-1),move));
 }
 frame(at){
  at=Math.max(0,Math.min(this.duration,at));
  if(at<this.scrambleMs){const index=Math.floor(at/this.turnMs);return {state:this.states[index],view:this.home,keys:[],elapsed:0,paused:false,stage:'Scrambling',scrambleIndex:index,motions:[{move:this.data.initial.scramble[index],progress:(at%this.turnMs)/this.turnMs}]};}
  const still={state:this.states.at(-1),keys:[],elapsed:0,paused:false,motions:[],scrambleIndex:-1};
  if(at<this.orbitStart)return {...still,view:this.home,stage:'Scramble complete'};
  if(at<this.readyStart){
   const p=(at-this.orbitStart)/this.orbitMs,progress=p*p*(3-2*p),rotation=new THREE.Quaternion().fromArray(this.home.rotation).slerp(new THREE.Quaternion().fromArray(this.data.initial.view.rotation),progress).toArray();
   return {...still,view:{rotation,radius:this.home.radius+(this.data.initial.view.radius-this.home.radius)*progress},stage:'Reorienting'};
  }
  if(at<this.introMs)return {...still,view:this.data.initial.view,stage:'Ready'};
  return {...this.timeline.frame(at-this.introMs),stage:'Solve'};
 }
 sounds(from,to){
  const sounds=[];for(let i=1;i<=this.data.initial.scramble.length;i++)if(i*this.turnMs>from&&i*this.turnMs<=to)sounds.push('move');
  for(const e of this.soundEvents)if(e.at+this.introMs>from&&e.at+this.introMs<=to)sounds.push(e.kind);
  return sounds;
 }
}

export function recordedSounds(data){
 if(data.events.some(e=>e.type==='sound'))return data.events.filter(e=>e.type==='sound');
 let config;try{validateConfig(data.initial.keyboard,{legacyNames:true});config=data.initial.keyboard;}catch{config=defaultConfig(data.size);}
 const engine=new KeyboardEngine(structuredClone(config)),sounds=[];
 for(const e of data.events){
  if(e.type==='key'){
   const result=e.edge==='down'?engine.keyDown(e.code,{now:e.at,repeat:e.repeat,size:data.size}):engine.keyUp(e.code,{now:e.at});
   if(e.edge==='up'&&result?.action)sounds.push({at:e.at,kind:'suffix'});
   if(e.edge==='down'&&['depth','suffix-slice','rotate'].includes(result.action?.type))sounds.push({at:e.at,kind:result.action.type==='rotate'?'move':'suffix'});
  }
  if(e.type==='accept'){sounds.push({at:e.at,kind:'move'});if(e.action==='move')engine.consume();}
  if(e.type==='pause'||e.type==='reset-input')engine.clear({selection:true});
 }
 return sounds;
}

export function formatScramble(moves,size,frame){
 return moves.map(move=>{
  const face=FACES[frame.normals.findIndex(normal=>normal.every((v,i)=>v===move.normal[i]))]?.name??move.name;
  const {depth,count}=moveRange(move,size);let token=depth===1?(count===1?face:count===size?`[${face}]`:`${count===2?'':count}${face}w`):count===1?`${depth}${face}`:`${depth}–${depth+count-1}${face}`;
  return token+(move.dir<0?"'":'');
 });
}
