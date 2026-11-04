import {FACES,solvedState} from './puzzle.js';
import {phaseProfile,splitRows,DETECTOR_VERSION} from './solve-phases.js';
import {PuzzleViewer,pieceGroups} from './puzzle-viewer.js';
import {formatTime} from './solve-timer.js';
const $=id=>document.getElementById(id);
const delta=value=>value===null?'—':`${value<0?'−':'+'}${formatTime(Math.abs(value))}`;
export class PhaseUI{
 constructor({getSize,getConfig,setConfig,mark}){
  Object.assign(this,{getSize,getConfig,setConfig,mark});this.rows=[];this.patternIndex=null;
  $('configure-splits').onclick=()=>this.open();$('close-splits').onclick=()=>$('splits-dialog').close();
  $('split-method').onchange=()=>{this.renderRows();};
  $('phase-add').onclick=()=>{if(this.rows.length<15){this.rows.push({name:`Phase ${this.rows.length+1}`,type:'pattern',stickers:[]});this.renderRows();}};
  $('save-splits').onclick=()=>this.save();$('mobile-split').onclick=mark;
  $('close-phase-pattern').onclick=()=>$('phase-pattern-dialog').close();$('pattern-face').onchange=()=>{this.viewer?.face(FACES[Number($('pattern-face').value)].normal);};
  $('pattern-face-all').onclick=()=>this.selectFace(true);$('pattern-face-clear').onclick=()=>this.selectFace(false);
  $('pattern-clear').onclick=()=>{this.rows[this.patternIndex].stickers=[...this.locked];this.renderPattern();};
  $('phase-pattern-dialog').addEventListener('close',()=>{this.viewer?.dispose();this.viewer=null;this.renderRows();});
 }
 open(){
  const size=this.getSize(),config=this.getConfig(),profile=phaseProfile(size,config);
  this.rows=profile.method==='custom'?structuredClone(profile.phases.filter(p=>p.type!=='finish')):[{name:'First phase',type:'pattern',stickers:[]}];
  for(const option of $('split-method').options)option.disabled=size!==3&&['bencisco','nautilus'].includes(option.value);
  $('split-method').value=profile.method;$('split-size').textContent=`${size} × ${size} FTO`;
  $('split-config-message').textContent='';this.renderRows();$('splits-dialog').showModal();
 }
 renderRows(){
  const custom=$('split-method').value==='custom';$('custom-phases').hidden=!custom;
  const list=$('phase-rows');list.replaceChildren();
  this.rows.forEach((phase,i)=>{
   const row=document.createElement('div');row.className='phase-editor-row';
   const name=document.createElement('input');name.value=phase.name;name.maxLength=40;name.setAttribute('aria-label',`Phase ${i+1} name`);name.oninput=()=>phase.name=name.value;
   const pattern=document.createElement('button');pattern.type='button';pattern.textContent=`Select pieces (${phase.stickers.length})`;pattern.onclick=()=>this.openPattern(i);
   const remove=document.createElement('button');remove.type='button';remove.textContent='✕';remove.setAttribute('aria-label',`Remove phase ${i+1}`);remove.onclick=()=>{this.rows.splice(i,1);this.renderRows();};
   row.append(name,pattern,remove);list.append(row);
  });
  $('phase-add').disabled=this.rows.length>=15;
 }
 save(){
  if($('split-method').value==='custom'&&this.rows.some(p=>p.type==='pattern'&&!p.stickers.length)){$('split-config-message').textContent='Select at least one sticker for each automatic phase.';return;}
  this.setConfig(phaseProfile(this.getSize(),{method:$('split-method').value,phases:structuredClone(this.rows)}));$('splits-dialog').close();
 }
 openPattern(index){
  this.patternIndex=index;$('pattern-face').replaceChildren();
  FACES.forEach((face,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=face.name;$('pattern-face').append(option);});
  // Earlier pieces stay selected: checkpoints add to the same solved structure.
  const previous=this.rows.slice(0,index).flatMap(p=>p.stickers);this.locked=new Set(previous);
  this.rows[index].stickers=[...new Set([...previous,...this.rows[index].stickers])];
  this.pieces=pieceGroups(this.getSize());$('phase-pattern-dialog').showModal();
  this.viewer=new PuzzleViewer($('phase-pattern-view'),{onSelect:id=>{
   const phase=this.rows[this.patternIndex],set=new Set(phase.stickers),ids=this.pieces.get(id);
   const remove=ids.every(i=>set.has(i));for(const i of ids)if(!this.locked.has(i)){if(remove)set.delete(i);else set.add(i);}
   phase.stickers=[...set];this.renderPattern();
  }});this.renderPattern();this.viewer.resize();
 }
 selectFace(select){
  const face=Number($('pattern-face').value),ids=solvedState(this.getSize()).filter(s=>s.color===face).map(s=>s.id),set=new Set(this.rows[this.patternIndex].stickers);
  for(const id of ids)if(select)set.add(id);else if(!this.locked.has(id))set.delete(id);
  this.rows[this.patternIndex].stickers=[...set];this.renderPattern();
 }
 renderPattern(){
  const set=new Set(this.rows[this.patternIndex].stickers);
  $('pattern-count').textContent=`${set.size} stickers selected · earlier checkpoints stay included`;
  this.viewer?.setPuzzle(this.getSize(),solvedState(this.getSize()),set);
 }
 render(tracker,elapsed,status){
  const enabled=tracker.enabled&&phaseProfile(this.getSize(),this.getConfig()).method!=='off';
  $('mobile-split').hidden=true;
  document.querySelector('.splits-panel').hidden=!enabled;
  $('solve-summary').setAttribute('aria-label',enabled?'Timer, splits and past times':'Timer and past times');
  document.querySelector('.time-columns').classList.toggle('without-splits',!enabled);
  $('splits-empty').hidden=enabled;$('splits-empty').textContent=status==='finished'?'No splits recorded for this solve.':'Configure phases in Settings → Splits.';$('splits-table').hidden=!enabled;
  $('split-reference').hidden=!enabled;
  const auto=['bencisco','nautilus'].includes(tracker.profile.method),legacy=auto&&tracker.detectorVersion!==DETECTOR_VERSION;
  const combinedTotal=auto&&tracker.complete&&tracker.groups.length===1&&tracker.groups[0].start===0&&tracker.groups[0].end===tracker.profile.phases.length-1;
  $('split-reference').textContent=legacy?'Recorded with an older detector; phase boundaries are unverified.':combinedTotal?'Combined total · no separate phase boundaries observed.':tracker.reference?`Best tracked run · ${formatTime(tracker.reference.ms)}`:'No comparable run yet';
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
