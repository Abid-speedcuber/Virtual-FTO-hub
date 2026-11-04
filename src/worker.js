import {getRandomScramble} from './vendor/cstimer-fto.mjs';

self.onmessage=()=>{
 try{
  // Like csTimer's ftoso entry, reject trivial solutions.
  let scramble;
  do{scramble=getRandomScramble();}while(scramble.trim().split(/\s+/).length<2);
  self.postMessage({scramble});
 }catch(error){self.postMessage({error:error.message||'Could not generate an FTO scramble'});}
};
