import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SolveRecorder,withoutInspection,recordingFrame} from '../src/solve-recording.js';
import {ReplayPresentation} from '../src/replay-presentation.js';
import {namedMethod,migrateMethods,migrateCustomTrace} from '../src/split-methods.js';
import {exportUserData,validateUserData,restoreUserData} from '../src/user-data.js';
import {defaultConfig} from '../src/keyboard-engine.js';
import {applyMove,inverse,solvedState,isSolved,signature} from '../src/puzzle.js';
const move={normal:[1,1,1],layer:'slice',depth:1,count:1,dir:1,name:'U'},view={rotation:[0,0,0,1],radius:10};
const arm=recorder=>recorder.arm({size:3,scramble:[move],view,keyboard:defaultConfig(3),colors:{U:'#ffffff'}});
function fixture(){let now=0;const recorder=new SolveRecorder({},()=>now);arm(recorder);now=30000;recorder.view({rotation:[0,.6,0,.8],radius:11},{notation:'CIF',up:'U',front:'BR'});recorder.event('key',{edge:'down',code:'KeyF'});recorder.event('start');recorder.event('sound',{kind:'move'});now=30100;recorder.event('turn',{id:1,move:inverse(move)});recorder.finish(100,true,{profile:{method:'off',phases:[]},groups:[]});return recorder.last;}

test('inspection is excluded but the exact initial hold and held keys survive',()=>{
 const data=fixture();assert.equal(data.duration,100);assert.equal(data.events[0].at,0);assert.deepEqual(data.initial.view,{rotation:[0,.6,0,.8],radius:11});assert.ok(!data.events.some(e=>e.at>100));assert.ok(isSolved(recordingFrame(data,100).state));
});
test('the replay introduces the real scramble and a shortest quaternion orbit, then the original solve',()=>{
 const data=fixture(),presentation=new ReplayPresentation(data);assert.ok(isSolved(presentation.frame(0).state));
 assert.equal(signature(presentation.frame(presentation.scrambleMs).state),signature(applyMove(solvedState(3),move)));
 const from=new THREE.Quaternion().fromArray(presentation.home.rotation),to=new THREE.Quaternion().fromArray(data.initial.view.rotation);
 const mid=new THREE.Quaternion().fromArray(presentation.frame(presentation.orbitStart+presentation.orbitMs/2).view.rotation);assert.ok(Math.abs(from.angleTo(mid)-from.angleTo(to)/2)<1e-7);
 assert.ok(isSolved(presentation.frame(presentation.duration).state));assert.deepEqual(presentation.sounds(presentation.introMs-1,presentation.introMs+1),['move']);
});
test('legacy files shed inspection without mutating the original recording',()=>{
 const original=fixture();delete original.startOnFirstMove;original.events=original.events.map(e=>({...e,at:e.at+9000}));original.duration+=9000;
 const copy=withoutInspection(original);assert.equal(copy.duration,100);assert.equal(copy.events.find(e=>e.type==='start').at,0);assert.equal(original.duration,9100);
});
test('named custom methods end in exactly one renamed Finish, and old LL + Finish traces migrate',()=>{
 const legacy={method:'custom',phases:[{name:'FB',type:'pattern',stickers:[0]},{name:'LL',type:'pattern',stickers:[1]},{name:'Finish',type:'finish'}]};
 const method=namedMethod(3,legacy,'My Nautilus','mine');assert.deepEqual(method.phases.map(p=>[p.name,p.type]),[['FB','pattern'],['LL','finish']]);
 const trace=migrateCustomTrace({profile:legacy,groups:[{start:0,end:0,ms:10},{start:1,end:2,ms:30}],complete:true},3);assert.equal(trace.groups.at(-1).end,1);assert.equal(trace.profile.phases.at(-1).name,'LL');
 const profiles={3:legacy},library={};migrateMethods(profiles,library);migrateMethods(profiles,library);assert.equal(library[3].length,1);assert.equal(profiles[3].customVersion,2);
 for(let i=0;i<100;i++)library[3].push(namedMethod(3,{customVersion:2,phases:[{name:'LL',type:'finish'}]},`Method ${i}`,String(i)));assert.equal(library[3].length,101);
});
class MemoryStorage{
 constructor(entries={}){this.data=new Map(Object.entries(entries));}get length(){return this.data.size;}key(i){return [...this.data.keys()][i];}getItem(key){return this.data.get(key)??null;}setItem(key,value){if(this.failOnce){this.failOnce=false;throw Error('Full');}this.data.set(key,value);}removeItem(key){this.data.delete(key);}
}
function storage(){return new MemoryStorage({'unrelated':'keep','master-fto-v1':JSON.stringify({size:3,solves:{3:{history:[move],redo:[],undoFloor:1,timer:{status:'ready',times:[{ms:100}]},recordings:{last:fixture(),pbIsLast:true}}}}),'master-fto-settings-v1':JSON.stringify({phaseMethods:{3:[namedMethod(3,{customVersion:2,phases:[{name:'LL',type:'finish'}]},'Mine','mine')]},outerTurnBias:93}),'master-fto-keyboard-v2':JSON.stringify({profiles:{3:defaultConfig(3)},display:{show:true}})});}
test('complete backups round-trip all puzzle data, bindings, methods, recordings and preferences',()=>{
 const original=storage(),backup=exportUserData(original);assert.deepEqual(validateUserData(backup),{puzzles:1,times:1});const other=new MemoryStorage({unrelated:'untouched','master-fto-obsolete':'{}'});restoreUserData(other,backup);
 assert.deepEqual(exportUserData(other).entries,backup.entries);assert.equal(other.getItem('unrelated'),'untouched');assert.equal(other.getItem('master-fto-obsolete'),null);
});
test('invalid backups are rejected before writing, and a write failure restores the prior data',()=>{
 const target=storage(),before=exportUserData(target),bad=structuredClone(before);bad.entries['master-fto-v1']='{}';assert.throws(()=>restoreUserData(target,bad));assert.deepEqual(exportUserData(target).entries,before.entries);
 const incoming=storage();incoming.setItem('master-fto-extra','{}');target.failOnce=true;assert.throws(()=>restoreUserData(target,exportUserData(incoming)),/Full/);assert.deepEqual(exportUserData(target).entries,before.entries);
});

