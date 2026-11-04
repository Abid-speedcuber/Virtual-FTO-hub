import {FACES} from './puzzle.js';

// csTimer uses conventional CIF notation. The simulator's permanent face IDs
// are geometric IDs, so F/BR/L/B must be mapped rather than looked up by name.
const CIF_FACES={U:'U',F:'BR',R:'R',L:'F',BR:'B',BL:'BL',B:'L',D:'D'};
export function parseFtoScramble(text){
 if(typeof text!=='string'||!text.trim())throw Error('Empty FTO scramble');
 return text.trim().split(/\s+/).map(token=>{
  const match=/^(U|F|R|L|BR|BL|B|D)('?)$/.exec(token);
  if(!match)throw Error(`Invalid FTO scramble move: ${token}`);
  const face=FACES.find(f=>f.name===CIF_FACES[match[1]]);
  return {normal:[...face.normal],layer:'slice',depth:1,count:1,dir:match[2]?-1:1,name:face.name};
 });
}

// Keep one completed scramble, plus at most one generation in flight. Cancelling
// a solve request stops its wait, not the useful background work.
export class FtoScrambler{
 constructor(createWorker=()=>new Worker(new URL('./worker.js',import.meta.url),{type:'module'})){
  this.createWorker=createWorker;this.worker=null;this.pending=null;this.next=null;
 }
 status(){return {ready:!!this.next,generating:!!this.pending};}
 prepare(){
  if(this.next)return Promise.resolve();
  if(this.pending)return this.pending;
  try{this.worker??=this.createWorker();}catch(error){return Promise.reject(error);}
  let fail;
  this.pending=new Promise((resolve,reject)=>{
   const cleanup=()=>{this.pending=null;this.worker.onmessage=null;this.worker.onerror=null;};
   fail=error=>{const worker=this.worker;cleanup();this.worker=null;worker.terminate();reject(error);};
   this.worker.onmessage=({data})=>{
    if(data.error){fail(Error(data.error));return;}
    try{this.next=parseFtoScramble(data.scramble);}catch(error){fail(error);return;}
    cleanup();resolve();
   };
   this.worker.onerror=()=>fail(Error('FTO scramble worker failed'));
  });
  const pending=this.pending;
  try{this.worker.postMessage(null);}catch(error){fail(error);}
  return pending;
 }
 warm(){this.prepare().catch(()=>{});}
 async take(signal){
  if(signal?.aborted)throw new DOMException('Scramble cancelled','AbortError');
  while(!this.next)await waitForScramble(this.prepare(),signal);
  // An abort may have arrived after generation finished but before this turn.
  if(signal?.aborted)throw new DOMException('Scramble cancelled','AbortError');
  const moves=this.next;this.next=null;this.warm();return moves;
 }
}
function waitForScramble(promise,signal){
 if(!signal)return promise;
 return new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(new DOMException('Scramble cancelled','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
  promise.then(()=>{signal.removeEventListener('abort',abort);resolve();},error=>{signal.removeEventListener('abort',abort);reject(error);});
  if(signal.aborted)abort();
 });
}
const scrambler=new FtoScrambler();
export const prepareFtoScramble=()=>scrambler.warm();
export const ftoScrambleStatus=()=>scrambler.status();
export const randomStateFtoScramble=signal=>scrambler.take(signal);
