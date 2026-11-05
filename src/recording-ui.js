import {validateRecording,withoutInspection} from './solve-recording.js';
import {recordingLink,recordingJSON,parseRecordingText,recordingPayload,decodeRecording,clearRecordingLink,recordingID} from './recording-codec.js';
import {icon} from './icons.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
export function downloadJSON(data,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export class RecordingUI{
 constructor({getSize,getRecordings,pause,play,current,album,pauseForShare,confirm,isReplaying=()=>false}){
  Object.assign(this,{getSize,getRecordings,pause,play,current,album,pauseForShare,confirm,isReplaying});this.shareVersion=0;this.linkVersion=0;this.albumStateVersion=0;this.albumVersion=0;this.importVersion=0;this.importBusy=false;
  $('history-recordings').onclick=()=>this.openAlbum();
  $('mobile-share-current').onclick=()=>this.share(this.getRecordings().last,{home:true});$('history-share-pb').onclick=()=>this.share(this.getRecordings().pb);$('home-replay-share').onclick=()=>this.share(this.current?.());
  $('share-current').onclick=()=>this.share(this.current?.()??this.getRecordings().last,{home:true});$('share-pb').onclick=()=>this.share(this.getRecordings().pb,{home:true});
  $('share-watch').innerHTML=icon('resume')+'Watch solve';$('share-watch').onclick=()=>{if(this.shareData)this.play(this.shareData);};
  $('close-share').onclick=()=>$('share-dialog').close();$('share-link').onclick=()=>this.copy(this.shareLink,'Link copied');$('share-text').onclick=()=>this.copy(this.shareText,'Recording text copied');
  $('share-json').onclick=()=>{if(this.shareData)downloadJSON(this.shareData,`fto-${this.shareData.size}x${this.shareData.size}-${Math.round(this.shareData.solveMs)}.ftoreplay.json`);};
  $('share-album').onclick=async()=>{
   if(!this.shareData||$('share-album').disabled||$('share-album').hidden)return;
   const data=this.shareData,version=this.shareVersion;$('share-album').disabled=true;
   try{const pb=this.getRecordings().pb,isPB=!!pb&&await recordingID(pb)===await recordingID(data);await this.album.add(data,{pb:isPB});if(version!==this.shareVersion)return;await this.refreshAlbumState();$('share-message').textContent='Saved to your recording album.';}catch(error){if(version===this.shareVersion){$('share-message').textContent=error.message;await this.refreshAlbumState();}}
  };
  this.album.addEventListener('change',()=>{if($('share-dialog').open&&!$('share-album').hidden)this.refreshAlbumState();});
  window.addEventListener('focus',()=>{if($('share-dialog').open&&!$('share-album').hidden)this.refreshAlbumState();});
  $('album').innerHTML=icon('video');$('album').onclick=()=>this.openAlbum();$('close-album').onclick=()=>$('album-dialog').close();
  $('album-import-recording').onclick=()=>this.openImport();
  $('close-paste').onclick=()=>{this.cancelImport();$('paste-dialog').close();};$('paste-dialog').addEventListener('cancel',()=>this.cancelImport());
  $('recording-paste-load').onclick=()=>this.watchImported($('recording-paste').value);
  $('choose-recording-file').onclick=()=>$('recording-import').click();$('recording-import').onchange=event=>this.watchImported(event.target.files[0]);
  const drop=$('recording-drop');for(const type of ['dragenter','dragover'])drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('drag-over');});for(const type of ['dragleave','drop'])drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('drag-over');});drop.addEventListener('drop',event=>this.watchImported(event.dataTransfer.files[0]));


 }
 async share(original,{home=false}={}){
  if(!original)return;const version=++this.shareVersion;
  try{this.shareData=withoutInspection(validateRecording(original));this.shareText=recordingJSON(this.shareData);}catch(error){this.openImport();$('paste-message').textContent=error.message;return;}
  (this.pauseForShare??this.pause)();$('share-title').textContent=`Share ${this.shareData.size} × ${this.shareData.size} · ${formatTime(this.shareData.solveMs)}`;
  this.shareLink=null;$('share-link').disabled=true;$('share-watch').hidden=!home||this.isReplaying();$('share-album').hidden=!home;$('share-album').disabled=true;$('share-album').textContent='Checking album…';$('share-message').textContent='';$('share-output').hidden=true;$('share-link-size').textContent='Preparing compact link…';$('share-dialog').showModal();if(home)this.refreshAlbumState();
  try{const link=await recordingLink(this.shareData);if(version!==this.shareVersion)return;this.shareLink=link;$('share-link').disabled=false;$('share-link-size').textContent=`Link: ${link.length.toLocaleString()} characters`;}catch(error){if(version===this.shareVersion)$('share-link-size').textContent=error.message;}
 }
 async refreshAlbumState(){
  const data=this.shareData,version=this.shareVersion,refresh=++this.albumStateVersion;
  if(!data||$('share-album').hidden)return;
  try{const saved=await this.album.has(await recordingID(data));if(version!==this.shareVersion||refresh!==this.albumStateVersion)return;$('share-album').disabled=saved;$('share-album').textContent=saved?'Saved to album':'Save to album';if(!saved&&$('share-message').textContent==='Saved to your recording album.')$('share-message').textContent='';}
  catch(error){if(version===this.shareVersion&&refresh===this.albumStateVersion){$('share-album').disabled=true;$('share-album').textContent='Album unavailable';$('share-message').textContent=error.message;}}
 }
 async copy(text,message){
  if(!text)return;
  try{await navigator.clipboard.writeText(text);$('share-message').textContent=message;}
  catch{$('share-output').value=text;$('share-output').hidden=false;$('share-output').focus();$('share-output').select();$('share-message').textContent='Select and copy the text below.';}
 }
 async openAlbum(){
  this.pause();$('album-dialog').showModal();await this.renderAlbum();
 }
 async renderAlbum(){
  const version=++this.albumVersion;$('album-message').textContent='Loading recordings…';$('album-list').replaceChildren();
  try{
   const entries=await this.album.list();if(version!==this.albumVersion)return;$('album-message').textContent=entries.length?'':'Save a recording from Share. New PBs are saved here automatically.';
   for(const entry of entries){
    const row=document.createElement('li');row.dataset.id=entry.id;row.className='album-entry';
    const info=document.createElement('div');info.className='album-info';const title=document.createElement('strong');title.textContent=`${entry.size} × ${entry.size} FTO · ${formatTime(entry.solveMs)}`;info.append(title);
    if(entry.pb){const badge=document.createElement('span');badge.className='album-pb';badge.textContent='[PB]';info.append(badge);}
    const date=new Date(entry.completedAt),stamp=document.createElement('time');stamp.dateTime=entry.completedAt;stamp.textContent=`${date.toLocaleDateString()} · ${date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;info.append(stamp);
    const watch=document.createElement('button');watch.innerHTML=icon('resume');watch.className='album-play';watch.setAttribute('aria-label',`Play ${entry.size} × ${entry.size} solve ${formatTime(entry.solveMs)}`);watch.title='Play solve';watch.onclick=async()=>{try{this.play(await this.album.get(entry.id));}catch(error){$('album-message').textContent=error.message;}};
    const share=document.createElement('button');share.innerHTML=icon('share');share.setAttribute('aria-label',`Share ${entry.size} × ${entry.size} solve ${formatTime(entry.solveMs)}`);share.className='share-recording';share.onclick=async()=>{try{await this.share(await this.album.get(entry.id));}catch(error){$('album-message').textContent=error.message;}};
    const remove=document.createElement('button');remove.innerHTML=icon('trash');remove.className='album-delete';remove.setAttribute('aria-label',`Delete ${entry.size} × ${entry.size} solve ${formatTime(entry.solveMs)}`);remove.title='Delete recording';remove.onclick=async()=>{
     remove.disabled=true;try{if(!await this.confirm(`Delete the ${entry.size} × ${entry.size} recording (${formatTime(entry.solveMs)}) from your album? Its solve time and personal-best result will be kept.`,'Delete recording','Delete album recording?'))return;await this.album.remove(entry.id);await this.renderAlbum();}catch(error){$('album-message').textContent=error.message;}finally{remove.disabled=false;}
    };
    const actions=document.createElement('div');actions.className='album-actions';actions.append(watch,share,remove);row.append(info,actions);$('album-list').append(row);
   }
  }catch(error){$('album-message').textContent=error.message;}
 }
 openImport(){
  this.pause();this.linkVersion++;this.importVersion++;this.importBusy=false;$('recording-paste').value='';$('recording-import').value='';$('paste-message').textContent='';this.setImportBusy(false);if(!$('paste-dialog').open)$('paste-dialog').showModal();
 }
 cancelImport(){this.linkVersion++;this.importVersion++;this.importBusy=false;clearRecordingLink();}
 setImportBusy(busy){$('recording-paste-load').disabled=busy;$('choose-recording-file').disabled=busy;}
 async watchImported(input){
  if(input===undefined||this.importBusy)return;this.importBusy=true;this.linkVersion++;clearRecordingLink();const version=++this.importVersion;this.setImportBusy(true);$('paste-message').textContent='Opening recording…';
  try{if(typeof input!=='string'&&input.size>16*1024*1024)throw Error('Recording must be smaller than 16 MB');const text=typeof input==='string'?input:await input.text(),data=await parseRecordingText(text);if(version!==this.importVersion||!$('paste-dialog').open)return;this.play(data);}
  catch(error){if(version===this.importVersion)$('paste-message').textContent=error.message;}
  finally{if(version===this.importVersion){this.importBusy=false;this.setImportBusy(false);$('recording-import').value='';}}
 }
 async openSharedLink(){
  let payload;try{payload=recordingPayload();}catch{return;}if(!payload)return;
  this.openImport();const version=++this.linkVersion;history.replaceState(history.state,'',location.pathname+location.search+'#replay='+payload);$('paste-message').textContent='Opening shared recording…';
  try{const data=await decodeRecording(payload);if(version!==this.linkVersion)return;this.play(data);}catch(error){if(version!==this.linkVersion)return;clearRecordingLink();$('paste-message').textContent=error.message;}
 }
}
