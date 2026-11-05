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
  for(let size=2;size<=20;size++)$('keyboard-puzzle').append(new Option(size===2?'Baby FTO (2×2)':size===4?'Master FTO (4×4)':`${size} × ${size} FTO`,String(size)));
  for(const [value,label] of BINDING_CATEGORIES)$('catalog-category').append(new Option(label,value));
  $('keyboard-puzzle').onchange=()=>{this.size=Number($('keyboard-puzzle').value);this.mode=null;this.render();};
  $('catalog-mode').onchange=()=>{this.mode=$('catalog-mode').value;this.render();};
  $('catalog-search').oninput=()=>{if($('catalog-search').value.trim()){$('catalog-category').value='all';$('catalog-subgroup').value='all';}this.renderRows();};
  $('catalog-category').oninput=()=>{$('catalog-search').value='';$('catalog-subgroup').value='all';this.renderRows();document.querySelector('.keyboard-editor-body').scrollTop=0;};
  $('catalog-subgroup').oninput=()=>{this.renderRows();document.querySelector('.keyboard-editor-body').scrollTop=0;};
  $('catalog-default-mode').onchange=()=>this.change(config=>config.defaultMode=$('catalog-default-mode').value);
  $('catalog-use-mode').onclick=()=>this.change(config=>config.activeMode=this.mode);
  $('catalog-mode-name').onchange=()=>{if(this.change(config=>config.modes.find(m=>m.id===this.mode).name=$('catalog-mode-name').value.trim()))this.showModeActions();};
  $('catalog-new-mode').onclick=()=>this.addMode(false);$('catalog-copy-mode').onclick=()=>this.addMode(true);
  $('catalog-delete-mode').onclick=()=>{if(this.change(config=>{
   const id=this.mode;config.modes=config.modes.filter(m=>m.id!==id);if(!config.modes.length)throw Error('Keep at least one mode.');
   for(const mode of config.modes)mode.bindings=mode.bindings.filter(b=>!['mode','hold-mode'].includes(b.action.type)||b.action.mode!==id);
   if(config.defaultMode===id)config.defaultMode=config.modes[0].id;if(config.activeMode===id)config.activeMode=config.modes[0].id;this.mode=config.modes[0].id;
  }))this.showModeActions();};
  $('catalog-reset-abid').onclick=()=>this.reset('abid');$('catalog-reset-cstimer').onclick=()=>this.reset('cstimer');
  $('catalog-export').onclick=()=>downloadJSON(this.config(),`fto-${this.size}-keyboard.json`);
  $('catalog-choose-import').onclick=()=>$('catalog-import').click();
  $('catalog-import').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>1024*1024)throw Error('Keyboard file is too large.');const config=JSON.parse(await file.text());validateConfig(config);config.display={...defaultConfig(this.size).display,...config.display};this.write(config);this.mode=null;this.render();this.message('Keyboard imported.');}catch(error){this.message(error.message);}finally{event.target.value='';}};
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
 change(mutator){try{const config=structuredClone(this.config());mutator(config);this.write(config);this.render();this.message('Saved');return true;}catch(error){this.message(error.message);return false;}}
 open(){this.size=this.owner.size;this.mode=this.owner.engine.baseMode;$('catalog-search').value='';$('catalog-category').value='all';$('catalog-subgroup').value='all';this.render();this.message('');}
 render(){
  const config=this.config();if(!config.modes.some(m=>m.id===this.mode))this.mode=config.activeMode??config.modes[0].id;
  $('keyboard-puzzle').value=String(this.size);
  for(const id of ['catalog-mode','catalog-default-mode']){$(id).replaceChildren(...config.modes.map(m=>new Option(m.name,m.id)));$(id).value=id==='catalog-mode'?this.mode:config.defaultMode;}
  $('catalog-mode-name').value=config.modes.find(m=>m.id===this.mode).name;$('catalog-delete-mode').disabled=config.modes.length===1;
  $('catalog-use-mode').textContent=config.activeMode===this.mode?'Active mode':'Use this mode';$('catalog-use-mode').disabled=config.activeMode===this.mode;
  this.renderRows();
 }
 renderSubgroups(config,category){
  const select=$('catalog-subgroup'),options=bindingSubgroups(category,config),signature=JSON.stringify(options);
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
 addMode(copy){if(this.change(config=>{const source=config.modes.find(m=>m.id===this.mode);let n=config.modes.length+1;while(config.modes.some(m=>m.name===`Mode ${n}`))n++;const id=uid();config.modes.push({id,name:`Mode ${n}`,bindings:copy?source.bindings.map(b=>({...structuredClone(b),id:uid()})):[]});this.mode=id;}))this.showModeActions();}
 reset(preset){const config=preset==='abid'?defaultConfig(this.size):cstimerConfig(this.size);config.display=structuredClone(this.owner.config.display);this.write(config);this.mode=null;this.render();this.message(`${preset==='abid'?"Abid’s":'csTimer'} defaults restored.`);}
 message(text){$('catalog-message').textContent=text;}
}
