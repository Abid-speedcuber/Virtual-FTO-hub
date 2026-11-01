const statuses=['idle','scrambling','ready','running','paused','finished'];
const finite=value=>Number.isFinite(value)&&value>=0;
export class SolveTimer{
 constructor(saved={},clock=()=>performance.now()){
  this.clock=clock;this.status=statuses.includes(saved.status)?saved.status:'idle';
  this.elapsedMs=finite(saved.elapsedMs)?saved.elapsedMs:0;
  this.bestMs=finite(saved.bestMs)?saved.bestMs:null;this.bestAt=typeof saved.bestAt==='string'?saved.bestAt:null;
  this.completed=Number.isInteger(saved.completed)&&saved.completed>=0?saved.completed:0;
  this.lastMs=finite(saved.lastMs)?saved.lastMs:null;this.newBest=saved.newBest===true;
  this.startedAt=null;if(this.status==='running')this.status='paused';
 }
 elapsed(){return this.elapsedMs+(this.status==='running'?Math.max(0,this.clock()-this.startedAt):0);}
 scramble(){this.status='scrambling';this.elapsedMs=0;this.startedAt=null;this.newBest=false;}
 arm(){if(this.status==='scrambling'){this.status='ready';this.elapsedMs=0;}}
 start(){if(this.status!=='ready')return false;this.status='running';this.startedAt=this.clock();return true;}
 pause(){if(this.status!=='running')return false;this.elapsedMs=this.elapsed();this.startedAt=null;this.status='paused';return true;}
 resume(){if(this.status!=='paused')return false;this.status='running';this.startedAt=this.clock();return true;}
 finish(){
  if(!['running','paused'].includes(this.status))return false;
  this.elapsedMs=this.elapsed();this.startedAt=null;this.status='finished';this.lastMs=this.elapsedMs;this.completed++;
  this.newBest=this.bestMs===null||this.elapsedMs<this.bestMs;
  if(this.newBest){this.bestMs=this.elapsedMs;this.bestAt=new Date().toISOString();}
  return true;
 }
 reset(){this.status='idle';this.elapsedMs=0;this.startedAt=null;this.newBest=false;}
 serialize(){return {status:this.status==='running'?'paused':this.status,elapsedMs:this.elapsed(),bestMs:this.bestMs,bestAt:this.bestAt,completed:this.completed,lastMs:this.lastMs,newBest:this.newBest};}
 snapshot(){return {...this.serialize(),status:this.status};}
}
export function formatTime(ms){
 if(ms===null)return '—';
 const centiseconds=Math.floor(Math.max(0,ms)/10),seconds=Math.floor(centiseconds/100),fraction=String(centiseconds%100).padStart(2,'0');
 return seconds>=60?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}.${fraction}`:`${seconds}.${fraction}`;
}
