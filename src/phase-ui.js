import {namedMethod} from './split-methods.js';
import {FACES,solvedState} from './puzzle.js';
import {phaseProfile,splitRows,DETECTOR_VERSION} from './solve-phases.js';
import {PuzzleViewer,pieceGroups} from './puzzle-viewer.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
const delta=value=>value===null?'—':`${value<0?'−':'+'}${formatTime(Math.abs(value))}`;
export class PhaseUI{
 constructor({getSize,getConfig,setConfig,getMethods,setMethods,mark}){
  Object.assign(this,{getSize,getConfig,setConfig,getMethods,setMethods,mark});this.rows=[];this.patternIndex=null;
  $('configure-splits').onclick=()=>this.open();$('close-splits').onclick=()=>$('splits-dialog').close();
  $('split-method').onchange=()=>this.choose();
  for(let n=2;n<=20;n++)$('split-puzzle').append(new Option(n===2?'Baby FTO (2×2)':n===4?'Master FTO (4×4)':`${n} × ${n} FTO`,String(n)));
  $('split-puzzle').onchange=()=>{this.size=Number($('split-puzzle').value);this.loadSize();};
  $('delete-method').onclick=()=>{this.setMethods(this.getMethods(this.size).filter(m=>m.methodId!==this.editingId),this.size);this.setConfig({method:'off'},this.size);this.openList('off');};
  $('phase-add').onclick=()=>{if(this.rows.length<128){this.rows.splice(this.rows.length-1,0,{name:`Phase ${this.rows.length}`,type:'pattern',stickers:[]});this.renderRows();}};
  $('save-splits').onclick=()=>this.save();$('mobile-split').onclick=mark;
  $('close-phase-pattern').onclick=()=>$('phase-pattern-dialog').close();$('pattern-face').onchange=()=>{this.viewer?.face(FACES[Number($('pattern-face').value)].normal);};
  $('pattern-face-all').onclick=()=>this.selectFace(true);$('pattern-face-clear').onclick=()=>this.selectFace(false);
  $('pattern-clear').onclick=()=>{this.rows[this.patternIndex].stickers=[...this.locked];this.renderPattern();};
  $('phase-pattern-dialog').addEventListener('close',()=>{this.viewer?.dispose();this.viewer=null;this.renderRows();});
 }
 open(){
  this.size=this.getSize();$('split-puzzle').value=String(this.size);this.loadSize();$('splits-dialog').showModal();
 }
 loadSize(){
  const profile=phaseProfile(this.size,this.getConfig(this.size));this.openList(profile.method==='custom'?profile.methodId:profile.method);
  $('split-size').textContent=`${this.size} × ${this.size} FTO`;$('split-config-message').textContent='';
 }
 openList(selected){
  const select=$('split-method');select.replaceChildren();
  const options=[['off','Off'],...(this.size===3?[['bencisco','Bencisco'],['nautilus','Nautilus']]:[]),...this.getMethods(this.size).map(m=>[m.methodId,m.name]),['custom','Add method…']];
  for(const [value,label] of options){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
  select.value=selected;$('custom-phases').hidden=true;$('save-splits').hidden=true;
  $('delete-method').hidden=true;const method=this.getMethods(this.size).find(m=>m.methodId===selected);if(method)this.edit(method);
 }
 choose(){
  const value=$('split-method').value;
  if(value==='custom'){this.edit(null);return;}
  this.setConfig(this.getMethods(this.size).find(m=>m.methodId===value)??{method:value},this.size);this.openList(value);
  $('split-config-message').textContent=value==='off'?'Splits are off.':'Selected for new solves.';
 }
 edit(method){
  $('delete-method').hidden=!method;
  this.editingId=method?.methodId??crypto.randomUUID();$('method-name').value=method?.name??'';
  this.rows=method?structuredClone(method.phases):[{name:'First phase',type:'pattern',stickers:[]},{name:'Last layer',type:'finish'}];
  $('custom-phases').hidden=false;$('save-splits').hidden=false;this.renderRows();
 }
 renderRows(){

  const list=$('phase-rows');list.replaceChildren();
  this.rows.forEach((phase,i)=>{
   const row=document.createElement('div');row.className='phase-editor-row';
   const name=document.createElement('input');name.value=phase.name;name.maxLength=40;name.setAttribute('aria-label',`Phase ${i+1} name`);name.oninput=()=>phase.name=name.value;
   const pattern=document.createElement('button');pattern.type='button';pattern.textContent=phase.type==='finish'?'Puzzle solved':`Select pieces (${phase.stickers.length})`;pattern.disabled=phase.type==='finish';pattern.onclick=()=>this.openPattern(i);
   const remove=document.createElement('button');remove.hidden=phase.type==='finish';remove.type='button';remove.textContent='✕';remove.setAttribute('aria-label',`Remove phase ${i+1}`);remove.onclick=()=>{this.rows.splice(i,1);this.renderRows();};
   row.append(name,pattern,remove);list.append(row);
  });
  $('phase-add').disabled=this.rows.length>=128;
 }
 save(){
  if(!$('method-name').value.trim()){$('split-config-message').textContent='Give this method a name.';return;}
  if(this.rows.some(p=>p.type!=='finish'&&!p.stickers.length)){$('split-config-message').textContent='Select pieces for every checkpoint before the final phase.';return;}
  const method=namedMethod(this.size,{customVersion:2,phases:this.rows},$('method-name').value,this.editingId);
  this.setMethods([...this.getMethods(this.size).filter(m=>m.methodId!==method.methodId),method],this.size);this.setConfig(method,this.size);this.openList(method.methodId);
  $('split-config-message').textContent='Method saved and selected.';
 }
 openPattern(index){
  this.patternIndex=index;$('pattern-face').replaceChildren();
  FACES.forEach((face,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=face.name;$('pattern-face').append(option);});
  // Earlier pieces stay selected: checkpoints add to the same solved structure.
  const previous=this.rows.slice(0,index).flatMap(p=>p.stickers);this.locked=new Set(previous);
  this.rows[index].stickers=[...new Set([...previous,...this.rows[index].stickers])];
  this.pieces=pieceGroups(this.size);$('phase-pattern-dialog').showModal();
  this.viewer=new PuzzleViewer($('phase-pattern-view'),{onSelect:id=>{
   const phase=this.rows[this.patternIndex],set=new Set(phase.stickers),ids=this.pieces.get(id);
   const remove=ids.every(i=>set.has(i));for(const i of ids)if(!this.locked.has(i)){if(remove)set.delete(i);else set.add(i);}
   phase.stickers=[...set];this.renderPattern();
  }});this.renderPattern();this.viewer.resize();
 }
 selectFace(select){
  const face=Number($('pattern-face').value),ids=solvedState(this.size).filter(s=>s.color===face).map(s=>s.id),set=new Set(this.rows[this.patternIndex].stickers);
  for(const id of ids)if(select)set.add(id);else if(!this.locked.has(id))set.delete(id);
  this.rows[this.patternIndex].stickers=[...set];this.renderPattern();
 }
 renderPattern(){
  const set=new Set(this.rows[this.patternIndex].stickers);
  $('pattern-count').textContent=`${set.size} stickers selected · earlier checkpoints stay included`;
  this.viewer?.setPuzzle(this.size,solvedState(this.size),set);
 }
 render(tracker,elapsed,status,force=false){
  const enabled=tracker.enabled&&(force||phaseProfile(this.getSize(),this.getConfig()).method!=='off');
  $('mobile-split').hidden=true;
  document.querySelector('.splits-panel').hidden=!enabled;
  $('solve-summary').setAttribute('aria-label',enabled?'Timer, splits and past times':'Timer and past times');
  document.querySelector('.time-columns').classList.toggle('without-splits',!enabled);
  $('splits-empty').hidden=enabled;$('splits-empty').textContent=status==='finished'?'No splits recorded for this solve.':'Configure phases in Settings → Splits.';$('splits-table').hidden=!enabled;
  $('split-reference').hidden=!enabled;
  const auto=['bencisco','nautilus'].includes(tracker.profile.method),legacy=auto&&tracker.detectorVersion!==DETECTOR_VERSION;
  const combinedTotal=auto&&tracker.complete&&tracker.groups.length===1&&tracker.groups[0].start===0&&tracker.groups[0].end===tracker.profile.phases.length-1;
  $('split-reference').textContent=legacy?'Recorded with an older detector; phase boundaries are unverified.':combinedTotal?'Combined total · no separate phase boundaries observed.':tracker.reference?`Best tracked run · ${formatTime(tracker.reference.ms)}`:'No comparable run yet';
  $('history-split-reference').textContent=$('split-reference').textContent;
  const rows=splitRows(tracker,elapsed);
  for(const id of ['split-rows','history-split-rows']){
   const body=$(id);body.replaceChildren();
   for(const row of rows){
    const tr=document.createElement('tr');tr.dataset.kind=row.kind;
    const displayMs=row.kind==='active'&&!['running','paused'].includes(status)?null:row.ms;
    const values=[row.name,displayMs===null?'—':row.kind==='inspection'?'Skipped':formatTime(displayMs),delta(row.delta),delta(row.totalDelta)];
    values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===0&&row.kind==='combined'){td.title='Combined segment: no separate boundary was observed between these phases.';td.textContent+=' ↔';}if(i>1){const difference=i===2?row.delta:row.totalDelta;if(difference!==null)td.className=difference<0?'ahead':difference>0?'behind':'';}tr.append(td);});body.append(tr);
   }
  }
  $('history-splits').hidden=!enabled;
 }
}
