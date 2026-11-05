import test from 'node:test';
import assert from 'node:assert/strict';
import {SolveRecorder,withoutPauses,recordingFrame,validateRecording} from '../src/solve-recording.js';
import {recordingID,encodeRecording,decodeRecording} from '../src/recording-codec.js';
import {ReplayPresentation} from '../src/replay-presentation.js';
import {isSolved} from '../src/puzzle.js';
const U={normal:[1,1,1],dir:1,layer:'slice',depth:1,count:1,name:'U'},view={rotation:[0,0,0,1],radius:10};
const arm=r=>r.arm({size:3,scramble:[U],view,keyboard:{preset:'abid'},colors:{}});

test('paused inputs, camera motion, audio and elapsed time are absent from new recordings',()=>{
 let now=0;const r=new SolveRecorder({},()=>now);arm(r);r.event('start');now=100;r.event('key',{code:'KeyF',edge:'down'});r.event('pause');
 now=10000;r.event('key',{code:'KeyZ',edge:'down'});r.view({rotation:[0,.6,0,.8],radius:11},{notation:'CIF'});r.event('sound',{kind:'move'});r.event('resume');
 r.view({rotation:[0,.6,0,.8],radius:11},{notation:'CIF'});now=10100;r.event('turn',{id:1,move:{...U,dir:-1}});r.finish(200,true);
 const data=validateRecording(r.last);assert.equal(data.duration,200);assert.equal(data.pauseFree,true);assert.ok(!data.events.some(e=>['pause','resume','sound'].includes(e.type)||e.code==='KeyZ'));assert.equal(data.events.find(e=>e.type==='view').at,100);assert.equal(recordingFrame(data,150).keys.length,0);assert.ok(isSolved(recordingFrame(data,200).state));
});

test('reload freezes at the saved checkpoint and excludes all offline time',()=>{
 let now=0;let r=new SolveRecorder({},()=>now);arm(r);r.event('start');now=120;const saved=JSON.parse(JSON.stringify(r.serialize()));now=50000;r=new SolveRecorder(saved,()=>now);r.event('resume');now=50080;r.event('turn',{id:1,move:{...U,dir:-1}});r.finish(200,true);assert.equal(r.last.duration,200);assert.equal(r.last.events.at(-1).at,200);
});

test('legacy pauses are skipped for playback while original files and album IDs remain unchanged',async()=>{
 const original={format:'fto-replay-v1',size:3,complete:true,startOnFirstMove:true,solveMs:200,duration:10200,initial:{scramble:[U],view},events:[{at:0,type:'start'},{at:80,type:'key',code:'KeyF',edge:'down'},{at:100,type:'pause'},{at:5000,type:'view',view:{rotation:[0,.6,0,.8],radius:11}},{at:10100,type:'resume'},{at:10200,type:'turn',id:1,move:{...U,dir:-1}}]};
 const before=structuredClone(original),id=await recordingID(original),data=withoutPauses(original);assert.equal(data.duration,200);assert.equal(data.events.find(e=>e.type==='view').at,100);assert.ok(!data.events.some(e=>['pause','resume'].includes(e.type)));assert.deepEqual(original,before);
 const player=new ReplayPresentation(original);assert.equal(player.duration-player.introMs,200);assert.ok(isSolved(player.frame(player.duration).state));assert.equal(player.frame(player.introMs+150).paused,false);
 const decoded=await decodeRecording(await encodeRecording(original));assert.equal(await recordingID(decoded),id);assert.deepEqual(decoded,original);
});

test('legacy unfinished recordings use the saved timer time when resumed after an upgrade',()=>{
 let now=10000;const attempt={format:'fto-replay-v1',size:3,complete:false,startOnFirstMove:true,started:true,epoch:0,initial:{scramble:[U],view},events:[{at:0,type:'start'},{at:100,type:'pause'}]};
 const r=new SolveRecorder({attempt},()=>now,{elapsedMs:100});r.event('resume');now=10100;r.event('turn',{id:1,move:{...U,dir:-1}});r.finish(200,true);assert.equal(r.last.duration,200);assert.ok(!r.last.events.some(e=>['pause','resume'].includes(e.type)));
});

test('a turn accepted before pausing can finish at the cut without losing its state',()=>{
 let now=0;const r=new SolveRecorder({},()=>now);arm(r);r.event('start');r.event('animate',{id:1,move:{...U,dir:-1},duration:145});now=40;r.event('pause');now=10000;r.event('turn',{id:1,move:{...U,dir:-1}});r.finish(0,true);assert.equal(r.last.duration,40);assert.equal(r.last.events.at(-1).at,40);assert.ok(isSolved(recordingFrame(r.last,40).state));
});
