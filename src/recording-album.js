import {encodeRecording,decodeRecording,recordingID} from './recording-codec.js';
export const ALBUM_FORMAT='fto-recording-album-v1';
const metadata=({payload,...entry})=>entry;
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function validateAlbumEnvelope(data){
 if(!data||data.format!==ALBUM_FORMAT||!Array.isArray(data.entries)||data.entries.length>20000)throw Error('Invalid recording album');
 if(data.deleted!==undefined&&(!Array.isArray(data.deleted)||data.deleted.length>20000))throw Error('Invalid deleted album entries');
 const ids=new Set();for(const row of data.entries){if(!row||!/^r-[a-f0-9]{64}$/.test(row.id)||ids.has(row.id)||![2,3,4].includes(row.size)||!Number.isFinite(row.solveMs)||row.solveMs<0||typeof row.pb!=='boolean'||!validDate(row.completedAt)||!validDate(row.savedAt)||typeof row.payload!=='string')throw Error('Invalid album entry');ids.add(row.id);}
 const deleted=new Set();for(const row of data.deleted??[]){if(!row||!/^r-[a-f0-9]{64}$/.test(row.id)||ids.has(row.id)||deleted.has(row.id)||!validDate(row.deletedAt)||typeof row.pb!=='boolean')throw Error('Invalid deleted album entry');deleted.add(row.id);}return data;
}
export async function validateAlbumBackup(data){
 validateAlbumEnvelope(data);
 for(let i=0;i<data.entries.length;i+=4)await Promise.all(data.entries.slice(i,i+4).map(async row=>{const recording=await decodeRecording(row.payload);if(recording.size!==row.size||recording.solveMs!==row.solveMs||await recordingID(recording)!==row.id)throw Error('Album entry does not match its recording');}));
 return data;
}
export class RecordingAlbum extends EventTarget{
 constructor(database=globalThis.indexedDB){super();this.database=database;this.opened=null;this.pending=new Set();}
 open(){
  if(!this.database)return Promise.reject(Error('Recording album storage is unavailable'));
  return this.opened??=new Promise((resolve,reject)=>{
   const request=this.database.open('master-fto-album-v1',2);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('recordings'))request.result.createObjectStore('recordings',{keyPath:'id'});if(!request.result.objectStoreNames.contains('deleted-recordings'))request.result.createObjectStore('deleted-recordings',{keyPath:'id'});};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.opened=null;};resolve(db);};request.onerror=()=>{this.opened=null;reject(request.error??Error('Could not open recording album'));};
  });
 }
 add(recording,{pb=false,completedAt,shouldSave=()=>true,automatic=false}={}){
  const promise=this.save(recording,{pb,completedAt,shouldSave,automatic});this.pending.add(promise);promise.finally(()=>this.pending.delete(promise)).catch(()=>{});return promise;
 }
 async save(recording,{pb,completedAt,shouldSave,automatic}){
  const [id,payload,db]=await Promise.all([recordingID(recording),encodeRecording(recording),this.open()]);if(!shouldSave())return null;
  const now=new Date().toISOString(),date=completedAt??recording.completedAt??recording.createdAt;
  const row={id,size:recording.size,solveMs:recording.solveMs,completedAt:validDate(date)?date:now,savedAt:now,pb:!!pb,payload};
  return new Promise((resolve,reject)=>{
   const transaction=db.transaction(['recordings','deleted-recordings'],'readwrite'),store=transaction.objectStore('recordings'),deleted=transaction.objectStore('deleted-recordings'),getDeleted=deleted.get(id);let result=null;
   getDeleted.onsuccess=()=>{if(automatic&&getDeleted.result)return;const get=store.get(id);get.onsuccess=()=>{const previous=get.result;result=previous?{...previous,pb:previous.pb||row.pb}:{...row,pb:row.pb||!!getDeleted.result?.pb};store.put(result);deleted.delete(id);};};
   transaction.oncomplete=()=>{resolve(result?metadata(result):null);if(result)this.dispatchEvent(new Event('change'));};transaction.onabort=()=>reject(transaction.error??Error('Could not save recording to album'));

  });
 }
 async flush(){while(this.pending.size)await Promise.allSettled([...this.pending]);}
 async rows(store='recordings'){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),request=tx.objectStore(store).getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 async list(){await this.flush();return (await this.rows()).map(metadata).sort((a,b)=>Date.parse(b.completedAt)-Date.parse(a.completedAt)||Date.parse(b.savedAt)-Date.parse(a.savedAt)||a.id.localeCompare(b.id));}
 async get(id){const db=await this.open();const row=await new Promise((resolve,reject)=>{const request=db.transaction('recordings').objectStore('recordings').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});if(!row)throw Error('Recording is no longer in the album');return decodeRecording(row.payload);}
 async has(id){await this.flush();const db=await this.open();return new Promise((resolve,reject)=>{const request=db.transaction('recordings').objectStore('recordings').getKey(id);request.onsuccess=()=>resolve(request.result!==undefined);request.onerror=()=>reject(request.error);});}
 async remove(id){
  await this.flush();const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['recordings','deleted-recordings'],'readwrite'),store=tx.objectStore('recordings'),get=store.get(id);get.onsuccess=()=>{if(!get.result)return;store.delete(id);tx.objectStore('deleted-recordings').put({id,deletedAt:new Date().toISOString(),pb:get.result.pb});};tx.oncomplete=()=>{resolve();this.dispatchEvent(new Event('change'));};tx.onabort=()=>reject(tx.error??Error('Could not delete recording'));});
 }
 async export(){await this.flush();const [entries,deleted]=await Promise.all([this.rows(),this.rows('deleted-recordings')]);return {format:ALBUM_FORMAT,entries,deleted};}
 async restoreValidated(data){
  validateAlbumEnvelope(data);await this.flush();const db=await this.open();
  return new Promise((resolve,reject)=>{const tx=db.transaction(['recordings','deleted-recordings'],'readwrite'),store=tx.objectStore('recordings'),deleted=tx.objectStore('deleted-recordings');store.clear();deleted.clear();for(const row of data.entries)store.put(row);for(const row of data.deleted??[])deleted.put(row);tx.oncomplete=()=>{resolve();this.dispatchEvent(new Event('change'));};tx.onabort=()=>reject(tx.error??Error('Could not restore album'));});
 }
}
