import {FACES} from './puzzle.js';
import {PuzzleViewer} from './puzzle-viewer.js';
import {validateRecording,RecordingTimeline} from './solve-recording.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
export class RecordingUI{
 constructor({getSize,getRecordings,pause}){
  Object.assign(this,{getSize,getRecordings,pause});this.viewer=null;this.data=null;this.playing=false;this.at=0;this.token=0;
  $('open-recordings').onclick=()=>this.open();$('history-recordings').onclick=()=>this.open();$('close-recordings').onclick=()=>$('recordings-dialog').close();
  $('recording-last').onclick=()=>this.load(this.getRecordings().last);$('recording-pb').onclick=()=>this.load(this.getRecordings().pb);
  $('recording-import').onchange=async event=>{
   try{const file=event.target.files[0];if(!file)return;if(file.size>16*1024*1024)throw Error('Recording must be smaller than 16 MB');this.load(validateRecording(JSON.parse(await file.text())));}catch(error){$('recording-message').textContent=error.message;}finally{event.target.value='';}
  };
  $('recording-export').onclick=()=>{
   if(!this.data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(this.data)],{type:'application/json'})),link=document.createElement('a');
   link.href=url;link.download=`fto-${this.data.size}x${this.data.size}-${Math.round(this.data.solveMs)}.ftoreplay.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('replay-play').onclick=()=>{if(!this.data)return;if(this.at>=this.data.duration)this.at=0;this.playing=!this.playing;this.lastTick=performance.now();this.render();if(this.playing)this.tick(++this.token);else this.token++;};
  $('replay-position').oninput=()=>{this.at=Number($('replay-position').value);this.lastTick=performance.now();this.render();};
  $('recordings-dialog').addEventListener('close',()=>{this.playing=false;this.token++;this.viewer?.dispose();this.viewer=null;});
 }
 open(){this.pause();$('recordings-dialog').showModal();const records=this.getRecordings();$('recording-last').disabled=!records.last;$('recording-pb').disabled=!records.pb;this.load(records.last??records.pb);}
 load(data){
  this.playing=false;this.token++;this.at=0;this.data=null;this.viewer?.dispose();this.viewer=null;
  $('recording-message').textContent='';$('replay-content').hidden=!data;$('recording-export').disabled=!data;
  if(!data){$('recording-message').textContent=[2,3,4].includes(this.getSize())?'Complete a solve to save its recording, or import a shared recording.':'Automatic recording is available for 2×2, 3×3 and 4×4. You can import any supported recording.';return;}
  try{validateRecording(data);this.data=data;this.timeline=new RecordingTimeline(data);}catch(error){$('recording-message').textContent=error.message;$('replay-content').hidden=true;$('recording-export').disabled=true;return;}
  $('recording-title').textContent=`${data.size} × ${data.size} FTO · ${formatTime(data.solveMs)}`;
  $('replay-position').max=String(data.duration);this.viewer=new PuzzleViewer($('replay-view'));this.palette=FACES.map(f=>/^#[0-9a-f]{6}$/i.test(data.initial.colors?.[f.name])?data.initial.colors[f.name]:f.color);this.render();this.viewer.resize();
 }
 render(){
  if(!this.data||!this.viewer)return;
  const frame=this.timeline.frame(this.at);this.viewer.colors=frame.paused?Array(8).fill('#888888'):this.palette;this.viewer.setPuzzle(this.data.size,frame.state,null,frame.motions);this.viewer.setView(frame.view);
  $('replay-play').textContent=this.playing?'Pause':'Play';$('replay-position').value=String(this.at);
  $('replay-clock').textContent=formatTime(frame.elapsed);$('replay-keys').textContent=frame.keys.map(k=>k.replace(/^Key|^Digit/,'')).join(' + ')||'—';
  $('replay-hold').textContent=frame.hold?`${frame.hold.notation==='fixed'?'Fixed labels':frame.hold.notation} · U: ${frame.hold.up??'U'} · F: ${frame.hold.front??'F'}${frame.paused?' · paused':''}`:frame.paused?'Paused':'';
 }
 tick(token){requestAnimationFrame(now=>{if(!this.playing||token!==this.token||!this.viewer)return;this.at=Math.min(this.data.duration,this.at+(now-this.lastTick)*Number($('replay-speed').value));this.lastTick=now;if(this.at>=this.data.duration)this.playing=false;this.render();if(this.playing)this.tick(token);});}
}
