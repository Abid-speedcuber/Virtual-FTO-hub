import {bindingCatalog,bindingActionKey,BINDING_CATEGORIES,bindingSubgroups,inBindingSubgroup} from './binding-catalog.js';
import {defaultConfig,validateConfig,displayTrigger,displayCode,modifierOf,triggerKey,equivalentTrigger} from './keyboard-engine.js';
import {formatBindingTrigger} from './binding-key-labels.js';
import {cstimerConfig} from './keyboard-presets.js';
import {downloadJSON} from './recording-ui.js';
const $=id=>document.getElementById(id),uid=()=>crypto.randomUUID();
const prettyTrigger=trigger=>formatBindingTrigger(trigger,navigator.userAgentData?.platform??navigator.platform??'');

const el=(tag,className,text)=>{const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=text;return item;};
export class ActionBindingsUI{
 constructor(owner){
  this.owner=owner;this.size=owner.size;this.mode=null;this.listening=false;
  for(const id of ['keyboard-puzzle','keyboard-preferences-puzzle'])for(let size=2;size<=20;size++)$(id).append(new Option(size===2?'Baby FTO (2×2)':size===4?'Master FTO (4×4)':`${size} × ${size} FTO`,String(size)));
  for(const [value,label] of BINDING_CATEGORIES)$('catalog-category').append(new Option(label,value));
  for(const id of ['keyboard-puzzle','keyboard-preferences-puzzle'])$(id).onchange=()=>{this.size=Number($(id).value);this.mode=null;this.render();};
  $('customize-bindings').onclick=()=>{this.render();$('bindings-dialog').showModal();};$('close-bindings').onclick=()=>$('bindings-dialog').close();
  this.installModeMenu();
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
 }
 renderSubgroups(config,category){
  const select=$('catalog-subgroup'),options=bindingSubgroups(category,config,this.size),signature=JSON.stringify(options);
  if(select.dataset.options!==signature){const selected=select.value;select.replaceChildren(...options.map(([value,label])=>new Option(label,value)));select.value=options.some(([value])=>value===selected)?selected:'all';select.dataset.options=signature;}
  select.disabled=options.length===1;
 }
 renderRows(){
  const config=this.config(),mode=config.modes.find(m=>m.id===this.mode)??config.modes[0],category=$('catalog-category').value,query=$('catalog-search').value.toLowerCase().trim();
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
  this.menuMode=id;const menu=$('mode-context-menu'),config=this.config();$('mode-context-delete').disabled=config.modes.length===1;$('mode-context-default').disabled=config.defaultMode===id;
  menu.hidden=false;menu.style.left=`${Math.max(8,Math.min(x,innerWidth-198))}px`;menu.style.top=`${Math.max(8,Math.min(y,innerHeight-180))}px`;
 }
 installModeMenu(){
  const menu=$('mode-context-menu'),close=()=>menu.hidden=true;
  $('catalog-mode-choice').oncontextmenu=event=>{event.preventDefault();this.openModeMenu(this.mode,event.clientX,event.clientY);};
  $('mode-context-default').onclick=()=>{if(this.change(config=>config.defaultMode=this.menuMode))this.showModeActions();close();};
  $('mode-context-duplicate').onclick=()=>{if(this.addMode(true,this.menuMode))this.showModeActions();close();};
  $('mode-context-delete').onclick=()=>{if(this.change(config=>{const id=this.menuMode;config.modes=config.modes.filter(mode=>mode.id!==id);if(!config.modes.length)throw Error('Keep at least one mode.');for(const mode of config.modes)mode.bindings=mode.bindings.filter(binding=>!['mode','hold-mode'].includes(binding.action.type)||binding.action.mode!==id);if(config.defaultMode===id)config.defaultMode=config.modes[0].id;if(config.activeMode===id)config.activeMode=config.modes[0].id;if(this.mode===id)this.mode=config.modes[0].id;}))this.showModeActions();close();};
  $('mode-context-rename').onclick=()=>{close();this.openModeName(this.menuMode);};
  $('close-mode-name').onclick=()=>$('mode-name-dialog').close();
  $('mode-name-form').onsubmit=event=>{event.preventDefault();const name=$('new-mode-name').value.trim();const saved=this.namingMode?this.change(config=>config.modes.find(mode=>mode.id===this.namingMode).name=name):this.addMode(false,this.mode,name);if(saved){$('mode-name-dialog').close();this.showModeActions();}else $('mode-name-message').textContent=this.lastError;};
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();});
  document.addEventListener('click',event=>{if(!$('catalog-mode-picker').contains(event.target))$('catalog-mode-picker').open=false;});
  $('bindings-dialog').addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();event.stopPropagation();close();}});
 }
 openModeName(id=null){this.namingMode=id;$('mode-name-title').textContent=id?'Rename mode':'New mode';$('save-mode-name').textContent=id?'Save name':'Create mode';$('new-mode-name').value=id?this.config().modes.find(mode=>mode.id===id).name:'';$('mode-name-message').textContent='';$('mode-name-dialog').showModal();$('new-mode-name').focus();}
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
