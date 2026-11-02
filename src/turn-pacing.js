// View-rotation transitions follow input cadence. Layer turns instead use
// fixed-duration concurrent animations from parallel-turns.js.
export class TurnPacing{
 constructor(){this.reset();}
 reset(){this.last=null;this.interval=145;}
 input(now){
  this.interval=this.last===null||now-this.last>400?145:Math.min(145,Math.max(6,(now-this.last)*.8));
  this.last=now;
 }
 duration(){return this.interval;}
}
