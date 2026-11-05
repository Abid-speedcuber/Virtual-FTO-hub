import {validateRecording,withoutInspection} from './solve-recording.js';
import {recordingLink,recordingJSON,parseRecordingText,recordingPayload,decodeRecording,clearRecordingLink} from './recording-codec.js';
import {icon} from './icons.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
export function downloadJSON(data,name){
 const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export class RecordingUI{
 constructor({getSize,getRecordings,pause,play,current,album,pauseForShare}){
  Object.assign(this,{getSize,getRecordings,pause,play,current,album,pauseForShare});this.data=null;this.shareVersion=0;this.linkVersion=0;
  $('open-recordings').onclick=()=>this.open();$('history-recordings').onclick=()=>this.open();$('close-recordings').onclick=()=>{this.linkVersion++;clearRecordingLink();$('recordings-dialog').close();};
  $('recording-last').onclick=()=>this.load(this.getRecordings().last);$('recording-pb').onclick=()=>this.load(this.getRecordings().pb);
  $('recording-import').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error('Recording must be smaller than 16 MB');this.load(validateRecording(JSON.parse(await file.text())));}catch(error){$('recording-message').textContent=error.message;}finally{event.target.value='';}};
  $('recording-export').onclick=()=>this.share(this.data);$('watch-recording').onclick=()=>{if(this.data)this.play(this.data);};
  $('mobile-share-current').onclick=()=>this.share(this.getRecordings().last);$('history-share-pb').onclick=()=>this.share(this.getRecordings().pb);$('home-replay-share').onclick=()=>this.share(this.current?.());
  $('share-current').onclick=()=>this.share(this.current?.()??this.getRecordings().last);$('share-pb').onclick=()=>this.share(this.getRecordings().pb);
  $('share-watch').innerHTML=icon('resume')+'Watch solve';$('share-watch').onclick=()=>{if(this.shareData)this.play(this.shareData);};
  $('close-share').onclick=()=>$('share-dialog').close();$('share-link').onclick=()=>this.copy(this.shareLink,'Link copied');$('share-text').onclick=()=>this.copy(this.shareText,'Recording text copied');
  $('share-json').onclick=()=>{if(this.shareData)downloadJSON(this.shareData,`fto-${this.shareData.size}x${this.shareData.size}-${Math.round(this.shareData.solveMs)}.ftoreplay.json`);};
  $('share-album').onclick=async()=>{if(!this.shareData)return;$('share-album').disabled=true;try{await this.album.add(this.shareData);$('share-album').textContent='Saved to album';$('share-message').textContent='Saved to your recording album.';}catch(error){$('share-message').textContent=error.message;$('share-album').disabled=false;}};
  $('album').innerHTML=icon('album');$('album').onclick=()=>this.openAlbum();$('close-album').onclick=()=>$('album-dialog').close();
  $('recording-paste-open').onclick=()=>{$('recording-paste').value='';$('paste-message').textContent='';$('paste-dialog').showModal();};$('close-paste').onclick=()=>$('paste-dialog').close();
  $('recording-paste-load').onclick=async()=>{try{this.load(await parseRecordingText($('recording-paste').value));$('paste-dialog').close();}catch(error){$('paste-message').textContent=error.message;}};

 }
 async share(original){
  if(!original)return;const version=++this.shareVersion;
  try{this.shareData=withoutInspection(validateRecording(original));this.shareText=recordingJSON(this.shareData);}catch(error){$('recording-message').textContent=error.message;return;}
  (this.pauseForShare??this.pause)();$('share-title').textContent=`Share ${this.shareData.size} × ${this.shareData.size} · ${formatTime(this.shareData.solveMs)}`;
  this.shareLink=null;$('share-link').disabled=true;$('share-album').disabled=false;$('share-album').textContent='Save to album';$('share-message').textContent='';$('share-output').hidden=true;$('share-link-size').textContent='Preparing compact link…';$('share-dialog').showModal();
  try{const link=await recordingLink(this.shareData);if(version!==this.shareVersion)return;this.shareLink=link;$('share-link').disabled=false;$('share-link-size').textContent=`Link: ${link.length.toLocaleString()} characters`;}catch(error){if(version===this.shareVersion)$('share-link-size').textContent=error.message;}
 }
 async copy(text,message){
  if(!text)return;
  try{await navigator.clipboard.writeText(text);$('share-message').textContent=message;}
  catch{$('share-output').value=text;$('share-output').hidden=false;$('share-output').focus();$('share-output').select();$('share-message').textContent='Select and copy the text below.';}
 }
 async openAlbum(){
  this.pause();$('album-dialog').showModal();$('album-message').textContent='Loading recordings…';$('album-list').replaceChildren();
  try{
   const entries=await this.album.list();$('album-message').textContent=entries.length?'':'Save a recording from Share. New PBs are saved here automatically.';
   for(const entry of entries){
    const row=document.createElement('li');row.dataset.id=entry.id;row.className='album-entry';
    const info=document.createElement('div');info.className='album-info';const title=document.createElement('strong');title.textContent=`${entry.size} × ${entry.size} FTO · ${formatTime(entry.solveMs)}`;info.append(title);
    if(entry.pb){const badge=document.createElement('span');badge.className='album-pb';badge.textContent='[PB]';info.append(badge);}
    const date=new Date(entry.completedAt),stamp=document.createElement('time');stamp.dateTime=entry.completedAt;stamp.textContent=`${date.toLocaleDateString()} · ${date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;info.append(stamp);
    const watch=document.createElement('button');watch.innerHTML=icon('resume');watch.className='album-play';watch.setAttribute('aria-label',`Play ${entry.size} × ${entry.size} solve ${formatTime(entry.solveMs)}`);watch.title='Play solve';watch.onclick=async()=>{try{this.play(await this.album.get(entry.id));}catch(error){$('album-message').textContent=error.message;}};
    const share=document.createElement('button');share.innerHTML=icon('share');share.setAttribute('aria-label',`Share ${entry.size} × ${entry.size} solve ${formatTime(entry.solveMs)}`);share.className='share-recording';share.onclick=async()=>{try{await this.share(await this.album.get(entry.id));}catch(error){$('album-message').textContent=error.message;}};
    row.append(info,watch,share);$('album-list').append(row);
   }
  }catch(error){$('album-message').textContent=error.message;}
 }
 async openSharedLink(){
  let payload;try{payload=recordingPayload();}catch{return;}if(!payload)return;
  const version=++this.linkVersion;this.pause();history.replaceState(history.state,'',location.pathname+location.search+'#replay='+payload);if(!$('recordings-dialog').open)$('recordings-dialog').showModal();$('recording-message').textContent='Opening shared recording…';
  try{const data=await decodeRecording(payload);if(version!==this.linkVersion)return;this.load(data);this.play(this.data);}catch(error){if(version!==this.linkVersion)return;clearRecordingLink();$('recording-message').textContent=error.message;}
 }
 open(){this.pause();$('recordings-dialog').showModal();const records=this.getRecordings();$('recording-last').disabled=!records.last;$('recording-pb').disabled=!records.pb;this.load(records.last??records.pb);}
 load(data){
  this.data=null;$('replay-content').hidden=true;$('recording-export').disabled=true;$('recording-message').textContent='';
  if(!data){$('recording-message').textContent=[2,3,4].includes(this.getSize())?'Complete a new timed solve, or import a shared recording.':'Automatic recording is available for 2×2–4×4. You can import a supported recording.';return;}
  try{this.data=withoutInspection(validateRecording(data));}catch(error){$('recording-message').textContent=error.message;return;}
  $('replay-content').hidden=false;$('recording-export').disabled=false;$('recording-title').textContent=`${data.size} × ${data.size} FTO · ${formatTime(data.solveMs)}`;
 }
}
