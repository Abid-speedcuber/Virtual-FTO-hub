import {encodeRecording,decodeRecording,recordingID} from './recording-codec.js';
export const ALBUM_FORMAT='fto-recording-album-v1';
const metadata=({payload,...entry})=>entry;
export function newlyBestAverages(times,averageWindow){return [5,12].filter(count=>{const current=averageWindow(times,count);if(!current||!Number.isFinite(current.value))return false;for(let end=count;end<times.length;end++){if(averageWindow(times,count,end).value<=current.value)return false;}return true;});}
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function validateAlbumEnvelope(data){
 if(!data||data.format!==ALBUM_FORMAT||!Array.isArray(data.entries)||data.entries.length>20000)throw Error('Invalid recording album');
 if(data.deleted!==undefined&&(!Array.isArray(data.deleted)||data.deleted.length>20000))throw Error('Invalid deleted album entries');
 if(data.windows!==undefined&&(!Array.isArray(data.windows)||data.windows.length>3||new Set(data.windows.map(w=>w?.size)).size!==data.windows.length||data.windows.some(w=>![2,3,4].includes(w?.size)||!Array.isArray(w.entries)||w.entries.length>12||w.entries.some(e=>!e||!Number.isFinite(e.ms)||e.ms<0||typeof e.dnf!=='boolean'||e.id!==null&&!/^r-[a-f0-9]{64}$/.test(e.id)))))throw Error('Invalid recent solve windows');
 const ids=new Set();for(const row of data.entries){if(!row||!/^r-[a-f0-9]{64}$/.test(row.id)||ids.has(row.id)||![2,3,4].includes(row.size)||!Number.isFinite(row.solveMs)||row.solveMs<0||typeof row.pb!=='boolean'||!validDate(row.completedAt)||!validDate(row.savedAt)||typeof row.payload!=='string')throw Error('Invalid album entry');if(row.manual!==undefined&&typeof row.manual!=='boolean'||row.recent!==undefined&&typeof row.recent!=='boolean'||row.averagePB!==undefined&&(!Array.isArray(row.averagePB)||row.averagePB.some(n=>![5,12].includes(n))||new Set(row.averagePB).size!==row.averagePB.length))throw Error('Invalid recording retention flags');ids.add(row.id);}
 const deleted=new Set();for(const row of data.deleted??[]){if(!row||!/^r-[a-f0-9]{64}$/.test(row.id)||ids.has(row.id)||deleted.has(row.id)||!validDate(row.deletedAt)||typeof row.pb!=='boolean')throw Error('Invalid deleted album entry');deleted.add(row.id);}return data;
}
export async function validateAlbumBackup(data){
 validateAlbumEnvelope(data);
 for(let i=0;i<data.entries.length;i+=4)await Promise.all(data.entries.slice(i,i+4).map(async row=>{const recording=await decodeRecording(row.payload);if(recording.size!==row.size||recording.solveMs!==row.solveMs||await recordingID(recording)!==row.id)throw Error('Album entry does not match its recording');}));
 return data;
}
export class RecordingAlbum extends EventTarget{
 constructor(database=globalThis.indexedDB){super();this.database=database;this.opened=null;this.pending=new Set();this.retentionChain=Promise.resolve();}
 open(){
  if(!this.database)return Promise.reject(Error('Recording album storage is unavailable'));
  return this.opened??=new Promise((resolve,reject)=>{
   const request=this.database.open('master-fto-album-v1',3);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('solve-windows'))request.result.createObjectStore('solve-windows',{keyPath:'size'});if(!request.result.objectStoreNames.contains('recordings'))request.result.createObjectStore('recordings',{keyPath:'id'});if(!request.result.objectStoreNames.contains('deleted-recordings'))request.result.createObjectStore('deleted-recordings',{keyPath:'id'});};
   request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.opened=null;};resolve(db);};request.onerror=()=>{this.opened=null;reject(request.error??Error('Could not open recording album'));};
  });
 }
 add(recording,{pb=false,completedAt,shouldSave=()=>true,automatic=false}={}){
  const promise=this.save(recording,{pb,completedAt,shouldSave,automatic});this.pending.add(promise);promise.finally(()=>this.pending.delete(promise)).catch(()=>{});return promise;
 }
 async save(recording,{pb,completedAt,shouldSave,automatic}){
  const [id,payload,db]=await Promise.all([recordingID(recording),encodeRecording(recording),this.open()]);if(!shouldSave())return null;
  const now=new Date().toISOString(),date=completedAt??recording.completedAt??recording.createdAt;
  const row={id,size:recording.size,solveMs:recording.solveMs,completedAt:validDate(date)?date:now,savedAt:now,pb:!!pb,manual:!automatic,averagePB:[],recent:false,payload};
  return new Promise((resolve,reject)=>{
   const transaction=db.transaction(['recordings','deleted-recordings'],'readwrite'),store=transaction.objectStore('recordings'),deleted=transaction.objectStore('deleted-recordings'),getDeleted=deleted.get(id);let result=null;
   getDeleted.onsuccess=()=>{if(automatic&&getDeleted.result)return;const get=store.get(id);get.onsuccess=()=>{const previous=get.result;result=previous?{...previous,pb:previous.pb||row.pb,manual:(previous.manual??true)||row.manual}:{...row,pb:row.pb||!!getDeleted.result?.pb};store.put(result);deleted.delete(id);};};
   transaction.oncomplete=()=>{resolve(result?metadata(result):null);if(result)this.dispatchEvent(new Event('change'));};transaction.onabort=()=>reject(transaction.error??Error('Could not save recording to album'));

  });
 }
 // All memberships refer to the same recording row. Overlapping PB windows
 // only add pin flags; they never copy the payload into a second collection.
 remember(recording,{size=recording?.size,entry,pb=false,averagePB=[]}={}){
  if(![2,3,4].includes(size))return Promise.resolve();
  const task=this.retentionChain.then(()=>this.rememberNow(recording,{size,entry,pb,averagePB}));this.retentionChain=task.catch(()=>{});this.pending.add(task);task.finally(()=>this.pending.delete(task)).catch(()=>{});return task;
 }
 async rememberNow(recording,{size,entry,pb,averagePB}){
  const db=await this.open(),id=recording?await recordingID(recording):null,payload=recording?await encodeRecording(recording):null,now=new Date().toISOString();
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(['recordings','deleted-recordings','solve-windows'],'readwrite'),store=tx.objectStore('recordings'),windows=tx.objectStore('solve-windows'),request=windows.get(size);
   request.onsuccess=()=>{const previous=request.result?.entries??[],next=[...previous,{id,ms:entry?.ms??recording?.solveMs??0,dnf:!!entry?.dnf||!recording}].slice(-12);
    const finalize=()=>{
     windows.put({size,entries:next});
     const pins=new Map();for(const count of averagePB){if(next.length<count)continue;for(const member of next.slice(-count)){if(member.id)pins.set(member.id,[...(pins.get(member.id)??[]),count]);}}for(const [id,counts] of pins){const get=store.get(id);get.onsuccess=()=>{const row=get.result;if(row)store.put({...row,averagePB:[...new Set([...(row.averagePB??[]),...counts])]});};}
     const keep=new Set(next.map(e=>e.id));for(const evicted of new Set(previous.map(e=>e.id).filter(id=>id&&!keep.has(id)))){const get=store.get(evicted);get.onsuccess=()=>{const row=get.result;if(!row)return;if(row.pb||row.manual!==false||row.averagePB?.length)store.put({...row,recent:false});else store.delete(evicted);};}
    };
    if(!recording){finalize();return;}
    const removed=tx.objectStore('deleted-recordings').get(id);removed.onsuccess=()=>{if(removed.result){next.at(-1).id=null;finalize();return;}const get=store.get(id);get.onsuccess=()=>{const old=get.result;store.put(old?{...old,pb:old.pb||pb,recent:true}:{id,size,solveMs:recording.solveMs,completedAt:recording.completedAt??now,savedAt:now,pb,manual:false,averagePB:[],recent:true,payload});finalize();};};
   };
   tx.oncomplete=()=>{this.dispatchEvent(new Event('change'));resolve();};tx.onabort=()=>reject(tx.error??Error('Could not retain solve recordings'));
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
 async export(){await this.flush();const [entries,deleted,windows]=await Promise.all([this.rows(),this.rows('deleted-recordings'),this.rows('solve-windows')]);return {format:ALBUM_FORMAT,entries,deleted,windows};}
 async restoreValidated(data){
  validateAlbumEnvelope(data);await this.flush();const db=await this.open();
  return new Promise((resolve,reject)=>{const tx=db.transaction(['recordings','deleted-recordings','solve-windows'],'readwrite'),store=tx.objectStore('recordings'),deleted=tx.objectStore('deleted-recordings');store.clear();deleted.clear();const windows=tx.objectStore('solve-windows');windows.clear();for(const row of data.windows??[])windows.put(row);for(const row of data.entries)store.put(row);for(const row of data.deleted??[])deleted.put(row);tx.oncomplete=()=>{resolve();this.dispatchEvent(new Event('change'));};tx.onabort=()=>reject(tx.error??Error('Could not restore album'));});
 }
}
