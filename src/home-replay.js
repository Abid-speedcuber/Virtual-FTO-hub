import {withoutInspection} from './solve-recording.js';
import {PuzzleViewer} from './puzzle-viewer.js';
import {ReplayPresentation} from './replay-presentation.js';
import {ReplayKeyboard} from './replay-keyboard.js';
import {FACES} from './puzzle.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
export class HomeReplay{
 constructor({pause:pauseLive,onStart,onFrame,onExit,sound}){
  Object.assign(this,{pauseLive,onStart,onFrame,onExit,sound});this.active=false;this.token=0;
  $('home-replay-play').onclick=()=>{if(!this.active)return;if(this.at>=this.presentation.duration)this.at=0;this.playing=!this.playing;this.lastTick=performance.now();this.render();if(this.playing)this.tick(++this.token);else this.token++;};
  $('home-replay-progress').oninput=()=>{this.at=Number($('home-replay-progress').value);this.lastTick=performance.now();this.render();};
  $('home-replay-exit').onclick=()=>this.stop();
  $('home-replay-splits').onclick=()=>{this.playing=false;this.token++;this.render();$('history-dialog').showModal();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active){this.playing=false;this.token++;this.render();}});
 }
 start(data){
  if(this.active)this.stop();this.pauseLive();this.sharedData=withoutInspection(data);this.presentation=new ReplayPresentation(data);this.data=this.presentation.data;this.at=0;this.playedSounds=0;this.active=true;this.playing=false;
  $('home-replay-splits').hidden=!this.data.splitData?.profile?.phases?.length;this.onStart(this.data);for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();document.documentElement.classList.add('replaying');
  $('home-replay-stage').textContent='Scrambling';$('replay-scramble').replaceChildren(...this.presentation.scrambleTokens.map((token,i)=>{const span=document.createElement('span');span.textContent=token;span.dataset.index=String(i);return span;}));$('home-replay-progress').max=String(this.presentation.duration);
  this.viewer=new PuzzleViewer($('home-replay-view'));this.palette=FACES.map(f=>/^#[0-9a-f]{6}$/i.test(this.data.initial.colors?.[f.name])?this.data.initial.colors[f.name]:f.color);
  this.keyboard=new ReplayKeyboard($('replay-keyboard'),this.data);this.previousAspect=$('solve-panel').style.getPropertyValue('--keyboard-aspect');$('solve-panel').style.setProperty('--keyboard-aspect',String(this.keyboard.layout.width/this.keyboard.layout.height));this.render();this.viewer.resize();
 }
 render(){
  if(!this.active)return;const frame=this.presentation.frame(this.at);this.viewer.colors=frame.paused?Array(8).fill('#888888'):this.palette;this.viewer.setPuzzle(this.data.size,frame.state,null,frame.motions);this.viewer.setView(frame.view);
  $('replay-scramble').hidden=frame.stage==='Solve';for(const span of $('replay-scramble').children){const active=Number(span.dataset.index)===frame.scrambleIndex;span.classList.toggle('current',active);if(active)span.setAttribute('aria-current','step');else span.removeAttribute('aria-current');}
  this.keyboard.render(this.at-this.presentation.introMs);$('home-replay-progress').value=String(this.at);$('home-replay-play').textContent=this.playing?'Pause':'Play';$('home-replay-stage').textContent=frame.stage;$('home-replay-time').textContent=formatTime(frame.elapsed);$('home-replay-keys').textContent=(frame.keys??[]).map(code=>code.replace(/^Key|^Digit/, '')).join(' + ');this.onFrame(this.data,frame);
 }
 tick(token){requestAnimationFrame(now=>{if(!this.active||!this.playing||token!==this.token)return;const from=this.at;this.at=Math.min(this.presentation.duration,this.at+Math.max(0,now-this.lastTick)*Number($('home-replay-speed').value));this.lastTick=Math.max(this.lastTick,now);
  for(const kind of this.presentation.sounds(from,this.at)){this.playedSounds++;this.sound(kind);}if(this.at>=this.presentation.duration)this.playing=false;this.render();if(this.playing)this.tick(token);
 });}
 pause(){if(!this.active)return;this.playing=false;this.token++;this.render();}
 stop(){if(!this.active)return;this.active=false;this.playing=false;this.token++;this.viewer.dispose();this.viewer=null;$('replay-keyboard').replaceChildren();$('solve-panel').style.setProperty('--keyboard-aspect',this.previousAspect);document.documentElement.classList.remove('replaying');this.onExit();}
}
