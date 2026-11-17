import {icon} from './icons.js';
import {withoutInspection} from './solve-recording.js';
import {PuzzleViewer} from './puzzle-viewer.js';
import {ReplayPresentation} from './replay-presentation.js';
import {ReplayKeyboard} from './replay-keyboard.js';
import {ReplayPointer} from './replay-pointer.js';
import {FACES} from './puzzle.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
export class HomeReplay{
 constructor({pause:pauseLive,onStart,onFrame,onExit,sound}){
  Object.assign(this,{pauseLive,onStart,onFrame,onExit,sound});this.active=false;this.token=0;$('home-replay-exit').innerHTML=icon('close');
  $('home-replay-play').onclick=()=>{if(!this.active)return;if(this.at>=this.presentation.duration)this.at=0;this.playing=!this.playing;this.lastTick=performance.now();this.render();if(this.playing)this.tick(++this.token);else this.token++;};
  $('home-replay-progress').oninput=()=>{this.at=Number($('home-replay-progress').value);this.lastFlashEvent=null;this.lastTick=performance.now();this.render();};
  $('home-replay-start-marker').onclick=()=>{if(!this.active)return;this.at=this.presentation.introMs;this.lastFlashEvent=null;this.lastTick=performance.now();this.render();};
  $('home-replay-exit').onclick=()=>this.stop();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active){this.playing=false;this.token++;this.render();}});
 }
 start(data){
  if(this.active)this.stop();this.pauseLive();this.sharedData=withoutInspection(data);this.presentation=new ReplayPresentation(data);this.data=this.presentation.data;this.at=0;this.lastFlashEvent=null;this.lastFlashAt=-1;this.flashExpired=false;clearTimeout(this.flashTimer);this.playedSounds=0;this.active=true;this.playing=false;
  this.onStart(this.data);for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();document.documentElement.classList.add('replaying');
  $('home-replay-stage').textContent='Scrambling';$('replay-scramble').replaceChildren(...this.presentation.scrambleTokens.map((token,i)=>{const span=document.createElement('span');span.textContent=token;span.dataset.index=String(i);return span;}));$('home-replay-progress').max=String(this.presentation.duration);$('home-replay-start-marker').style.left=`calc(8px + (100% - 16px) * ${this.presentation.introMs/this.presentation.duration})`;$('home-replay-start-marker').title=`Solve starts at ${formatTime(this.presentation.introMs)}`;
  this.viewer=new PuzzleViewer($('home-replay-view'));this.palette=FACES.map(f=>/^#[0-9a-f]{6}$/i.test(this.data.initial.colors?.[f.name])?this.data.initial.colors[f.name]:f.color);
  this.pointer=new ReplayPointer($('home-replay-view'),this.data);this.keyboard=new ReplayKeyboard($('replay-keyboard'),this.data);this.previousAspect=$('solve-panel').style.getPropertyValue('--keyboard-aspect');$('solve-panel').style.setProperty('--keyboard-aspect',String(this.keyboard.layout.width/this.keyboard.layout.height));this.render();this.viewer.resize();
 }
 render(){
  if(!this.active)return;const frame=this.presentation.frame(this.at);this.viewer.colors=frame.paused?Array(8).fill('#888888'):this.palette;this.viewer.setFrame(this.data.size,frame.state,null,frame.motions,frame.view);
  $('replay-scramble').hidden=frame.stage==='Solve';for(const span of $('replay-scramble').children){const active=Number(span.dataset.index)===frame.scrambleIndex;span.classList.toggle('current',active);if(active)span.setAttribute('aria-current','step');else span.removeAttribute('aria-current');}
  this.pointer.render(this.at-this.presentation.introMs);this.keyboard.render(this.at-this.presentation.introMs);$('replay-display-time').textContent=formatTime(frame.elapsed);this.renderMoveFlash();$('home-replay-tps').textContent=`${this.keyboard.turnStats.tps.toFixed(1)} TPS`;$('home-replay-progress').value=String(this.at);$('home-replay-progress').style.setProperty('--replay-progress',`${100*this.at/this.presentation.duration}%`);const play=$('home-replay-play'),action=this.playing?'Pause':'Play';if(play.dataset.action!==action){play.dataset.action=action;play.innerHTML=icon(this.playing?'pause':'resume');play.title=action;play.setAttribute('aria-label',`${action} recording`);}$('home-replay-stage').textContent=frame.stage;$('home-replay-time').textContent=formatTime(frame.elapsed);this.onFrame(this.data,frame);
 }
 renderMoveFlash(){
  const move=this.keyboard.moveFlash,event=move?`${move.id}:${move.at}`:null;
  if(event!==this.lastFlashEvent||this.at<this.lastFlashAt){
   clearTimeout(this.flashTimer);this.lastFlashEvent=event;this.flashExpired=false;
   if(this.keyboard.visibleMove)this.flashTimer=setTimeout(()=>{this.flashExpired=true;this.hideMoveFlash();},260);
  }
  this.lastFlashAt=this.at;const active=!!this.keyboard.visibleMove&&!this.flashExpired,flash=$('replay-move-flash'),compact=$('home-replay-keys');
  flash.textContent=active?this.keyboard.visibleMove:'';flash.dataset.active=String(active);flash.setAttribute('aria-hidden',String(!active));compact.textContent=active?this.keyboard.visibleMove:'';
  if(move){flash.style.setProperty('--replay-move-color',move.color);compact.style.setProperty('--replay-move-color',move.color);}
  if(!active)this.keyboard.clearMoveHighlights();
 }
 hideMoveFlash(){const flash=$('replay-move-flash');flash.textContent='';flash.dataset.active='false';flash.setAttribute('aria-hidden','true');$('home-replay-keys').textContent='';this.keyboard?.clearMoveHighlights();}
 tick(token){requestAnimationFrame(now=>{if(!this.active||!this.playing||token!==this.token)return;const from=this.at;this.at=Math.min(this.presentation.duration,this.at+Math.max(0,now-this.lastTick)*Number($('home-replay-speed').value));this.lastTick=Math.max(this.lastTick,now);
  for(const kind of this.presentation.sounds(from,this.at)){this.playedSounds++;this.sound(kind);}if(this.at>=this.presentation.duration)this.playing=false;this.render();if(this.playing)this.tick(token);
 });}
 pause(){if(!this.active)return;this.playing=false;this.token++;this.render();}
 stop(){if(!this.active)return;clearTimeout(this.flashTimer);this.hideMoveFlash();this.active=false;this.playing=false;this.token++;this.pointer.dispose();this.viewer.dispose();this.viewer=null;$('replay-keyboard').replaceChildren();$('solve-panel').style.setProperty('--keyboard-aspect',this.previousAspect);document.documentElement.classList.remove('replaying');this.onExit();}
}
