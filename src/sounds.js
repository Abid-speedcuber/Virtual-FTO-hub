// Locally bundled Gateron Black Ink recordings from tplai/kbsim (MIT).
// See public/audio/black-ink/ATTRIBUTION.md and LICENSE.md.
const sampleURLs=[1,2,3].map(n=>`${import.meta.env.BASE_URL}audio/black-ink/press-${n}.mp3`);
export class PuzzleSounds{
 constructor(disabled=()=>false){
  this.disabled=disabled;this.context=null;this.samples=[];
  // Decode away from the real-time audio context, before the first keypress.
  this.ready=this.load();
 }
 async load(){
  try{
   const Decoder=globalThis.OfflineAudioContext??globalThis.webkitOfflineAudioContext;
   if(!Decoder)return;
   const decoder=new Decoder(1,1,44100);
   this.samples=await Promise.all(sampleURLs.map(async url=>{const response=await fetch(url);if(!response.ok)throw Error('Audio unavailable');return decoder.decodeAudioData(await response.arrayBuffer());}));
  }catch{this.samples=[];}
 }
 play(kind='move'){
  if(this.disabled())return;
  const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Audio)return;
  try{
   const context=this.context??=new Audio();if(context.state==='suspended')context.resume().catch(()=>{});
   if(kind==='suffix'){
    const now=context.currentTime,gain=context.createGain(),tone=context.createOscillator();gain.connect(context.destination);
    tone.type='sine';tone.frequency.setValueAtTime(320,now);tone.frequency.exponentialRampToValueAtTime(150,now+.11);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.10,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+.14);
    tone.connect(gain);tone.start(now);tone.stop(now+.15);tone.onended=()=>gain.disconnect();
   }else if(this.samples.length)this.playSample(context);
   else this.ready.then(()=>{if(!this.disabled()&&this.samples.length)this.playSample(context);});
  }catch{/* Audio never blocks puzzle input. */}
 }
 playSample(context){
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=this.samples[Math.floor(Math.random()*this.samples.length)];gain.gain.value=.55;
  source.connect(gain);gain.connect(context.destination);source.start();source.onended=()=>gain.disconnect();
 }
}
