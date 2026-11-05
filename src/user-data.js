import {validateAlbumEnvelope} from './recording-album.js';
import {validateConfig} from './keyboard-engine.js';
import {validateRecording} from './solve-recording.js';
import {FACES} from './puzzle.js';
export const BACKUP_FORMAT='fto-user-data-v1';
const ownKey=key=>key.startsWith('master-fto-');
export function exportUserData(storage){const entries={};for(let i=0;i<storage.length;i++){const key=storage.key(i);if(ownKey(key))entries[key]=storage.getItem(key);}return {format:BACKUP_FORMAT,createdAt:new Date().toISOString(),entries};}
export function validateUserData(data){
 if(!data||data.format!==BACKUP_FORMAT||!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries))throw Error('Not an FTO user-data backup');
 if(data.album!==undefined)validateAlbumEnvelope(data.album);
 const parsed={};
 for(const [key,value] of Object.entries(data.entries)){
  if(!ownKey(key)||typeof value!=='string')throw Error('Invalid backup storage entry');parsed[key]=['master-fto-v1','master-fto-settings-v1','master-fto-keyboard-v1','master-fto-keyboard-v2'].includes(key)?JSON.parse(value):value;
 }
 const app=parsed['master-fto-v1'];if(!app||!Number.isInteger(app.size)||app.size<2||app.size>20||!app.solves||typeof app.solves!=='object')throw Error('Backup is missing puzzle data');
 for(const [size,solve] of Object.entries(app.solves)){
  if(!Number.isInteger(+size)||+size<2||+size>20||!solve||!Array.isArray(solve.history)||!Array.isArray(solve.redo))throw Error('Invalid puzzle history');
  const move=m=>m&&typeof m.name==='string'&&FACES.some(f=>f.normal.every((n,i)=>n===m.normal?.[i]))&&[1,-1].includes(m.dir)&&['outer','inner','wide','ultra','slice'].includes(m.layer)&&(m.layer!=='slice'||Number.isInteger(m.depth)&&m.depth>=1&&m.depth<=+size&&Number.isInteger(m.count)&&m.count>=1&&m.depth+m.count<=+size+1);
  if(![...solve.history,...solve.redo].every(move))throw Error('Invalid saved move');
  if(solve.undoFloor!==undefined&&(!Number.isInteger(solve.undoFloor)||solve.undoFloor<0||solve.undoFloor>solve.history.length))throw Error('Invalid scramble boundary');
  if(solve.timer?.status!==undefined&&!['idle','scrambling','ready','running','paused','finished'].includes(solve.timer.status))throw Error('Invalid timer status');
  if(solve.view&&(!Array.isArray(solve.view.rotation)||solve.view.rotation.length!==4||!solve.view.rotation.every(Number.isFinite)||Math.hypot(...solve.view.rotation)<1e-9||!Number.isFinite(solve.view.radius)))throw Error('Invalid saved view');
  for(const entry of solve.timer?.times??[])if(!Number.isFinite(entry.ms)||entry.ms<0)throw Error('Invalid saved time');
  for(const key of ['last','pb','attempt'])if(solve.recordings?.[key])validateRecording(solve.recordings[key],{incomplete:key==='attempt'});
  for(const action of solve.pending??[])if(!['undo','redo'].includes(action.type)&&!(action.type==='move'&&move(action.move)))throw Error('Invalid pending move');
 }
 const keyboard=parsed['master-fto-keyboard-v2'];if(keyboard){if(!keyboard.profiles||typeof keyboard.profiles!=='object')throw Error('Invalid keyboard profiles');for(const config of Object.values(keyboard.profiles))validateConfig(config,{legacyNames:true});}
 if(parsed['master-fto-keyboard-v1'])validateConfig(parsed['master-fto-keyboard-v1'],{legacyNames:true});
 const settings=parsed['master-fto-settings-v1'];if(settings&&typeof settings!=='object')throw Error('Invalid settings');
 const checkMethod=(size,method,library=false)=>{
  if(!Number.isInteger(+size)||+size<2||+size>20||!method||!['off','bencisco','nautilus','custom'].includes(method.method))throw Error('Invalid saved method');
  if(library&&(typeof method.name!=='string'||typeof method.methodId!=='string'||method.customVersion!==2))throw Error('Invalid named method');
  if(method.method==='custom'){
   if(!Array.isArray(method.phases)||method.phases.length>128||method.phases.some(p=>!p||typeof p.name!=='string'||!['pattern','manual','finish'].includes(p.type)||(p.stickers!==undefined&&(!Array.isArray(p.stickers)||p.stickers.some(n=>!Number.isInteger(n)||n<0||n>=8*size*size)))))throw Error('Invalid method checkpoints');
  }
 };
 if(settings?.phaseMethods){if(typeof settings.phaseMethods!=='object'||Array.isArray(settings.phaseMethods))throw Error('Invalid methods list');for(const [size,list] of Object.entries(settings.phaseMethods)){if(!Array.isArray(list))throw Error('Invalid methods list');for(const method of list)checkMethod(size,method,true);}}
 if(settings?.phaseProfiles){if(typeof settings.phaseProfiles!=='object'||Array.isArray(settings.phaseProfiles))throw Error('Invalid selected methods');for(const [size,method] of Object.entries(settings.phaseProfiles))checkMethod(size,method);}
 return {puzzles:Object.keys(app.solves).length,times:Object.values(app.solves).reduce((sum,s)=>sum+(s.timer?.times?.length??0),0)};
}
export function restoreUserData(storage,data){
 validateUserData(data);const before=exportUserData(storage).entries;
 try{const keys=[];for(let i=0;i<storage.length;i++)if(ownKey(storage.key(i)))keys.push(storage.key(i));for(const key of keys)storage.removeItem(key);for(const [key,value] of Object.entries(data.entries))storage.setItem(key,value);}
 catch(error){const keys=[];for(let i=0;i<storage.length;i++)if(ownKey(storage.key(i)))keys.push(storage.key(i));for(const key of keys)storage.removeItem(key);for(const [key,value] of Object.entries(before))storage.setItem(key,value);throw error;}
}
