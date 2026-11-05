import {ActionBindingsUI} from './action-bindings-ui.js';
import {KeyboardEngine,TurnMeter,defaultConfig,validateConfig,parseTrigger,displayCode,upgradeEIFDefaults,upgradeKeyboardDefaults} from './keyboard-engine.js';
import {renderKeyLabel} from './keyboard-label.js';
import {keyboardLayout} from './keyboard-layout.js';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
const uid=()=>globalThis.crypto?.randomUUID?.()??`key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function svg(tag,attributes={}){const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attributes))el.setAttribute(k,v);return el;}
// Upgrade untouched old defaults; keep deliberately customized legacy keyboards.
function untouchedLegacy(config){
 if(config.modes.length!==1||config.modes[0].id!=='default'||config.modes[0].name!=='Default')return false;
 const expected=[];const add=(trigger,action)=>expected.push({trigger,action});
 ['U','R','F','J','L','B','K','D'].forEach((key,i)=>add(key,{type:'move',face:['U','R','F','BR','L','B','BL','D'][i],dir:1,kind:'default',depth:1}));
 for(let n=0;n<=9;n++){add(String(n),{type:'depth',depth:n||10});add(`Shift+${n}`,{type:'depth',depth:n?n+10:20});}
 add('NumpadMultiply',{type:'depth',depth:18});add('Shift',{type:'hold-slice'});add('Ctrl',{type:'hold-wide'});add('Alt',{type:'hold-reverse'});add('M',{type:'next-mode'});
 for(const [trigger,command] of [['Ctrl+Z','undo'],['Meta+Z','undo'],['Backspace','undo'],['Ctrl+Shift+Z','redo'],['Meta+Shift+Z','redo'],['Ctrl+Y','redo'],['Home','home'],['Escape','cancel']])add(trigger,{type:'command',command});
 const canonical=bindings=>bindings.map(b=>`${JSON.stringify(parseTrigger(b.trigger))}:${JSON.stringify(Object.entries(b.action).sort())}`).sort().join('\n');
 return canonical(config.modes[0].bindings)===canonical(expected);
}
function migrateNames(config){
 if(!config.modes.some(mode=>mode.id===config.defaultMode))config.defaultMode=config.modes.find(mode=>mode.id==='cif')?.id??config.modes[0].id;
 const used=new Set(),upgradeCommands=config.commandVersion!==1;
 for(const mode of config.modes){
  let name=upgradeCommands&&mode.id==='e-center'&&['E-Center','E Center'].includes(mode.name)?'E– cntr':mode.name.trim().split(/\s+/u).slice(0,2).map(word=>Array.from(word).slice(0,6).join('')).join(' ');
  const base=name;let i=2;
  while(used.has(name.toLowerCase())){const words=base.split(' '),last=words.length-1,suffix=String(i++);words[last]=words[last].slice(0,6-suffix.length)+suffix;name=words.join(' ');}
  if(upgradeCommands){
  for(const binding of mode.bindings)if(binding.trigger.toLowerCase()==='escape'&&binding.action.type==='command'&&binding.action.command==='cancel')binding.action.command='pause';
  if((mode.id==='e-center'||mode.bindings.some(b=>b.action.type==='command'&&b.action.command==='undo'))&&!mode.bindings.some(b=>JSON.stringify(parseTrigger(b.trigger))===JSON.stringify(parseTrigger('Shift+Backspace'))))mode.bindings.push({id:uid(),trigger:'Shift+Backspace',action:{type:'command',command:'redo'}});
  if(mode.id==='e-center'&&!mode.bindings.some(b=>b.trigger.toLowerCase()==='escape'))mode.bindings.push({id:uid(),trigger:'Escape',action:{type:'command',command:'pause'}});
  }
  if(config.sliceVersion!==1&&mode.bindings.some(b=>b.action.type==='move')){
   const shifts=mode.bindings.map(b=>parseTrigger(b.trigger)).filter(steps=>steps.length===1&&steps[0].length===1).map(steps=>steps[0][0]);
   if(!shifts.includes('Shift')){
    const sides=['ShiftLeft','ShiftRight'],bound=sides.filter(code=>shifts.includes(code));
    for(const trigger of bound.length?sides.filter(code=>!shifts.includes(code)):['Shift'])mode.bindings.push({id:uid(),trigger,action:{type:'hold-slice'}});
   }
  }
  if(config.rotationVersion!==1&&config.preset!=='cstimer'&&['cif','eif-r','eif-l','e-center'].includes(mode.id)){
   for(const [trigger,dir] of [['Backquote',1],['Minus',-1]])if(!mode.bindings.some(b=>parseTrigger(b.trigger)[0].includes(trigger)))mode.bindings.push({id:uid(),trigger,action:{type:'rotate',face:'U',dir,kind:'outer',depth:1}});
  }
  mode.name=name;used.add(name.toLowerCase());
 }
 config.commandVersion=1;config.sliceVersion=1;config.rotationVersion=1;return upgradeKeyboardDefaults(upgradeEIFDefaults(config));
}
export class KeyboardUI{
 constructor({context,move,command,status,suffix,input,confirm}){
  this.confirm=confirm;this.input=input;this.suffix=suffix;this.size=context().size;this.profiles={};this.context=context;this.move=move;this.command=command;this.status=status;this.storageOK=true;this.meter=new TurnMeter();this.pressedLabels=new Map();this.pointerKeys=new Map();
  this.config=defaultConfig(this.size);
  try{const saved=JSON.parse(localStorage.getItem('master-fto-keyboard-v2')||'null');if(saved){this.profiles=saved.profiles??{};for(const config of Object.values(this.profiles)){validateConfig(config,{legacyNames:true});migrateNames(config);}this.config=this.profiles[this.size]??defaultConfig(this.size);this.config.display={...defaultConfig(this.size).display,...saved.display};}
  else{const stored=JSON.parse(localStorage.getItem('master-fto-keyboard-v1')||'null');if(stored){validateConfig(stored,{legacyNames:true});this.config={...(untouchedLegacy(stored)?defaultConfig(this.size):stored),display:{...this.config.display,...stored.display,cornerVersion:stored.display?.cornerVersion??0}};}}}
  catch{this.storageOK=false;}
  migrateNames(this.config);this.sanitizeDisplay();this.engine=new KeyboardEngine(this.config);
  this.install();this.renderLayout();this.renderSettings();this.render();
  this.catalog=new ActionBindingsUI(this);
  this.timer=setInterval(()=>{if(this.config.display.show){if(this.engine.expire())this.render();this.renderMeter();}},50);
 }
 setSize(size){
  if(size===this.size)return;
  this.save();const display=structuredClone(this.config.display);this.size=size;
  this.config=structuredClone(this.profiles[size]??defaultConfig(size));this.config.display=display;
  migrateNames(this.config);this.sanitizeDisplay();this.engine.configure(this.config);this.clear({selection:true});
  this.renderSettings();this.render();this.save();
 }
 sanitizeDisplay(){
  const d=this.config.display;delete d.highlight;if(d.cornerVersion!==3&&[400,560].includes(d.width))d.width=900;d.cornerVersion=3;this.config.suffixMode='one-shot';
  for(const k of ['show','numpad','showTPS'])d[k]=d[k]===true;
  d.layout=['iso','60'].includes(d.layout)?d.layout:'ansi';
  if(![1,3,5].includes(d.window))d.window=1;
  for(const [key,min,max,fallback] of [['width',220,1200,900],['opacity',35,100,100],['window',1,5,1]])d[key]=Number.isFinite(d[key])?Math.min(max,Math.max(min,d[key])):fallback;
 }
 save(){
  this.config.activeMode=this.engine.baseMode;
  this.profiles[this.size]=structuredClone(this.config);
  try{localStorage.setItem('master-fto-keyboard-v2',JSON.stringify({version:2,profiles:this.profiles,display:this.config.display}));this.storageOK=true;}catch{this.storageOK=false;}
  this.status?.();
 }
 blocked(event){return document.documentElement.classList.contains('replaying')||!!document.querySelector('dialog[open]')||event?.target?.closest?.('input,select,textarea,[contenteditable=true]');}
 install(){
  $('show-keyboard').onchange=()=>{this.config.display.show=$('show-keyboard').checked;this.renderSettings();this.render();this.save();};
  $('edit-keyboard').onclick=()=>{this.clear();this.catalog.openPreferences();$('keyboard-dialog').showModal();};
  $('close-keyboard').onclick=()=>$('keyboard-dialog').close();
  $('keyboard-dialog').addEventListener('close',()=>{this.clear();});
  for(const [id,key] of [['keyboard-layout','layout'],['keyboard-numpad','numpad'],['keyboard-width','width'],['keyboard-opacity','opacity'],['keyboard-tps','showTPS'],['keyboard-window','window']]){
   $(id).oninput=()=>{
    const input=$(id);this.config.display[key]=input.type==='checkbox'?input.checked:['layout'].includes(key)?input.value:Number(input.value);
    this.sanitizeDisplay();if(['layout','numpad'].includes(key))this.renderLayout();this.renderSettings();this.render();this.save();
   };
  }
  $('keyboard-reset-tps').onclick=()=>{this.meter.reset();this.renderMeter();};
  $('keyboard-sequence-timeout').onchange=()=>{this.config.sequenceTimeout=Math.round(Math.max(200,Math.min(10000,Number($('keyboard-sequence-timeout').value)||1400)));this.engine.config.sequenceTimeout=this.config.sequenceTimeout;this.save();};
  window.addEventListener('keydown',e=>this.down(e));window.addEventListener('keyup',e=>this.up(e));
  window.addEventListener('blur',()=>this.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();});
  $('settings').addEventListener('click',()=>this.clear());
 }
 commit(next){
  validateConfig(next);migrateNames(next);next.suffixMode='one-shot';
  if(!next.modes.some(m=>m.id===next.activeMode))next.activeMode=next.modes[0].id;
  this.config=next;this.sanitizeDisplay();this.engine.configure(next);this.save();this.renderLayout();this.renderSettings();this.render();
 }
 clear({selection=false}={}){clearTimeout(this.suffixHoldTimer);this.engine.clear({selection:selection||this.config.suffixMode==='one-shot'});this.pointerKeys.clear();this.pressedLabels.clear();this.render();}
 returnToDefault(){
  const mode=this.config.modes.find(mode=>mode.id===this.config.defaultMode)??this.config.modes.find(mode=>mode.id==='cif')??this.config.modes[0];
  this.clear({selection:true});this.engine.setMode(mode.id);this.render();this.save();
 }
 scheduleSuffixHold(){
  clearTimeout(this.suffixHoldTimer);const deadline=this.engine.suffixDeadline;
  if(Number.isFinite(deadline))this.suffixHoldTimer=setTimeout(()=>{if(this.engine.activateSuffixes()){this.suffix?.();this.render();}this.scheduleSuffixHold();},Math.max(0,deadline-Date.now()));
 }
 down(event){
  this.input?.('down',event);
  if(this.context().manualPaused){if(this.blocked(event)||event.repeat)return;event.preventDefault();event.stopPropagation?.();this.command('resume');return;}
  if(this.blocked(event))return;
  this.syncModifiers(event);
  const result=this.engine.keyDown(event.code,{repeat:event.repeat,size:this.context().size});
  this.scheduleSuffixHold();
  if(result.handled)event.preventDefault();
  const action=result.action;
  if(action?.type==='command'&&action.command==='pause'&&!this.context().canPause){this.pressedLabels.set(event.code,'');this.render();return;}
  if(!result.repeat)this.pressedLabels.set(event.code,['move','rotate'].includes(action?.type)?this.engine.resolve(action,this.context()).label:result.prefix?`${this.engine.actionText(result.prefix.action)} …`:this.engine.label(event.code,this.context()));
  if(this.keycaps.has(event.code))this.paintKey(event.code);
  this.renderLights();
  if(['move','rotate'].includes(action?.type)){
   const move=this.engine.resolve(action,this.context());
   if(!move.valid)this.notice(`${move.label} needs at least ${move.depth+move.count-1} layers. Press the selected suffix again to clear it.`);
   else if(this.move(move)!==false){if(action.type!=='rotate')this.engine.consume();this.lastMove=move.label;}else this.notice(this.context().scrambling?'Wait for the scramble to finish.':'Input queue full. Wait for turns to finish, or press Escape.');
  }else if(['depth','suffix-slice'].includes(action?.type)){this.suffix?.();
  }else if(action?.type==='command'){
   if(action.command==='reset-tps')this.meter.reset();else this.command(action.command);
  }
  if(action&&['mode','next-mode'].includes(action.type))this.save();
  this.render();
 }
 pointerMove(face,event={},base={kind:'outer',depth:1,dir:1}){
  if(this.context().manualPaused||this.context().scrambling)return false;
  this.syncModifiers(event);
  this.engine.activateSuffixes(Date.now(),true);this.scheduleSuffixHold();
  const move=this.engine.resolve({type:'move',face,kind:base.kind,depth:base.depth,dir:base.dir*(event.button===2?-1:1)},this.context());
  if(!move.valid)return false;
  if(this.move({...move,source:'pointer'})===false)return false;
  this.engine.consume();this.lastMove=move.label;this.render();return true;
 }
 syncModifiers(event){
  for(const code of this.engine.syncModifiers(event,new Set(this.pointerKeys.values()))){this.pressedLabels.delete(code);}
 }
 up(event){
  this.input?.('up',event);
  const result=this.engine.keyUp(event.code);this.syncModifiers(event);this.scheduleSuffixHold();this.pressedLabels.delete(event.code);
  if(result?.action)this.suffix?.();
  this.keycaps.get(event.code)?.group.classList.remove('pressed');
  this.render();
 }
 recordTurn(){this.meter.add(performance.now());this.meter.sample(performance.now(),this.config.display.window);if(this.config.display.show)this.renderMeter();}
 notice(text){$('keyboard-notice').textContent=text;$('keyboard-notice').hidden=false;clearTimeout(this.noticeTimer);this.noticeTimer=setTimeout(()=>$('keyboard-notice').hidden=true,3500);}
 renderLayout(){
  const layout=keyboardLayout(this.config.display);this.keycaps=new Map();const board=$('keyboard-svg');board.replaceChildren();board.setAttribute('viewBox',`-.04 -.04 ${layout.width} ${layout.height}`);$('solve-panel').style.setProperty('--keyboard-aspect',String(layout.width/layout.height));
  for(const key of layout.keys){
   const group=svg('g',{'data-code':key.code,class:'keycap',role:'button',tabindex:'0','aria-label':displayCode(key.code)});
   let shape;
   if(key.shape==='iso-enter')shape=svg('path',{d:`M${key.x},${key.y}h${key.w}v${key.h}h-1.17v-.99h-.25Z`});
   else shape=svg('rect',{x:key.x,y:key.y,width:key.w,height:key.h,rx:.09});
   const label=svg('text',{x:key.x+key.w/2,y:key.y+key.h/2,'dominant-baseline':'middle','text-anchor':'middle'});group.append(shape,label);board.append(group);this.keycaps.set(key.code,{group,label,width:key.w});
   group.addEventListener('pointerdown',e=>{e.preventDefault();group.setPointerCapture(e.pointerId);this.pointerKeys.set(e.pointerId,key.code);this.down({code:key.code,preventDefault(){},target:group});});
   const release=e=>{const code=this.pointerKeys.get(e.pointerId);if(!code)return;this.pointerKeys.delete(e.pointerId);this.up({code,preventDefault(){}});};
   group.addEventListener('pointerup',release);group.addEventListener('pointercancel',release);group.addEventListener('lostpointercapture',release);
   group.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();this.down({code:key.code,repeat:e.repeat,preventDefault(){},target:group});}});
   group.addEventListener('keyup',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();this.up({code:key.code,preventDefault(){}});}});
  }
 }
 renderSettings(){
  const d=this.config.display;$('show-keyboard').checked=d.show;$('keyboard-overlay').hidden=!d.show;
  for(const [id,key] of [['keyboard-layout','layout'],['keyboard-numpad','numpad'],['keyboard-width','width'],['keyboard-opacity','opacity'],['keyboard-tps','showTPS'],['keyboard-window','window']]){
   if($(id).type==='checkbox')$(id).checked=d[key];else $(id).value=String(d[key]);
  }
  $('keyboard-numpad').disabled=d.layout==='60';$('keyboard-numpad').closest('label').hidden=d.layout==='60';
  $('keyboard-width-value').textContent=`${d.width}px`;$('keyboard-opacity-value').textContent=`${d.opacity}%`;
  $('solve-panel').style.setProperty('--keyboard-width',`${d.width}px`);$('keyboard-overlay').style.opacity=d.opacity/100;
  $('keyboard-stats').hidden=!d.showTPS;$('keyboard-sequence-timeout').value=String(this.config.sequenceTimeout??1400);
 }
 render(){
  if(!this.keycaps)return;
  const context=this.context();
  for(const code of this.keycaps.keys())this.paintKey(code,context);
  $('keyboard-mode-name').textContent=this.engine.mode.name;
  $('keyboard-title').textContent='Keyboard & bindings';
  $('keyboard-pending').textContent=this.engine.pending!==null?`${this.config.suffixMode==='one-shot'?'Next':'Depth'}: ${this.engine.pending}${this.engine.slicePending?' · slice':' layers'}`:this.engine.slicePending?'Next: slice':this.engine.sequence.length?'Sequence…':'';
  $('keyboard-last').textContent=this.lastMove??'';

  this.renderLights();this.renderMeter();
 }
 paintKey(code,context=this.context()){
  const {group,label,width}=this.keycaps.get(code),active=this.engine.pressed.has(code);
  const state=this.engine.keyState(code,context);
  const text=state.selected?state.label:active&&this.pressedLabels.has(code)?this.pressedLabels.get(code):state.label;
  group.classList.toggle('selected',state.selected);group.classList.toggle('affected',state.affected);
  renderKeyLabel(label,text,width);

  group.setAttribute('aria-label',`${displayCode(code)}${text?`: ${text}`:': unbound'}`);group.classList.toggle('unbound',!text);
 }
 renderLights(){
  for(const [code,{group}] of this.keycaps)group.classList.toggle('pressed',this.engine.pressed.has(code));
 }
 renderMeter(){const s=this.meter.sample(performance.now(),this.config.display.window);$('keyboard-tps-value').textContent=s.tps.toFixed(1);$('keyboard-peak').textContent=s.peak.toFixed(1);$('keyboard-turns').textContent=String(s.total);$('keyboard-stats').title=`${this.config.display.window}s window · Peak ${s.peak.toFixed(1)} TPS · ${s.total} turns`;}
 snapshot(){return {mode:this.engine.mode.id,modeName:this.engine.mode.name,baseMode:this.engine.baseMode,pending:this.engine.pending,slicePending:this.engine.slicePending,pressed:[...this.engine.pressed],stats:this.meter.sample(performance.now(),this.config.display.window),config:structuredClone(this.config)};}
}
