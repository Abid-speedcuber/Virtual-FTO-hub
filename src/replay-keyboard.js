import {KeyboardEngine,defaultConfig,validateConfig} from './keyboard-engine.js';
import {renderKeyLabel} from './keyboard-label.js';
import {ReplayTurnStats} from './replay-stats.js';
import {keyboardLayout} from './keyboard-layout.js';
const NS='http://www.w3.org/2000/svg';
export class ReplayKeyboard{
 constructor(host,data){
  this.data=data;try{validateConfig(data.initial.keyboard,{legacyNames:true});this.config=structuredClone(data.initial.keyboard);}catch{this.config=defaultConfig(data.size);}
  host.replaceChildren();const title=document.createElement('div');title.className='keyboard-readout';this.title=title;this.modeLabel=document.createElement('span');this.statsLabel=document.createElement('span');this.statsLabel.className='replay-keyboard-stats';this.statsLabel.setAttribute('aria-label','Recorded input statistics');title.append(this.modeLabel,this.statsLabel);host.append(title);this.stats=new ReplayTurnStats(data);
  const board=document.createElementNS(NS,'svg'),layout=keyboardLayout(this.config.display??{layout:'60'});board.setAttribute('viewBox',`-.04 -.04 ${layout.width} ${layout.height}`);host.append(board);this.layout=layout;this.keys=new Map();
  for(const key of layout.keys){
   const group=document.createElementNS(NS,'g');group.classList.add('keycap');group.dataset.code=key.code;
   const rect=document.createElementNS(NS,key.shape==='iso-enter'?'path':'rect');if(key.shape==='iso-enter')rect.setAttribute('d',`M${key.x},${key.y}h${key.w}v${key.h}h-1.17v-.99h-.25Z`);else for(const [k,v] of Object.entries({x:key.x,y:key.y,width:key.w,height:key.h,rx:.09}))rect.setAttribute(k,v);
   const text=document.createElementNS(NS,'text');for(const [k,v] of Object.entries({x:key.x+key.w/2,y:key.y+key.h/2,'dominant-baseline':'middle','text-anchor':'middle','font-size':'.28'}))text.setAttribute(k,v);
   group.append(rect,text);board.append(group);this.keys.set(key.code,{group,text,width:key.w});
  }
  this.reset();
 }
 reset(){this.engine=new KeyboardEngine(structuredClone(this.config));this.engine.pending=this.data.initial.keyboardState?.pending??null;this.engine.slicePending=this.data.initial.keyboardState?.slicePending??false;this.engine.pendingSource=this.data.initial.keyboardState?.pendingSource??null;this.engine.sliceSource=this.data.initial.keyboardState?.sliceSource??null;this.pressedLabels=new Map();this.paused=false;this.index=0;this.at=-1;}
 render(at){
  if(at<this.at)this.reset();this.at=at;
  while(this.index<this.data.events.length){const e=this.data.events[this.index];if(e.at>at)break;this.index++;
   if(e.type==='key'){
    if(e.edge==='down'){
     const result=this.engine.keyDown(e.code,{now:e.at,repeat:e.repeat,size:this.data.size});
     if(['move','rotate'].includes(result.action?.type))this.pressedLabels.set(e.code,this.engine.resolve(result.action,{size:this.data.size,defaultMove:{depth:1,count:1,dir:1}}).label);
    }else{this.engine.keyUp(e.code,{now:e.at});this.pressedLabels.delete(e.code);}
   }
   if(e.type==='accept'&&e.action==='move')this.engine.consume();if(['start','resume'].includes(e.type))this.paused=false;
   if(e.type==='reset-input'||e.type==='pause'){this.paused=e.type==='pause';this.engine.clear({selection:true});this.pressedLabels.clear();}
  }
  this.engine.activateSuffixes(Math.max(0,at));this.engine.expire(Math.max(0,at));
  this.modeLabel.textContent=`Solver’s keyboard · ${this.engine.mode.name}`;this.turnStats=this.stats.at(at);this.statsLabel.textContent=`${this.turnStats.tps.toFixed(1)} TPS`;this.statsLabel.title=`${this.stats.seconds}s window · Peak ${this.turnStats.peak.toFixed(1)} TPS · ${this.turnStats.total} turns`;
  for(const [code,{group,text,width}] of this.keys){group.classList.toggle('pressed',this.engine.pressed.has(code));const context={size:this.data.size,canPause:at>=0&&at<this.data.duration,manualPaused:this.paused,defaultMove:{depth:1,count:1,dir:1}},state=this.engine.keyState(code,context);group.classList.toggle('selected',state.selected);group.classList.toggle('affected',state.affected);renderKeyLabel(text,this.engine.pressed.has(code)&&this.pressedLabels.has(code)?this.pressedLabels.get(code):state.label,width);}
 }
}
