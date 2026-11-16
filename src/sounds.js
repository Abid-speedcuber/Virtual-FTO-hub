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
   if(kind==='undo')this.playUndo(context);
   else if(kind==='suffix'){
    const now=context.currentTime,gain=context.createGain(),tone=context.createOscillator();gain.connect(context.destination);
    tone.type='sine';tone.frequency.setValueAtTime(320,now);tone.frequency.exponentialRampToValueAtTime(150,now+.11);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.10,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+.14);
    tone.connect(gain);tone.start(now);tone.stop(now+.15);tone.onended=()=>gain.disconnect();
   }else if(this.samples.length)this.playSample(context);
   else this.ready.then(()=>{if(!this.disabled()&&this.samples.length)this.playSample(context);});
  }catch{/* Audio never blocks puzzle input. */}
 }
 playUndo(context){
  // A smooth, airy "shh shh": broad filtered noise with slow, soft edges.
  const now=context.currentTime,duration=.42,source=context.createBufferSource(),high=context.createBiquadFilter(),low=context.createBiquadFilter(),gain=context.createGain();
  if(!this.undoHiss){this.undoHiss=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate);const samples=this.undoHiss.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*.75;}
  source.buffer=this.undoHiss;source.playbackRate.value=.98+Math.random()*.04;
  high.type='highpass';high.frequency.value=1500;high.Q.value=.5;low.type='lowpass';low.frequency.value=7000;low.Q.value=.5;
  gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.18,now+.045);gain.gain.linearRampToValueAtTime(.13,now+.08);gain.gain.linearRampToValueAtTime(0,now+.15);gain.gain.setValueAtTime(0,now+.21);gain.gain.linearRampToValueAtTime(.16,now+.255);gain.gain.linearRampToValueAtTime(.12,now+.29);gain.gain.linearRampToValueAtTime(0,now+.39);
  source.connect(high);high.connect(low);low.connect(gain);gain.connect(context.destination);source.start(now);source.stop(now+duration);source.onended=()=>{high.disconnect();low.disconnect();gain.disconnect();};
 }

 playSample(context){
  const source=context.createBufferSource(),gain=context.createGain();source.buffer=this.samples[Math.floor(Math.random()*this.samples.length)];gain.gain.value=.55;
  source.connect(gain);gain.connect(context.destination);source.start();source.onended=()=>gain.disconnect();
 }
}
