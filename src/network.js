// Network eligibility is deliberately separate from local PBs and solve history.
// Reloads, account changes and offline gaps break the server average sequence.
export class OnlineAttempts {
 constructor({rpc,getProfile,online=()=>navigator.onLine,id=()=>crypto.randomUUID(),status=()=>{}}){Object.assign(this,{rpc,getProfile,online,id,status});this.sequence=id();this.attempt=null;this.queue=Promise.resolve();}
 arm(size){this.attempt={size,owner:this.getProfile()?.id,solver:this.getProfile()?{id:this.getProfile().id,username:this.getProfile().username}:null,valid:!!this.getProfile()&&this.online(),undo:false,started:false};}
 invalidate(){if(this.attempt)this.attempt.valid=false;this.sequence=this.id();}
 accountChanged(){if(this.attempt&&this.attempt.owner!==this.getProfile()?.id)this.invalidate();}
 markUndo(){if(this.attempt)this.attempt.undo=true;}
 start(){
  const a=this.attempt;if(!a||a.started)return;
  const profile=this.getProfile();a.owner=profile?.id;a.solver=profile?{id:profile.id,username:profile.username}:null;a.valid=!!profile&&this.online();a.started=true;
  if(a.size!==3||!a.valid||!this.online()||a.owner!==this.getProfile()?.id){a.valid=false;return;}
  const session=this.sequence;
  a.ticket=this.queue.then(()=>{if(!a.valid||!this.online()||a.owner!==this.getProfile()?.id)throw Error('Attempt is no longer eligible');return this.rpc('begin_attempt',{session});});
  // Attach a rejection handler immediately, even if the user never finishes.
  a.ticket.catch(()=>{a.valid=false;this.sequence=this.id();this.status('Leaderboard unavailable for this attempt.');});
  this.queue=a.ticket.catch(()=>{});
 }
 finish(recording){
  const a=this.attempt;this.attempt=null;
  if(!a?.ticket)return Promise.resolve();
  const valid=a.valid&&this.online()&&a.owner===this.getProfile()?.id;
  const replay=valid&&recording&&!recording.dnf&&recording.size===3?structuredClone(recording):null;
  if(replay){replay.solver=a.solver;replay.usedUndo=!!(a.undo||recording.usedUndo);}
  const task=this.queue.then(async()=>{
   const attempt=await a.ticket;
   // Do not queue offline results for later submission.
   if(!this.online()||a.owner!==this.getProfile()?.id){this.sequence=this.id();return;}
   const result=await this.rpc('finish_attempt',{attempt,replay});
   this.status(result.submitted?.length?'Personal best submitted for administrator approval.':result.dnf?'Attempt counts as DNF for the leaderboard.':'Online attempt recorded.');
   return result;
  });
  this.queue=task.catch(error=>{this.sequence=this.id();this.status('Leaderboard submission failed: '+error.message);});return this.queue;
 }
}
let account=null;
const sharedModule=name=>new URL('./shared/'+name+'.js',document.baseURI).href;
export const network=new OnlineAttempts({rpc:(...args)=>account.rpc(...args),getProfile:()=>account?.profile,status:text=>{const host=document.getElementById('leaderboard-status');if(host)host.textContent=text;}});
export function currentSolver(){const p=account?.profile;return p?{id:p.id,username:p.username}:null;}
export async function initNetwork(){
 try{
  account=await import(/* @vite-ignore */ sharedModule('account'));
  account.mountAccount(document.getElementById('network-account'),{surface:'simulator',showIdentity:true,onSettings:()=>document.dispatchEvent(new Event('ftoers-settings')),onAbout:()=>document.dispatchEvent(new Event('ftoers-about')),onReview:()=>document.dispatchEvent(new Event('ftoers-review'))});
  account.onAccountChange(()=>{network.accountChanged();document.dispatchEvent(new Event('ftoers-identity-change'));});
  const {mountLeaderboard}=await import('./leaderboard.js');
  mountLeaderboard(document.getElementById('leaderboard-dialog'),{rpc:account.rpc,configured:account.configured});
  await account.ready;
  window.addEventListener('offline',()=>{network.invalidate();const host=document.getElementById('leaderboard-status');if(host)host.textContent='Offline · leaderboard sequence ended.';});
 }catch{console.warn('FTOers account controls are unavailable.');}
}
export async function createShortLink(recording){
 if(!account)throw Error('FTOers accounts are unavailable.');
 await account.ready;if(!account.profile){account.openAccount();throw Error('Sign in and choose a username to create a temporary link.');}
 if(!navigator.onLine)throw Error('Connect to the internet to create a temporary link.');
 const code=await account.rpc('create_short_link',{replay:recording});
 return 'https://ftoers.web.app/virtual/#short='+code;
}
export async function getCloudRecording(kind,value){
 if(!account){account=await import(/* @vite-ignore */ sharedModule('account'));}
 return kind==='short'?account.rpc('get_short_link',{code:value}):account.rpc('public_replay',{submission:value});
}

export const accountIsAdmin=()=>!!account?.profile?.admin;
export async function networkRPC(...args){if(!account)throw Error('FTOers accounts are unavailable.');return account.rpc(...args);}