test('legacy replay sounds follow solver rotation and suffix bindings',async()=>{
 const {recordedSounds}=await import('../src/replay-presentation.js');const data=fixture();data.events=data.events.filter(e=>e.type!=='sound');data.initial.keyboard.modes[0].bindings.find(b=>b.trigger==='F').action={type:'rotate',face:'U',dir:1,kind:'outer',depth:1};
 data.events=[{at:0,type:'key',edge:'down',code:'KeyF'},{at:10,type:'key',edge:'up',code:'KeyF'},{at:20,type:'key',edge:'down',code:'Digit2'},{at:30,type:'key',edge:'up',code:'Digit2'}];
 const sounds=recordedSounds(data);assert.equal(sounds[0].kind,'move');assert.ok(sounds.some(e=>e.kind==='suffix'));
});

test('malformed method and replay metadata are rejected before a backup can replace valid data',()=>{
 const target=storage(),before=exportUserData(target),bad=structuredClone(before),settings=JSON.parse(bad.entries['master-fto-settings-v1']);settings.phaseMethods[3][0].phases=[null];bad.entries['master-fto-settings-v1']=JSON.stringify(settings);
 assert.throws(()=>restoreUserData(target,bad),/checkpoints/);assert.deepEqual(exportUserData(target).entries,before.entries);
});

test('opaque future app entries are retained byte-for-byte in full backups',()=>{
 const original=storage();original.setItem('master-fto-opaque','not JSON, still user data');const backup=exportUserData(original),other=new MemoryStorage();restoreUserData(other,backup);assert.equal(other.getItem('master-fto-opaque'),'not JSON, still user data');
});

test('migrating an unfinished last-layer checkpoint does not mark the renamed finish complete',()=>{
 const legacy={profile:{method:'custom',phases:[{name:'FB',type:'pattern',stickers:[0]},{name:'LL',type:'pattern',stickers:[1]},{name:'Finish',type:'finish'}]},groups:[{start:0,end:0,ms:10},{start:1,end:1,ms:20}],complete:false};
 const next=migrateCustomTrace(legacy,3);assert.deepEqual(next.groups.map(g=>g.end),[0]);assert.equal(next.profile.phases.at(-1).name,'LL');assert.equal(next.complete,false);
});
