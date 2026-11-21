import {validateRecording,recordingFrame} from './solve-recording.js';
import {isSolved} from './puzzle.js';
import {formatTime} from './solve-timer.js';
export function recoverySource(text){
 const value=text.trim();if(/^[a-f0-9]{32}$/i.test(value)||/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))return value.toLowerCase();
 let url;try{url=new URL(value,globalThis.location?.href??'https://ftoers.web.app/virtual/');}catch{throw Error('Paste a temporary recording link or a single submission ID.');}
 const params=new URLSearchParams(url.hash.slice(1)),source=params.get('short')??params.get('rank');
 if(source&&(/^[a-f0-9]{32}$/i.test(source)||/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(source)))return source.toLowerCase();
 throw Error('Paste a temporary recording link or a single submission ID.');
}
export class LeaderboardRecovery {
 constructor({rpc,isAdmin,play,pause,onRecovered=()=>{}}){
  Object.assign(this,{rpc,isAdmin,play,pause,onRecovered});this.revision=0;this.preview=null;this.busy=false;this.watched=false;
  const dialog=this.dialog=document.createElement('dialog');dialog.id='leaderboard-recovery-dialog';dialog.className='network-dialog';dialog.setAttribute('aria-labelledby','recovery-title');
  dialog.innerHTML=`<div class="dialog-heading"><h1 id="recovery-title">Recover a single</h1><button class="dialog-close" data-close aria-label="Close solve recovery">×</button></div><div class="dialog-body"><p class="recovery-intro">Inspect a recording that could not be submitted or was rejected because of a bug. Nothing is added until you confirm.</p><form data-inspect><label for="recovery-source">Recording link or submission ID</label><div class="recovery-source-row"><input id="recovery-source" name="source" maxlength="2048" required autocomplete="off" placeholder="Paste a temporary recording link"><button type="submit">Inspect</button></div></form><section data-preview hidden><div class="recovery-result"><div><strong data-solver></strong><p data-origin></p></div><strong data-time></strong></div><p data-current></p><ul data-flags aria-label="Recording eligibility checks"></ul><p data-check></p><button data-watch type="button">Watch recording</button><details data-layout><summary>Recorded keyboard layout</summary><div data-layout-content></div></details><label class="recovery-confirm"><input type="checkbox" data-reviewed disabled><span>I watched the recording and reviewed the keyboard/input evidence.</span></label><label class="recovery-confirm" data-warning-label hidden><input type="checkbox" data-warnings><span>I checked the warnings above and verified the solver identity and timing.</span></label><label for="recovery-reason">Recovery reason <small>Included in the solver’s approval notification.</small></label><textarea id="recovery-reason" maxlength="470" rows="3" placeholder="Explain which submission problem you checked."></textarea><button class="primary recovery-add" data-add disabled>Add verified single</button></section><p data-message role="status"></p></div>`;
  document.body.append(dialog);this.$=s=>dialog.querySelector(s);
  this.$('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{this.revision++;});
  this.$('[data-inspect]').onsubmit=e=>{e.preventDefault();this.inspect();};
  this.$('#recovery-source').addEventListener('input',()=>{this.revision++;this.preview=null;this.$('[data-preview]').hidden=true;this.$('[data-message]').textContent='';this.controls();});
  this.$('[data-watch]').onclick=()=>{if(!this.recording||this.busy)return;this.watched=true;this.$('[data-reviewed]').disabled=false;dialog.close();this.play(this.recording);};
  for(const selector of ['[data-reviewed]','[data-warnings]','#recovery-reason'])this.$(selector).addEventListener('input',()=>this.controls());
  this.$('[data-add]').onclick=()=>this.add();
  document.addEventListener('ftoers-identity-change',()=>{if(!this.isAdmin()){this.preview=null;this.revision++;if(dialog.open)dialog.close();}});
 }
 open(){if(!this.isAdmin())return;this.pause();this.dialog.showModal();this.controls();}
 controls(){
  const p=this.preview,warning=p?.flags?.some(f=>f.severity==='warning');
  this.$('[data-add]').disabled=this.busy||!p||!p.can_recover||!this.recording||!this.watched||!this.$('[data-reviewed]').checked||warning&&!this.$('[data-warnings]').checked||this.$('#recovery-reason').value.trim().length<3||!!p.existing_approved;
  this.$('[data-watch]').disabled=this.busy||!this.recording;
  for(const el of this.$('[data-inspect]').elements)el.disabled=this.busy;
 }
 async inspect(){
  if(this.busy||!this.isAdmin())return;const version=++this.revision;this.busy=true;this.preview=null;this.recording=null;this.watched=false;this.$('[data-preview]').hidden=true;this.$('[data-reviewed]').checked=false;this.$('[data-reviewed]').disabled=true;this.$('[data-warnings]').checked=false;this.$('#recovery-reason').value='';this.$('[data-message]').textContent='Inspecting recording…';this.controls();
  try{
   const source=recoverySource(this.$('#recovery-source').value),p=await this.rpc('inspect_leaderboard_recovery',{source});if(version!==this.revision||!this.isAdmin())return;
   this.preview=p;this.$('[data-solver]').textContent=p.username;this.$('[data-time]').textContent=formatTime(p.ms);this.$('[data-origin]').textContent=p.trusted?'Server-attributed recording':'Unverified recording · manual identity check required';this.$('[data-current]').textContent=p.existing_approved?'This exact recording is already approved.':p.leaderboard_ms!=null?`Current leaderboard single: ${formatTime(p.leaderboard_ms)}`:'No approved leaderboard single yet.';
   const flags=this.$('[data-flags]');flags.replaceChildren();if(!(p.flags??[]).some(f=>['undo','pause'].includes(f.code))){const li=document.createElement('li');li.dataset.severity='pass';li.textContent='No undo or pause evidence found.';flags.append(li);}for(const flag of p.flags??[]){const li=document.createElement('li');li.dataset.severity=flag.severity;li.textContent=flag.label;flags.append(li);}
   try{this.recording=validateRecording(p.recording);if(this.recording.size!==3||!isSolved(recordingFrame(this.recording,this.recording.duration).state))throw Error('The recording does not finish with a solved 3 × 3 FTO.');this.$('[data-check]').textContent='Recording format and solved end state checked.';}
   catch(error){this.recording=null;p.can_recover=false;this.$('[data-check]').textContent=error.message;}
   this.renderLayout(p.recording?.initial?.keyboard);this.$('[data-warning-label]').hidden=!p.flags?.some(f=>f.severity==='warning');this.$('[data-preview]').hidden=false;this.$('[data-message]').textContent=p.can_recover?'Watch the recording, then reopen Recover single to finish verification.':'This recording cannot be added. Review the eligibility checks above.';
  }catch(error){if(version===this.revision)this.$('[data-message]').textContent=/inspect_leaderboard_recovery/.test(error.message)?'Recovery needs the pending backend update. No result was added.':error.message;}
  finally{this.busy=false;this.controls();}
 }
 renderLayout(config){
  const host=this.$('[data-layout-content]');host.replaceChildren();const modes=config?.modes??[];
  if(!modes.length){host.textContent='No keyboard layout is available in this recording.';return;}
  for(const mode of modes.slice(0,40)){const title=document.createElement('h3'),list=document.createElement('ul');title.textContent=mode.name??mode.id??'Mode';for(const binding of (mode.bindings??[]).slice(0,150)){const li=document.createElement('li'),a=binding.action??{};li.textContent=`${binding.trigger??'?'} → ${[a.type,a.face,a.dir===-1?"′":'',a.kind,a.command,a.mode].filter(Boolean).join(' ')}`;list.append(li);}host.append(title,list);}
 }
 async add(){
  if(this.$('[data-add]').disabled||!this.isAdmin())return;const version=++this.revision;this.busy=true;this.controls();this.$('[data-message]').textContent='Adding verified single…';
  try{const result=await this.rpc('recover_leaderboard_single',{source:this.preview.source,reason:this.$('#recovery-reason').value.trim(),reviewed:this.$('[data-reviewed]').checked,acknowledge_warnings:this.$('[data-warnings]').checked});if(version!==this.revision||!this.isAdmin())return;this.preview.existing_approved=result.id;this.$('[data-origin]').textContent='Manually verified recording';this.$('[data-message]').textContent=result.already_added?'This recording was already approved. No duplicate was created.':'Single added to the leaderboard. The solver will see an approval notification.';this.$('[data-current]').textContent='This recording is approved.';document.dispatchEvent(new Event('ftoers-submission-reviewed'));this.onRecovered(result);}
  catch(error){if(version===this.revision)this.$('[data-message]').textContent=error.message;}
  finally{this.busy=false;this.controls();}
 }
}
