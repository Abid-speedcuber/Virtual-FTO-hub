import {bindingCatalog,bindingActionKey,BINDING_CATEGORIES,bindingSubgroups,inBindingSubgroup} from './binding-catalog.js';
import {defaultConfig,validateConfig,displayTrigger,displayCode,modifierOf,triggerKey,equivalentTrigger,actionLabel,MODIFIERS,KeyboardEngine} from './keyboard-engine.js';
import {keyboardLayout} from './keyboard-layout.js';
import {renderKeyLabel} from './keyboard-label.js';
import {formatBindingTrigger} from './binding-key-labels.js';
import {parseRotation,remappedFace,ROTATION_ORDER} from './rotation-remap.js';
import {cstimerConfig} from './keyboard-presets.js';
import {downloadJSON} from './recording-ui.js';
const $=id=>document.getElementById(id),uid=()=>crypto.randomUUID();
const prettyTrigger=trigger=>formatBindingTrigger(trigger,navigator.userAgentData?.platform??navigator.platform??'');

const el=(tag,className,text)=>{const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=text;return item;};
const NS='http://www.w3.org/2000/svg';
const svg=(tag,attributes={})=>{const item=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attributes))item.setAttribute(k,v);return item;};
const isModifierKey=code=>MODIFIERS.includes(modifierOf(code));
const STICKY_ACTIONS=['depth','suffix-slice','hold-slice','hold-wide','hold-reverse'];
const withoutTrigger=(bindings,trigger)=>bindings.filter(b=>{try{return !equivalentTrigger(b.trigger,trigger);}catch{return true;}});
export class ActionBindingsUI{
 constructor(owner){
  this.owner=owner;this.size=owner.size;this.mode=null;this.listening=false;
  for(const id of ['keyboard-puzzle','keyboard-preferences-puzzle'])for(let size=2;size<=20;size++)$(id).append(new Option(size===2?'Baby FTO (2×2)':size===4?'Master FTO (4×4)':`${size} × ${size} FTO`,String(size)));
  for(const [value,label] of BINDING_CATEGORIES)$('catalog-category').append(new Option(label,value));
  for(const id of ['keyboard-puzzle','keyboard-preferences-puzzle'])$(id).onchange=()=>{this.size=Number($(id).value);this.mode=null;this.render();};
  $('customize-bindings').onclick=()=>{this.sticky.clear();this.render();$('bindings-dialog').showModal();this.renderBoard();};$('close-bindings').onclick=()=>$('bindings-dialog').close();
  this.installModeMenu();this.installRotation();
  $('catalog-search').oninput=()=>{if($('catalog-search').value.trim()){$('catalog-category').value='all';$('catalog-subgroup').value='all';}this.renderRows();};
  $('catalog-category').oninput=()=>{$('catalog-search').value='';$('catalog-subgroup').value='all';this.renderRows();document.querySelector('.keyboard-editor-body').scrollTop=0;};
  $('catalog-subgroup').oninput=()=>{this.renderRows();document.querySelector('.keyboard-editor-body').scrollTop=0;};
  $('catalog-reset-abid').onclick=()=>this.reset('abid');$('catalog-reset-cstimer').onclick=()=>this.reset('cstimer');
  $('catalog-export').onclick=()=>downloadJSON(this.config(),`fto-${this.size}-keyboard.json`);
  $('catalog-choose-import').onclick=()=>{$('keyboard-import-title').textContent=`Import ${this.size} × ${this.size} keyboard`;$('keyboard-import-message').textContent='';$('keyboard-import-dialog').showModal();};
  $('close-keyboard-import').onclick=()=>$('keyboard-import-dialog').close();$('choose-keyboard-file').onclick=()=>$('catalog-import').click();
  $('catalog-import').onchange=event=>this.importFile(event.target.files[0]);
  const drop=$('keyboard-import-drop');for(const type of ['dragenter','dragover'])drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('drag-over');});for(const type of ['dragleave','drop'])drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('drag-over');});drop.addEventListener('drop',event=>this.importFile(event.dataTransfer.files[0]));
  $('close-bind-key').onclick=()=>$('bind-key-dialog').close();$('bind-key-dialog').addEventListener('close',()=>{this.listening=false;this.pressed.clear();this.captured.clear();});
  $('bind-key-listen').onclick=()=>this.listen();$('bind-key-form').onsubmit=event=>{event.preventDefault();this.saveKey(false);};$('bind-key-replace').onclick=()=>this.saveKey(true);
  $('bind-key-trigger').oninput=()=>{$('bind-key-replace').hidden=true;$('bind-key-message').textContent='';};
  document.addEventListener('keydown',event=>this.captureDown(event),true);document.addEventListener('keyup',event=>this.captureUp(event),true);
  this.pressed=new Set();this.captured=new Set();
  this.sticky=new Set();this.installBoard();
 }
 config(){return this.size===this.owner.size?this.owner.config:this.owner.profiles[this.size]??defaultConfig(this.size);}
 write(config){
  validateConfig(config);
  if(this.size===this.owner.size){this.owner.commit(config);}
  else{this.owner.profiles[this.size]=structuredClone(config);this.owner.save();}
 }
 change(mutator){try{const config=structuredClone(this.config());mutator(config);this.write(config);this.render();this.message('Saved');return true;}catch(error){this.lastError=error.message;this.message(error.message);return false;}}
 openPreferences(){this.size=this.owner.size;this.mode=this.owner.engine.baseMode;$('catalog-search').value='';$('catalog-category').value='all';$('catalog-subgroup').value='all';this.render();this.message('');}
 render(){
  const config=this.config();if(!config.modes.some(m=>m.id===this.mode))this.mode=config.activeMode??config.modes[0].id;
  for(const id of ['keyboard-puzzle','keyboard-preferences-puzzle'])$(id).value=String(this.size);
  this.renderModes();
  this.renderRows();
  this.renderBoard();
 }
 renderSubgroups(config,category){
  const select=$('catalog-subgroup'),options=bindingSubgroups(category,config,this.size),signature=JSON.stringify(options);
  if(select.dataset.options!==signature){const selected=select.value;select.replaceChildren(...options.map(([value,label])=>new Option(label,value)));select.value=options.some(([value])=>value===selected)?selected:'all';select.dataset.options=signature;}
  select.disabled=options.length===1;
 }
 renderRows(){
  const raw=$('catalog-search').value,table=$('catalog-rows').closest('table');
  if(raw.startsWith('{')){this.renderRotation(raw,table);return;}
  $('rotation-panel').hidden=true;table.hidden=false;this.pendingRotation=null;
  $('catalog-col1').textContent='Action';$('catalog-col2').textContent='Assigned keys';
  const config=this.config(),mode=config.modes.find(m=>m.id===this.mode)??config.modes[0],category=$('catalog-category').value,query=raw.toLowerCase().trim();
  this.renderSubgroups(config,category);const subgroup=$('catalog-subgroup').value;
  const rows=bindingCatalog(this.size,config).map(row=>({...row,bindings:mode.bindings.filter(b=>bindingActionKey(b.action)===row.key)})).filter(row=>(category==='all'||row.category===category)&&inBindingSubgroup(row,subgroup)&&(!query||`${row.label} ${row.detail} ${row.bindings.map(b=>displayTrigger(b.trigger)+' '+prettyTrigger(b.trigger)).join(' ')}`.toLowerCase().replaceAll('′',"'").includes(query.replaceAll('′',"'"))));
  $('catalog-rows').replaceChildren();
  for(const row of rows){
   const tr=el('tr');tr.dataset.action=row.key;const name=el('th',null,row.label);name.scope='row';if(row.detail)name.append(el('small',null,row.detail));
   const cell=el('td'),keys=el('div','assigned-keys');
   for(const binding of row.bindings){const chip=el('span','binding-chip'),button=el('button',null,prettyTrigger(binding.trigger)),remove=el('button','unassign-key','×');button.title=`Replace ${displayTrigger(binding.trigger)}`;button.setAttribute('aria-label',`Replace ${displayTrigger(binding.trigger)} for ${row.label}`);button.onclick=()=>this.editKey(row,binding);
    remove.setAttribute('aria-label',`Unassign ${displayTrigger(binding.trigger)} from ${row.label}`);remove.onclick=()=>this.change(config=>{const target=config.modes.find(m=>m.id===this.mode);target.bindings=target.bindings.filter(b=>b.id!==binding.id);});chip.append(button,remove);keys.append(chip);
   }
   if(!row.bindings.length)keys.append(el('span','unassigned','Unassigned'));
   const add=el('button','add-key','+');add.setAttribute('aria-label',`Add key for ${row.label}`);add.title='Add another key';add.onclick=()=>this.editKey(row);keys.append(add);cell.append(keys);tr.append(name,cell);$('catalog-rows').append(tr);
  }
  $('catalog-empty').hidden=!!rows.length;$('catalog-count').textContent=`${rows.length} actions`;
 }
 editKey(row,binding){
  this.editing={row,binding};$('bind-key-title').textContent=row.label;$('bind-key-trigger').value=binding?displayTrigger(binding.trigger):'';$('bind-key-message').textContent='';$('bind-key-replace').hidden=true;$('bind-key-dialog').showModal();this.listen();
 }
 listen(){this.pressed.clear();this.captured.clear();this.listening=true;$('bind-key-listen').textContent='Press a key or chord…';$('bind-key-listen').focus();}
 captureDown(event){
  if(!$('bind-key-dialog').open||!this.listening||event.target.closest('input'))return;
  if(event.code==='Enter'&&event.target.id==='bind-key-save')return;
  event.preventDefault();event.stopImmediatePropagation();if(event.code==='Escape'){$('bind-key-dialog').close();return;}if(event.repeat)return;this.pressed.add(event.code);this.captured.add(event.code);
 }
 captureUp(event){
  if(!$('bind-key-dialog').open||!this.listening||!this.captured.has(event.code))return;
  event.preventDefault();event.stopImmediatePropagation();this.pressed.delete(event.code);
  if(!this.pressed.size){$('bind-key-trigger').value=[...new Set(this.captured.size===1?[...this.captured]:[...this.captured].map(modifierOf))].map(displayCode).join('+');this.listening=false;$('bind-key-listen').textContent='Record another key';$('bind-key-replace').hidden=true;$('bind-key-message').textContent='';$('bind-key-save').focus();}
 }
 saveKey(replace){
  try{
   const config=structuredClone(this.config()),mode=config.modes.find(m=>m.id===this.mode),trigger=$('bind-key-trigger').value.trim(),old=this.editing.binding;triggerKey(trigger);
   const conflicts=mode.bindings.filter(b=>b.id!==old?.id&&equivalentTrigger(b.trigger,trigger)),conflict=conflicts[0];
   if(conflict&&!replace){const label=bindingCatalog(this.size,config).find(row=>row.key===bindingActionKey(conflict.action))?.label??conflict.action.type;$('bind-key-message').textContent=`${displayTrigger(trigger)} is assigned to ${label}${conflicts.length>1?' and other actions':''}. Move it to ${this.editing.row.label}?`;$('bind-key-replace').hidden=false;return;}
   mode.bindings=mode.bindings.filter(b=>b.id!==old?.id&&(!replace||!conflicts.some(conflict=>b.id===conflict.id)));mode.bindings.push({id:old?.id??uid(),trigger,action:structuredClone(this.editing.row.action)});
   this.write(config);$('bind-key-dialog').close();this.render();this.message('Saved');
  }catch(error){$('bind-key-message').textContent=error.message;}
 }
 showModeActions(){
  $('catalog-search').value='';$('catalog-category').value='modes';$('catalog-subgroup').value='all';this.render();document.querySelector('.keyboard-editor-body').scrollTop=0;
 }
 addMode(copy=false,sourceId=this.mode,name){return this.change(config=>{const source=config.modes.find(mode=>mode.id===sourceId);let n=config.modes.length+1;while(config.modes.some(mode=>mode.name===`Mode ${n}`))n++;const id=uid();config.modes.push({id,name:name??`Mode ${n}`,bindings:copy?source.bindings.map(binding=>({...structuredClone(binding),id:uid()})):[]});this.mode=id;});}
 renderModes(){
  const config=this.config(),list=$('catalog-mode-options');list.replaceChildren();const selected=config.modes.find(mode=>mode.id===this.mode);
  const label=mode=>`${mode.name}${mode.id===config.defaultMode?' (Default)':''}`;$('catalog-mode-choice').textContent=label(selected);
  for(const mode of config.modes){const row=el('div','mode-option'),choose=el('button',null,label(mode)),more=el('button','mode-more','⋯');choose.type=more.type='button';choose.setAttribute('role','option');choose.setAttribute('aria-selected',String(mode.id===this.mode));choose.dataset.mode=mode.id;choose.onclick=()=>{this.mode=mode.id;$('catalog-mode-picker').open=false;this.render();};choose.oncontextmenu=event=>{event.preventDefault();this.openModeMenu(mode.id,event.clientX,event.clientY);};choose.onkeydown=event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){event.preventDefault();const box=choose.getBoundingClientRect();this.openModeMenu(mode.id,box.left,box.bottom);}};more.setAttribute('aria-label',`Options for ${mode.name}`);more.onclick=()=>{const box=more.getBoundingClientRect();this.openModeMenu(mode.id,box.left,box.bottom);};row.append(choose,more);list.append(row);}
  const add=el('button','new-mode-option','+ New mode');add.type='button';add.disabled=config.modes.length>=40;add.onclick=()=>{$('catalog-mode-picker').open=false;this.openModeName();};list.append(add);
 }
 openModeMenu(id,x,y){
  this.menuMode=id;const menu=$('mode-context-menu'),config=this.config(),current=config.modes.find(m=>m.id===this.mode),target=config.modes.find(m=>m.id===id),other=id!==this.mode;
  $('mode-context-delete').disabled=config.modes.length===1;$('mode-context-default').disabled=config.defaultMode===id;
  for(const name of ['mode-context-overwrite-with','mode-context-overwrite'])$(name).hidden=!other;
  if(other){$('mode-context-overwrite-with').title=`Replace ${current.name} with the bindings of ${target.name}`;$('mode-context-overwrite').title=`Replace ${target.name} with the bindings of ${current.name}`;}
  menu.hidden=false;menu.style.left=`${Math.max(8,Math.min(x,innerWidth-198))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-250))}px`;
 }
 installModeMenu(){
  const menu=$('mode-context-menu'),close=()=>menu.hidden=true;
  $('catalog-mode-choice').oncontextmenu=event=>{event.preventDefault();this.openModeMenu(this.mode,event.clientX,event.clientY);};
  $('mode-context-default').onclick=()=>{if(this.change(config=>config.defaultMode=this.menuMode))this.showModeActions();close();};
  $('mode-context-duplicate').onclick=()=>{if(this.addMode(true,this.menuMode))this.showModeActions();close();};
  $('mode-context-delete').onclick=()=>{if(this.change(config=>{const id=this.menuMode;config.modes=config.modes.filter(mode=>mode.id!==id);if(!config.modes.length)throw Error('Keep at least one mode.');for(const mode of config.modes)mode.bindings=mode.bindings.filter(binding=>!['mode','hold-mode'].includes(binding.action.type)||binding.action.mode!==id);if(config.defaultMode===id)config.defaultMode=config.modes[0].id;if(config.activeMode===id)config.activeMode=config.modes[0].id;if(this.mode===id)this.mode=config.modes[0].id;}))this.showModeActions();close();};
  $('mode-context-rename').onclick=()=>{close();this.openModeName(this.menuMode);};
  $('mode-context-overwrite-with').onclick=()=>{close();this.overwriteMode(this.menuMode,this.mode);};
  $('mode-context-overwrite').onclick=()=>{close();this.overwriteMode(this.mode,this.menuMode);};
  $('close-mode-name').onclick=()=>$('mode-name-dialog').close();
  $('mode-name-form').onsubmit=event=>{event.preventDefault();const name=$('new-mode-name').value.trim();const saved=this.namingMode?this.change(config=>config.modes.find(mode=>mode.id===this.namingMode).name=name):this.addMode(false,this.mode,name);if(saved){$('mode-name-dialog').close();this.showModeActions();}else $('mode-name-message').textContent=this.lastError;};
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();});
  document.addEventListener('click',event=>{if(!$('catalog-mode-picker').contains(event.target))$('catalog-mode-picker').open=false;});
  $('bindings-dialog').addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();event.stopPropagation();close();}});
 }
 openModeName(id=null){this.namingMode=id;$('mode-name-title').textContent=id?'Rename mode':'New mode';$('save-mode-name').textContent=id?'Save name':'Create mode';$('new-mode-name').value=id?this.config().modes.find(mode=>mode.id===id).name:'';$('mode-name-message').textContent='';$('mode-name-dialog').showModal();$('new-mode-name').focus();}
 async overwriteMode(sourceId,targetId){
  const config=this.config(),source=config.modes.find(m=>m.id===sourceId),target=config.modes.find(m=>m.id===targetId);
  if(!source||!target||source===target)return;
  const size=this.size;
  const accepted=await this.owner.confirm(`Replace all bindings in ${target.name} with those from ${source.name}? This can’t be undone.`,'Overwrite',`Overwrite ${target.name}?`);
  if(!accepted||this.size!==size)return;
  this.change(next=>{
   const from=next.modes.find(m=>m.id===sourceId),to=next.modes.find(m=>m.id===targetId);
   to.bindings=from.bindings.map(binding=>{const copy=structuredClone(binding);copy.id=uid();if(['mode','hold-mode'].includes(copy.action.type)&&copy.action.mode===sourceId)copy.action.mode=targetId;return copy;});
  });
 }
 installBoard(){
  for(const [value,label] of BINDING_CATEGORIES)$('assign-action-category').append(new Option(label,value));
  $('assign-action-search').oninput=()=>this.renderAssignList();$('assign-action-category').oninput=()=>this.renderAssignList();
  $('close-assign-action').onclick=()=>$('assign-action-dialog').close();
  $('assign-action-dialog').addEventListener('keydown',event=>{
   if(event.key!=='Enter'||event.isComposing||event.target.id!=='assign-action-search'||!$('assign-action-search').value.trim())return;
   event.preventDefault();const row=this.assignRows?.[0];if(row)this.assignAction(row);
  });
  $('assign-action-clear').onclick=()=>{const {trigger}=this.assigning;if(this.change(config=>{const mode=config.modes.find(m=>m.id===this.mode);mode.bindings=withoutTrigger(mode.bindings,trigger);}))$('assign-action-dialog').close();};
  $('binding-board').addEventListener('toggle',()=>this.renderBoard());
 }
 stickyKeys(code){
  const others=[...this.sticky].filter(c=>c!==code&&modifierOf(c)!==modifierOf(code)).map(c=>isModifierKey(c)?modifierOf(c):c);
  return [...new Set(others),code];
 }
 isSticky(code,mode){
  if(isModifierKey(code))return true;
  if(!mode){const config=this.config();mode=config.modes.find(m=>m.id===this.mode)??config.modes[0];}
  return mode.bindings.some(b=>{try{return STICKY_ACTIONS.includes(b.action.type)&&equivalentTrigger(b.trigger,code);}catch{return false;}});
 }
 boardLabel(config,mode){
  let engine=null;
  try{
   engine=new KeyboardEngine({...config,activeMode:mode.id});
   for(const code of this.sticky)engine.keyDown(code,{now:0,size:this.size});
   engine.activateSuffixes(0,true);
  }catch{engine=null;}
  const context={size:this.size,canPause:true,manualPaused:false,defaultMove:{depth:1,count:1,dir:1}};
  return code=>{try{return engine?.label(code,context)??'';}catch{return '';}};
 }
 keyText(action,config){
  if(['mode','hold-mode'].includes(action.type)){const name=config.modes.find(m=>m.id===action.mode)?.name??'';return action.type==='hold-mode'?`Hold ${name}`:name;}
  return actionLabel(action);
 }
 buildBoard(board,layout){
  board.replaceChildren();this.board=new Map();board.setAttribute('viewBox',`-.04 -.04 ${layout.width} ${layout.height}`);
  for(const key of layout.keys){
   const group=svg('g',{class:'keycap',role:'button',tabindex:'0','data-code':key.code});
   const shape=key.shape==='iso-enter'?svg('path',{d:`M${key.x},${key.y}h${key.w}v${key.h}h-1.17v-.99h-.25Z`}):svg('rect',{x:key.x,y:key.y,width:key.w,height:key.h,rx:.09});
   const label=svg('text',{x:key.x+key.w/2,y:key.y+key.h/2,'dominant-baseline':'middle','text-anchor':'middle'});
   group.append(shape,label);board.append(group);this.board.set(key.code,{group,label,width:key.w});
   group.addEventListener('click',()=>this.boardClick(key.code));
   group.addEventListener('dblclick',()=>{if(this.isSticky(key.code))this.assignKey(key.code);});
   group.addEventListener('contextmenu',event=>{event.preventDefault();this.assignKey(key.code);});
   group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();this.boardClick(key.code);}});
  }
 }
 renderBoard(){
  const board=$('binding-board-svg'),display=this.owner.config.display,signature=`${display.layout}:${display.numpad}`;
  if(board.dataset.layout!==signature){this.buildBoard(board,keyboardLayout(display));board.dataset.layout=signature;}
  const config=this.config(),mode=config.modes.find(m=>m.id===this.mode)??config.modes[0];
  for(const code of [...this.sticky])if(!this.isSticky(code,mode))this.sticky.delete(code);
  const labelFor=this.boardLabel(config,mode);
  for(const [code,key] of this.board){
   const text=labelFor(code);
   key.group.classList.toggle('selected',this.sticky.has(code));
   key.group.classList.toggle('unbound',!text);
   renderKeyLabel(key.label,text,key.width);
   key.group.setAttribute('aria-label',`${displayCode(code)}${text?`: ${text}`:': unbound'}`);
  }
 }
 boardClick(code){
  if(this.isSticky(code)){if(!this.sticky.delete(code))this.sticky.add(code);this.renderBoard();}
  else this.assignKey(code);
 }
 assignKey(code){
  const trigger=this.stickyKeys(code).map(displayCode).join('+'),config=this.config(),mode=config.modes.find(m=>m.id===this.mode)??config.modes[0];
  const existing=mode.bindings.filter(b=>{try{return equivalentTrigger(b.trigger,trigger);}catch{return false;}});
  const labels=new Map(bindingCatalog(this.size,config).map(row=>[row.key,row.label]));
  this.assigning={trigger};
  $('assign-action-title').textContent=`Assign ${prettyTrigger(trigger)} · ${mode.name}`;
  $('assign-action-current').textContent=existing.length?`Currently: ${existing.map(b=>labels.get(bindingActionKey(b.action))??actionLabel(b.action)).join(', ')}. Choosing an action replaces it.`:'Currently unassigned.';
  $('assign-action-clear').hidden=!existing.length;$('assign-action-search').value='';$('assign-action-category').value='all';
  this.renderAssignList();$('assign-action-dialog').showModal();$('assign-action-search').focus();
 }
 renderAssignList(){
  const normalize=text=>text.toLowerCase().replaceAll('′',"'"),query=normalize($('assign-action-search').value.trim()),category=$('assign-action-category').value,list=$('assign-action-list');
  const rank=row=>{const label=normalize(row.label);return label===query?0:label===`${query}'`?1:label.startsWith(query)?2:label.includes(query)?3:4;};
  const rows=bindingCatalog(this.size,this.config()).filter(row=>(category==='all'||row.category===category)&&(!query||normalize(`${row.label} ${row.detail}`).includes(query)));
  if(query)rows.sort((a,b)=>rank(a)-rank(b));
  this.assignRows=rows;
  list.replaceChildren();
  for(const row of rows.slice(0,300)){const button=el('button',null,row.label);button.type='button';if(row.detail)button.append(el('small',null,row.detail));button.onclick=()=>this.assignAction(row);list.append(button);}
  if(!rows.length)list.append(el('p','phase-help','No matching actions.'));
  else if(rows.length>300)list.append(el('p','phase-help','Showing the first 300 actions. Refine the search to see more.'));
 }
 assignAction(row){
  const {trigger}=this.assigning;
  const saved=this.change(config=>{const mode=config.modes.find(m=>m.id===this.mode);mode.bindings=withoutTrigger(mode.bindings,trigger);mode.bindings.push({id:uid(),trigger,action:structuredClone(row.action)});});
  if(saved)$('assign-action-dialog').close();else $('assign-action-current').textContent=this.lastError;
 }
 installRotation(){
  $('rotation-apply').onclick=()=>this.applyRotation();
  $('rotation-undo').onclick=()=>this.undoRotation();
  $('bindings-dialog').addEventListener('close',()=>this.hideRotationToast());
 }
 renderRotation(raw,table){
  const result=parseRotation(raw),mapping=result.state==='valid'?result.mapping:null;
  this.pendingRotation=mapping;
  $('rotation-panel').hidden=false;$('rotation-panel').dataset.state=result.state;
  $('rotation-status').textContent=result.state==='typing'?'Rotation detected, keep typing...':result.state==='valid'?'Valid rotation detected.':`Invalid rotation detected.${result.reason?` ${result.reason}`:''}`;
  $('rotation-apply').hidden=!mapping;
  table.hidden=result.state==='invalid';$('catalog-empty').hidden=true;$('catalog-count').textContent='';
  $('catalog-col1').textContent='Old mapping';$('catalog-col2').textContent='New mapping';
  $('catalog-rows').replaceChildren();
  for(const face of ROTATION_ORDER){const tr=el('tr'),name=el('th',null,face);name.scope='row';tr.append(name,el('td',mapping?'':'unassigned',mapping?mapping[face]:'…'));$('catalog-rows').append(tr);}
 }
 applyRotation(){
  const mapping=this.pendingRotation;if(!mapping)return;
  const size=this.size,modeId=this.mode,changed=[];
  const saved=this.change(config=>{
   const mode=config.modes.find(m=>m.id===modeId);
   for(const binding of mode.bindings){
    const face=remappedFace(binding.action,mapping);
    if(face&&face!==binding.action.face){changed.push({id:binding.id,from:binding.action.face,to:face});binding.action.face=face;}
   }
  });
  if(!saved)return;
  $('catalog-search').value='';this.renderRows();
  if(!changed.length){this.message('No turns to remap in this mode.');return;}
  this.lastRotation={size,mode:modeId,changed};this.showRotationToast();
 }
 undoRotation(){
  const undo=this.lastRotation;if(!undo)return;
  if(this.size!==undo.size){this.message('Switch back to the puzzle you changed to undo.');return;}
  // Only revert bindings still holding the remapped face, so later edits survive.
  this.change(config=>{
   const mode=config.modes.find(m=>m.id===undo.mode);if(!mode)throw Error('That mode no longer exists.');
   for(const item of undo.changed){const binding=mode.bindings.find(b=>b.id===item.id);if(binding&&binding.action.face===item.to)binding.action.face=item.from;}
  });
  this.hideRotationToast();
 }
 showRotationToast(){$('rotation-toast').hidden=false;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>this.hideRotationToast(),10000);}
 hideRotationToast(){clearTimeout(this.toastTimer);$('rotation-toast').hidden=true;this.lastRotation=null;}
 async reset(preset){
  const size=this.size,name=preset==='abid'?"Abid’s":'csTimer’s';
  const accepted=await this.owner.confirm(`Replace all bindings and modes for ${size} × ${size} FTO with ${name} defaults? Custom bindings and modes for this puzzle will be lost.`,'Replace bindings',`Use ${name} default bindings?`);
  if(!accepted||this.size!==size)return;
  const previous=this.config(),config=preset==='abid'?defaultConfig(size):cstimerConfig(size);config.display=structuredClone(this.owner.config.display);config.sequenceTimeout=previous.sequenceTimeout??1400;
  this.write(config);this.mode=null;this.render();this.message(`${name} default bindings loaded.`);
 }
 async importFile(file){
  if(!file||this.importBusy)return;this.importBusy=true;$('choose-keyboard-file').disabled=true;const size=this.size;
  try{
   if(file.size>1024*1024)throw Error('Keyboard file is too large.');$('keyboard-import-message').textContent='Checking keyboard…';
   const config=JSON.parse(await file.text());validateConfig(config);config.display={...defaultConfig(size).display,...config.display};
   const count=config.modes.reduce((total,mode)=>total+mode.bindings.length,0);
   const accepted=await this.owner.confirm(`Import ${file.name} for ${size} × ${size} FTO? Its ${config.modes.length} modes and ${count} bindings will replace the current keyboard for this puzzle.`,'Import and replace','Replace keyboard bindings?');
   if(!accepted){$('keyboard-import-message').textContent='Import cancelled.';return;}if(this.size!==size)throw Error('The selected puzzle changed. Import the file again.');
   this.write(config);this.mode=null;this.render();$('keyboard-import-dialog').close();this.message('Keyboard imported.');
  }catch(error){$('keyboard-import-message').textContent=error.message;}finally{this.importBusy=false;$('choose-keyboard-file').disabled=false;$('catalog-import').value='';}
 }
 message(text){$('catalog-message').textContent=text;$('bindings-message').textContent=text;}
}
