// Count accepted manual turns, independent of raw keys and playback speed.
const upperBound=(values,target)=>{let low=0,high=values.length;while(low<high){const mid=(low+high)>>>1;if(values[mid]<=target)low=mid+1;else high=mid;}return low;};
export class ReplayTurnStats{
 constructor(data){
  this.seconds=[1,3,5].includes(data.initial.keyboard?.display?.window)?data.initial.keyboard.display.window:1;this.window=this.seconds*1000;
  const accepted=data.events.filter(event=>event.type==='accept');
  this.times=(accepted.length?accepted.filter(event=>event.action==='move'):data.events.filter(event=>event.type==='turn')).map(event=>event.at);
  this.peaks=[];let left=0,peak=0;for(let right=0;right<this.times.length;right++){while(this.times[left]<=this.times[right]-this.window)left++;peak=Math.max(peak,(right-left+1)/this.seconds);this.peaks.push(peak);}
 }
 at(time){if(time<0)return {tps:0,peak:0,total:0};const right=upperBound(this.times,time),left=upperBound(this.times,time-this.window);return {tps:(right-left)/this.seconds,peak:this.peaks[right-1]??0,total:right};}
}
