// Short synthesized sounds need no downloads and start only after user input.
export class PuzzleSounds{
 constructor(disabled=()=>false){this.disabled=disabled;this.context=null;this.samples=[];}
 play(kind='move'){
  if(this.disabled())return;
  const Audio=globalThis.AudioContext??globalThis.webkitAudioContext;if(!Audio)return;
  try{
   const context=this.context??=new Audio();if(context.state==='suspended')context.resume().catch(()=>{});
   const now=context.currentTime,gain=context.createGain();gain.connect(context.destination);
   if(kind==='suffix'){
    const tone=context.createOscillator();tone.type='sine';tone.frequency.setValueAtTime(320,now);tone.frequency.exponentialRampToValueAtTime(150,now+.11);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.10,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+.14);
    tone.connect(gain);tone.start(now);tone.stop(now+.15);tone.onended=()=>gain.disconnect();
   }else{
    // A damped plastic/plate bottom-out: soft broadband attack, warm low
    // resonances, and no bright metallic ring or pitched typewriter chirp.
    if(!this.samples.length)for(let variation=0;variation<6;variation++){
     const length=Math.ceil(context.sampleRate*.075),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0),pitch=.97+variation*.012;
     let low=0;const coefficient=1-Math.exp(-2*Math.PI*850/context.sampleRate);
     for(let i=0;i<length;i++){
      const t=i/context.sampleRate,noise=Math.random()*2-1;low+=coefficient*(noise-low);
      const attack=Math.min(1,t/.00045);
      data[i]=attack*(.55*low*Math.exp(-t/.009)+.15*Math.sin(2*Math.PI*190*pitch*t)*Math.exp(-t/.014)+.07*Math.sin(2*Math.PI*410*pitch*t)*Math.exp(-t/.008)+.025*noise*Math.exp(-t/.0008));
     }
     this.samples.push(buffer);
    }
    const click=context.createBufferSource();click.buffer=this.samples[Math.floor(Math.random()*this.samples.length)];gain.gain.value=.65;
    click.connect(gain);click.start(now);click.onended=()=>gain.disconnect();
   }
  }catch{/* Sound support never blocks puzzle input. */}
 }
}
