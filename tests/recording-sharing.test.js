import test from 'node:test';
import * as THREE from 'three';
import {frameForCamera,snappedViewRotation} from '../src/orientation.js';
import assert from 'node:assert/strict';
import {defaultConfig} from '../src/keyboard-engine.js';
import {validateRecording} from '../src/solve-recording.js';
import {encodeRecording,decodeRecording,recordingLink,recordingPayload,parseRecordingText,recordingID,recordingJSON,MAX_RECORDING_BYTES,SHARE_BASE} from '../src/recording-codec.js';
import {ReplayPresentation} from '../src/replay-presentation.js';
import {validateAlbumBackup,ALBUM_FORMAT} from '../src/recording-album.js';
import {exportUserData,validateUserData} from '../src/user-data.js';
const U={normal:[1,1,1],layer:'slice',depth:1,count:1,dir:1,name:'U'};
function recording(count=1){
 const events=[{at:0,type:'start'}];
 for(let i=0;i<count;i++){
  const at=i*160,angle=i*.017,round=n=>Math.round(n*1e6)/1e6;
  events.push({at,type:'key',edge:'down',code:'KeyF',repeat:false,modifiers:[false,false,false,false]},{at,type:'accept',id:i,action:'move',source:'keyboard',elapsedMs:at},{at,type:'animate',id:i,move:{...U,dir:-1},duration:100},{at,type:'sound',kind:'move'},{at:at+30,type:'view',view:{rotation:[0,round(Math.sin(angle/2)),0,round(Math.cos(angle/2))],radius:10},hold:{up:'U',front:'BR',notation:'CIF'}},{at:at+100,type:'turn',id:i,move:{...U,dir:-1}},{at:at+120,type:'key',edge:'up',code:'KeyF',repeat:false,modifiers:[false,false,false,false]});
 }
 return validateRecording({format:'fto-replay-v1',size:3,createdAt:'2026-11-05T12:34:56Z',completedAt:'2026-11-05T12:36:56Z',complete:true,startOnFirstMove:true,started:true,solveMs:count*160,duration:count*160,initial:{scramble:[U],view:{rotation:[0,0,0,1],radius:10},keyboard:defaultConfig(3),colors:{U:'#ffffff'}},events,note:'A solve on white • مرحبا 🐸'});
}

test('replay intro keeps the scramble visible through exact pauses and a slow shortest orbit',()=>{
 const presentation=new ReplayPresentation(recording()),{scrambleMs,orbitStart,readyStart,introMs}=presentation;
 assert.equal(orbitStart-scrambleMs,1000);assert.equal(readyStart-orbitStart,2000);assert.equal(introMs-readyStart,1000);
 assert.equal(presentation.frame(scrambleMs).stage,'Scramble complete');assert.deepEqual(presentation.frame(orbitStart-1).view,presentation.home);
 assert.equal(presentation.frame(orbitStart).stage,'Reorienting');assert.equal(presentation.frame(readyStart).stage,'Ready');assert.deepEqual(presentation.frame(introMs-1).view,presentation.data.initial.view);
 assert.equal(presentation.frame(introMs).stage,'Solve');assert.ok(presentation.scrambleTokens.length);assert.equal(presentation.frame(0).scrambleIndex,0);
});

test('replay scrambling starts in exact CIF and each turn is slow enough to follow',()=>{
 const data=recording(3);data.initial.scramble=[U,U,U];
 const presentation=new ReplayPresentation(data),rotation=new THREE.Quaternion().fromArray(presentation.home.rotation),camera=new THREE.PerspectiveCamera();
 camera.quaternion.copy(rotation).invert();const frame=frameForCamera(camera);
 assert.equal(frame.notation,'CIF');assert.ok(rotation.angleTo(snappedViewRotation(frame))<1e-7);
 for(const normal of [frame.normals[0],frame.normals[2]])assert.ok(Math.abs(new THREE.Vector3(...normal).applyQuaternion(rotation).x)<1e-8);
 assert.equal(presentation.turnMs,160);assert.equal(presentation.scrambleMs,480);
 assert.equal(presentation.frame(80).motions[0].progress,.5);assert.equal(presentation.frame(159).scrambleIndex,0);assert.equal(presentation.frame(160).scrambleIndex,1);
});

test('compressed Base64URL links use the deployment path and losslessly preserve recording data',async()=>{
 const data=recording(5),payload=await encodeRecording(data),link=await recordingLink(data);
 assert.ok(link.startsWith(SHARE_BASE+'#replay=1.'));assert.match(payload,/^1\.[A-Za-z0-9_-]+$/);assert.deepEqual(await decodeRecording(payload),data);
 assert.equal(recordingPayload(link),payload);assert.deepEqual(await parseRecordingText(link),data);assert.deepEqual(await parseRecordingText(recordingJSON(data)),data);assert.deepEqual(await parseRecordingText(payload),data);
 const reordered=Object.fromEntries(Object.entries(data).reverse());assert.equal(await recordingID(reordered),await recordingID(data));
});

test('a large realistic event trace shrinks well below the uncompressed text size',async t=>{
 const data=recording(600),raw=new TextEncoder().encode(recordingJSON(data)).length,link=await recordingLink(data);
 t.diagnostic(`${raw} bytes of recording data → ${link.length} link characters`);
 assert.ok(raw>400000);assert.ok(link.length<raw/4,`${link.length} link characters for ${raw} bytes`);assert.ok(link.length<100000);
 assert.deepEqual(await parseRecordingText(link),data);
});

test('invalid, unsupported and oversized compressed links fail without importing data',async()=>{
 for(const value of ['2.abc','1.%%%','1.abc','bad'])await assert.rejects(decodeRecording(value));
 await assert.rejects(parseRecordingText('https://ftoers.web.app/virtual/#nothing=1'));
 const oversized=new Blob([' '.repeat(MAX_RECORDING_BYTES+1)]).stream().pipeThrough(new CompressionStream('gzip'));
 const bytes=new Uint8Array(await new Response(oversized).arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);const token='1.'+btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 await assert.rejects(decodeRecording(token),/too large/);
});

test('album backup validation verifies encoded content and rejects changed metadata',async()=>{
 const data=recording(),entry={id:await recordingID(data),payload:await encodeRecording(data),size:3,solveMs:data.solveMs,pb:true,completedAt:data.completedAt,savedAt:data.completedAt};
 const backup={format:ALBUM_FORMAT,entries:[entry]};assert.equal(await validateAlbumBackup(backup),backup);
 await assert.rejects(validateAlbumBackup({...backup,entries:[{...entry,solveMs:1}]}),/does not match/);
 const storage={length:1,key:()=> 'master-fto-v1',getItem:()=>JSON.stringify({size:3,solves:{3:{history:[],redo:[],timer:{times:[]}}}})},full=exportUserData(storage);full.album=backup;assert.deepEqual(validateUserData(full),{puzzles:1,times:0});
 assert.throws(()=>validateUserData({...full,album:{format:'bad',entries:[]}}),/album/);
});

test('seeking slightly before the intro clamps to a valid first scramble frame',()=>{
 const presentation=new ReplayPresentation(recording());assert.deepEqual(presentation.frame(-1),presentation.frame(0));assert.deepEqual(presentation.frame(presentation.duration+100),presentation.frame(presentation.duration));
});
