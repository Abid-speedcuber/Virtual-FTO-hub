import test from 'node:test';
import assert from 'node:assert/strict';
import {SolveRecorder,validateRecording,recordingFrame} from '../src/solve-recording.js';
import {solvedState,applyMove,inverse,signature,isSolved} from '../src/puzzle.js';
const U={normal:[1,1,1],layer:'slice',depth:1,count:1,dir:1,name:'U'},R={normal:[1,1,-1],layer:'slice',depth:1,count:1,dir:1,name:'R'};
const view={rotation:[0,0,0,1],radius:10};
const arm=(recorder,size=3)=>recorder.arm({size,scramble:[U,R],view,keyboard:{preset:'abid'},colors:{U:'#ffffff'}});

test('recordings retain raw keys, views, resolved turns, pauses and animation interruption on 2x2–4x4',()=>{
 for(const size of [2,3,4]){
  let now=0;const recorder=new SolveRecorder({},()=>now);arm(recorder,size);
  now=20;recorder.event('key',{code:'KeyF',edge:'down',repeat:false});recorder.event('start');const id=recorder.accept({type:'move',elapsedMs:0});
  recorder.event('animate',{id,move:inverse(R),duration:145});now=50;recorder.view({rotation:[0,.6,0,.8],radius:11},{up:'U',front:'F',notation:'CIF'});
  now=60;recorder.event('turn',{id,move:inverse(R)}); // animation was interrupted
  now=70;recorder.event('key',{code:'KeyF',edge:'up'});recorder.event('pause');now=700;recorder.event('resume');
  now=730;const second=recorder.accept({type:'move',elapsedMs:80});recorder.event('turn',{id:second,move:inverse(U)});recorder.finish(80,true);
  const recording=validateRecording(recorder.last);assert.equal(recording.size,size);assert.equal(recording.events.find(e=>e.type==='key').at,20);
  const during=recordingFrame(recording,40);assert.equal(during.motions.length,1);assert.deepEqual(during.keys,['KeyF']);
  const interrupted=recordingFrame(recording,65);assert.equal(interrupted.motions.length,0);assert.equal(interrupted.view.radius,11);
  const paused=recordingFrame(recording,500);assert.equal(paused.paused,true);assert.equal(paused.elapsed,50);
  const final=recordingFrame(recording,recording.duration);assert.ok(isSolved(final.state));assert.equal(final.elapsed,80);assert.equal(final.motions.length,0);
  assert.equal(signature(recordingFrame(recording,0).state),signature([U,R].reduce(applyMove,solvedState(size))));
 }
});

test('last solve changes each finish, PB stays until a new best, and both survive serialization',()=>{
 let now=0;const recorder=new SolveRecorder({},()=>now);arm(recorder);now=100;recorder.finish(100,true);const pb=recorder.pb;
 assert.equal(recorder.serialize().pbIsLast,true);
 arm(recorder);now=300;recorder.finish(200,false);assert.equal(recorder.pb,pb);assert.equal(recorder.last.solveMs,200);
 const restored=new SolveRecorder(JSON.parse(JSON.stringify(recorder.serialize())),()=>now);assert.equal(restored.pb.solveMs,100);assert.equal(restored.last.solveMs,200);
 arm(restored);now=350;restored.finish(50,true);assert.equal(restored.pb,restored.last);assert.equal(restored.pb.solveMs,50);
 restored.discard();assert.ok(restored.last);assert.ok(restored.pb);
 arm(restored,5);assert.equal(restored.attempt,null);
});

test('an unfinished recording survives reload with its original event times and animation IDs',()=>{
 let now=0;const recorder=new SolveRecorder({},()=>now);arm(recorder);now=50;recorder.event('start');const id=recorder.accept({type:'move',elapsedMs:0});recorder.event('pause');
 const restored=new SolveRecorder(JSON.parse(JSON.stringify(recorder.serialize())),()=>now);now=500;restored.event('resume');assert.ok(restored.accept({type:'undo',elapsedMs:20})>id);
 assert.equal(restored.attempt.events[0].at,50);assert.equal(restored.attempt.events.at(-2).at,500);
});

test('shared recordings reject corrupt views, moves, event types, times and incomplete files',()=>{
 let now=0;const recorder=new SolveRecorder({},()=>now);arm(recorder);now=10;recorder.event('turn',{id:1,move:U});recorder.finish(10,true);
 for(const mutate of [d=>d.size=20,d=>d.initial.view.rotation=[0,0,0,0],d=>d.events[0].move.normal=[0,1,0],d=>d.events[0].at=-1,d=>d.events[0].type='script',d=>d.complete=false,d=>d.duration=0]){
  const data=structuredClone(recorder.last);mutate(data);assert.throws(()=>validateRecording(data));
 }
});

test('incremental playback matches independent seeking forwards and backwards',async()=>{
 const {RecordingTimeline}=await import('../src/solve-recording.js');let now=0;const recorder=new SolveRecorder({},()=>now);arm(recorder);
 now=10;recorder.event('start');now=50;recorder.event('animate',{id:1,move:inverse(R),duration:100});now=80;recorder.event('turn',{id:1,move:inverse(R)});now=100;recorder.event('pause');now=500;recorder.event('resume');now=550;recorder.event('turn',{id:2,move:inverse(U)});recorder.finish(150,true);
 const timeline=new RecordingTimeline(recorder.last);
 for(const at of [0,20,60,90,120,400,510,550,600,70,30,0,550])assert.deepEqual(timeline.frame(at),recordingFrame(recorder.last,at));
});

test('a final accepted move that finishes during a pause replays the finished puzzle in color',()=>{
 let now=0;const recorder=new SolveRecorder({},()=>now);arm(recorder);now=10;recorder.event('start');now=50;recorder.event('pause');now=100;recorder.finish(40,true);
 assert.equal(recordingFrame(recorder.last,70).paused,true);assert.equal(recordingFrame(recorder.last,100).paused,false);
});
