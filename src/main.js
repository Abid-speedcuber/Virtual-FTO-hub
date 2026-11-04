import * as THREE from 'three';
import {PuzzleSounds} from './sounds.js';
import {TurnPacing} from './turn-pacing.js';
import {TURN_ANIMATION_MS,parallelMoves,parallelBands,bandAngle} from './parallel-turns.js';
import {SolveTimer,formatTime} from './solve-timer.js';
import {KeyboardUI} from './keyboard-ui.js';
import {ViewControls} from './view-controls.js';
import {bodyGeometry} from './body-geometry.js';
import {swipeCandidates,chooseSwipeMove} from './swipe.js';
import {pickSurface,pickFaceNormal} from './picking.js';
import {FACES,solvedState,selected,applyMove,inverse,isSolved,scrambleMoves} from './puzzle.js';
import {HOME_POSITION,FIXED_FRAME,frameForCamera,transformedNormal,DEFAULT_LABEL_SWITCH_ANGLE} from './orientation.js';
const $=id=>document.getElementById(id);
const storageKey='master-fto-v1';
let keyboard,initialized=false,renderedMoves=0,manualPaused=false;
const pacing=new TurnPacing();
let size=3,solves={},pointerMode='swipe',undoFloor=0,solveEnd=null;
let state=solvedState(size),history=[],redo=[],queue=[],active=null,frame,scheduled=false;
function findSolveEnd(history,size,floor){
 let restored=solvedState(size);
 for(let i=0;i<history.length;i++){
  restored=applyMove(restored,history[i]);
  if(i+1>=floor&&isSolved(restored))return i+1;
 }
 return history.length;
}
let storageOK=true,solveWasStored=false,storageCleared=false;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){
 solveWasStored=true;
 const valid=m=>m&&FACES.some(f=>f.normal.every((v,i)=>v===m.normal?.[i]))&&['outer','inner','wide','ultra','slice'].includes(m.layer)&&[1,-1].includes(m.dir)&&typeof m.name==='string'&&(m.layer!=='slice'||(Number.isInteger(m.depth)&&m.depth>=1&&m.depth<=20&&Number.isInteger(m.count)&&m.count>=1&&m.count<=21-m.depth));
 if(saved.solves){
  if(!Number.isInteger(saved.size)||saved.size<2||saved.size>20)throw Error('Invalid size');
  solves=saved.solves;size=saved.size;pointerMode=saved.pointerMode==='legacy'?'legacy':'swipe';
 }else{size=4;solves[4]=saved;}
 for(const [key,solve] of Object.entries(solves)){
  if(!Number.isInteger(+key)||+key<2||+key>20||!Array.isArray(solve.history)||!Array.isArray(solve.redo)||!solve.history.every(valid)||!solve.redo.every(valid))throw Error('Invalid saved solve');
  if(solve.undoFloor!==undefined&&(!Number.isInteger(solve.undoFloor)||solve.undoFloor<0||solve.undoFloor>solve.history.length))throw Error('Invalid scramble boundary');
  if(solve.undoFloor===undefined){
   const timeline=[...solve.history,...solve.redo.toReversed()];
   const timed=['scrambling','ready','running','paused','finished'].includes(solve.timer?.status);
   solve.undoFloor=timed?Math.min(timeline.length,Math.max(50,Number(key)*10)):0;
   while(solve.history.length<solve.undoFloor)solve.history.push(solve.redo.pop());
  }
  if(solve.timer?.status==='finished'){
   // Recover the boundary in older saves, including post-solve free-play moves.
   if(!Number.isInteger(solve.solveEnd)||solve.solveEnd<0||solve.solveEnd>solve.history.length)solve.solveEnd=findSolveEnd(solve.history,+key,solve.undoFloor);
   solve.undoFloor=Math.max(solve.undoFloor,solve.solveEnd);
  }
  if(solve.pending!==undefined&&(!Array.isArray(solve.pending)||solve.pending.length>600||!solve.pending.every(a=>a&&(['undo','redo'].includes(a.type)||(a.type==='move'&&valid(a.move)))&&(a.source===undefined||['scramble','pointer'].includes(a.source)))))throw Error('Invalid pending turns');
 }
 history=structuredClone(solves[size]?.history??[]);redo=structuredClone(solves[size]?.redo??[]);undoFloor=solves[size]?.undoFloor??0;solveEnd=solves[size]?.solveEnd??null;state=history.reduce(applyMove,solvedState(size));
}}catch{storageOK=false;size=3;solves={};history=[];redo=[];state=solvedState(size);}
let session=new SolveTimer(solves[size]?.timer);manualPaused=session.status==='paused';
queue=structuredClone(solves[size]?.pending??[]);
if(session.status==='scrambling'&&!queue.length)session.reset();
const settingsKey='master-fto-settings-v1';
let preferences={},settingsOK=true,settingsTimer;
try{const value=JSON.parse(localStorage.getItem(settingsKey)||'{}');if(value&&typeof value==='object')preferences=value;}catch{settingsOK=false;}
let outerTurnBias=Number.isFinite(preferences.outerTurnBias)?THREE.MathUtils.clamp(preferences.outerTurnBias,0,100):60;
let animationSpeed=Number.isFinite(preferences.animationSpeed)?THREE.MathUtils.clamp(preferences.animationSpeed,.25,3):1;
const animationDuration=ms=>ms/animationSpeed;
function renderGestureSettings(){
 $('outer-turn-bias').value=String(outerTurnBias);$('outer-turn-bias-value').value=`${outerTurnBias}%`;
 $('animation-speed').value=String(animationSpeed);$('animation-speed-value').value=`${animationSpeed}×`;
}
renderGestureSettings();
$('outer-turn-bias').oninput=()=>{outerTurnBias=Number($('outer-turn-bias').value);renderGestureSettings();queueSettingsSave();};
$('animation-speed').oninput=()=>{animationSpeed=Number($('animation-speed').value);renderGestureSettings();queueSettingsSave();};
let faceColors=Object.fromEntries(FACES.map(face=>{
 const saved=preferences.faceColors?.[face.name];
 return [face.name,typeof saved==='string'&&/^#[0-9a-f]{6}$/i.test(saved)?saved.toLowerCase():face.color];
}));
for(const [id,key,fallback] of [['disable-sounds','disableSounds',false],['follow','follow',true],['animate','animate',true],['animate-scrambling','animateScrambling',true],['show-labels','showLabels',true],['auto-default-mode','autoDefaultMode',true]]){
 $(id).checked=typeof preferences[key]==='boolean'?preferences[key]:fallback;
}
let labelSwitchAngle=Number.isFinite(preferences.labelSwitchAngle)?THREE.MathUtils.clamp(preferences.labelSwitchAngle,0,40):DEFAULT_LABEL_SWITCH_ANGLE;
for(const id of ['label-switch-angle','label-switch-angle-value'])$(id).value=String(labelSwitchAngle);
function renderSaveStatus(){ $('save-status').textContent=storageOK&&settingsOK&&keyboard?.storageOK!==false?'Saved on this device':'Local storage unavailable'; }
function saveSettings(){
 if(detectClearedSolve())return;
 clearTimeout(settingsTimer);
 try{
  localStorage.setItem(settingsKey,JSON.stringify({outerTurnBias,animationSpeed,disableSounds:$('disable-sounds').checked,follow:$('follow').checked,labelSwitchAngle,animate:$('animate').checked,animateScrambling:$('animate-scrambling').checked,showLabels:$('show-labels').checked,autoDefaultMode:$('auto-default-mode').checked,faceColors,view:{rotation:controls.rotation.toArray(),radius:controls.radius}}));settingsOK=true;
 }catch{settingsOK=false;}
 renderSaveStatus();
}
const sounds=new PuzzleSounds(()=>$('disable-sounds').checked);
$('disable-sounds').onchange=saveSettings;$('auto-default-mode').onchange=saveSettings;
function queueSettingsSave(){clearTimeout(settingsTimer);settingsTimer=setTimeout(saveSettings,150);}
const viewport=$('viewport');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.copy(HOME_POSITION);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;viewport.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Interactive FTO. Drag a sticker to turn a slice; drag the background to orbit.');
const controls=new ViewControls(camera,renderer.domElement);
const view=solves[size]?.view??preferences.view;
if(view&&Array.isArray(view.rotation)&&view.rotation.length===4&&view.rotation.every(Number.isFinite)&&Number.isFinite(Math.hypot(...view.rotation))&&Math.hypot(...view.rotation)>1e-9&&Number.isFinite(view.radius)){
 controls.rotation.fromArray(view.rotation).normalize();controls.radius=THREE.MathUtils.clamp(view.radius,controls.minDistance,controls.maxDistance);controls.update();
}
const displayedCamera=camera.clone(),renderCamera=camera.clone();
let viewTween=null,viewFramePending=false;
const puzzle=new THREE.Group();scene.add(puzzle);
const materials=FACES.map(f=>new THREE.MeshBasicMaterial({color:faceColors[f.name],side:THREE.DoubleSide}));
const bodyMaterial=new THREE.MeshBasicMaterial({color:'#080e11'});
const batches=[],animationGroups=[];
function build(){
 for(const mesh of batches){mesh.removeFromParent();mesh.geometry.dispose();}batches.length=0;
 for(const {group} of animationGroups)group.removeFromParent();animationGroups.length=0;
 const turns=active?.turns??[],bands=parallelBands(size,turns.map(turn=>turn.move));
 const sections=bands.length?bands:[{move:null,turns:[]}];
 const groups=sections.map(band=>{
  if(!band.turns.length)return puzzle;
  const group=new THREE.Group();puzzle.add(group);animationGroups.push({group,band});return group;
 });
 sections.forEach((band,i)=>{
  const body=bodyGeometry(size,band.move),positions=band.move?body.turning:body.stationary;
  if(positions.length){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   const mesh=new THREE.Mesh(geometry,bodyMaterial);groups[i].add(mesh);batches.push(mesh);
  }
 });
 const positions=sections.map(()=>Array.from({length:8},()=>[]));
 for(const sticker of state){
  const points=sticker.vertices.map(v=>new THREE.Vector3(...v).multiplyScalar(2/size));
  const center=points.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/3);
  const section=bands.length?bands.findIndex(band=>selected(sticker,band.move)):0;
  positions[section][sticker.color].push(...points.flatMap(p=>p.clone().sub(center).multiplyScalar(.935).add(center).toArray()));
 }
 positions.forEach((colors,section)=>colors.forEach((pos,color)=>{
  if(!pos.length)return;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const mesh=new THREE.Mesh(geometry,materials[color]);groups[section].add(mesh);batches.push(mesh);
 }));
}
function renderTurns(now=performance.now()){
 if(!active)return;
 const axis=new THREE.Vector3(...active.turns[0].move.normal).normalize();
 for(const {group,band} of animationGroups)group.quaternion.setFromAxisAngle(axis,bandAngle(band,active.turns,now));
}
build();
const labels=FACES.map(f=>{const el=document.createElement('span');el.className='face-label';el.textContent=f.name;$('labels').append(el);return el;});
function currentFrame(){return $('follow').checked?frameForCamera(camera,labelSwitchAngle):FIXED_FRAME;}
frame=currentFrame();
function draw(){
 scheduled=false;
 if(!active)frame=currentFrame();
 renderCamera.copy(camera);
 if(viewTween){
  const now=performance.now(),progress=now>=viewTween.deadline?1:Math.max(0,(now-viewTween.started)/(viewTween.deadline-viewTween.started));
  const visible=viewTween.from.clone().slerp(controls.rotation,progress*progress*(3-2*progress)).invert();
  renderCamera.position.set(0,0,controls.radius).applyQuaternion(visible);renderCamera.quaternion.copy(visible);
  renderCamera.up.set(0,1,0).applyQuaternion(visible);renderCamera.updateMatrixWorld();
  if(progress===1)viewTween=null;
 }
 const {width,height}=viewport.getBoundingClientRect();
 labels.forEach((el,i)=>{
  const n=new THREE.Vector3(...transformedNormal(FACES[i].normal,frame)).normalize();
  const position=n.clone().multiplyScalar(1.24);const visible=n.dot(renderCamera.position.clone().sub(position))>0.5;
  const p=position.project(renderCamera);el.hidden=!visible||p.z>1;el.style.left=`${(p.x*.5+.5)*width}px`;el.style.top=`${(-p.y*.5+.5)*height}px`;
 });
 materials.forEach((material,i)=>material.color.set(session.status==='paused'?'#888888':faceColors[FACES[i].name]));
 renderer.render(scene,renderCamera);displayedCamera.copy(renderCamera);renderedMoves=history.length;
 if(initialized&&width>0&&height>0)document.documentElement.setAttribute('data-app-ready','');
 if(viewTween&&!viewFramePending){viewFramePending=true;requestAnimationFrame(()=>{viewFramePending=false;if(viewTween)draw();});}
}
function requestDraw(){if(!scheduled){scheduled=true;requestAnimationFrame(draw);}}
controls.addEventListener('change',()=>{requestDraw();queueSettingsSave();});
// A pointer grab takes over from the pose the user actually sees.
viewport.addEventListener('pointerdown',event=>{
 if(event.target!==renderer.domElement||!viewTween)return;viewTween=null;
 controls.rotation.copy(displayedCamera.quaternion).invert().normalize();controls.update();frame=currentFrame();
},true);
function resizeViewport(){
 const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;
 camera.aspect=width/height;camera.fov=360/Math.PI*Math.atan(Math.tan(Math.PI/10)/Math.min(1,camera.aspect));camera.updateProjectionMatrix();renderer.setSize(width,height);requestDraw();
}
new ResizeObserver(resizeViewport).observe(viewport);
function currentSolve(){return {history,redo,undoFloor,solveEnd,view:{rotation:controls.rotation.toArray(),radius:controls.radius},manualPaused,timer:session.serialize(),pending:[...(active?.turns.map(turn=>turn.action)??[]),...queue]};}
// DevTools can remove storage without notifying this document. Check before every
// write too, so an open tab cannot restore cleared times on blur or pagehide.
function detectClearedSolve(){
 if(storageCleared)return true;
 try{if(solveWasStored&&localStorage.getItem(storageKey)===null){storageCleared=true;location.reload();return true;}}catch{}
 return false;
}
window.addEventListener('storage',event=>{if(event.storageArea===localStorage&&(event.key===storageKey||event.key===null))detectClearedSolve();});
setInterval(detectClearedSolve,1000);
function save(){if(detectClearedSolve())return;try{localStorage.setItem(storageKey,JSON.stringify({size,solves:{...solves,[size]:currentSolve()},pointerMode}));storageOK=true;solveWasStored=true;}catch{storageOK=false;}renderSaveStatus();}
let timesKey='';
function renderTimes(){
 const key=`${size}:${session.times.length}:${session.completed}`;if(key===timesKey)return;timesKey=key;
 $('times-count').textContent=String(session.times.length);$('times-empty').hidden=session.times.length>0;
 const list=$('solve-times');list.replaceChildren();list.start=session.completed;
 session.times.toReversed().forEach((entry,i)=>{const item=document.createElement('li'),number=document.createElement('span'),time=document.createElement('time');number.className='solve-number';number.textContent=String(session.completed-i);time.textContent=formatTime(entry.ms);if(entry.at){time.dateTime=entry.at;time.title=new Date(entry.at).toLocaleString();}item.append(number,time);list.append(item);});list.scrollTop=0;
}
function renderTimer(){
 const status=session.status;
 $('timer-size').textContent=`${size} × ${size} FTO`;
 $('timer-status').textContent={idle:'Free play',scrambling:'Scrambling',ready:'Ready',running:'Solving',paused:'Paused',finished:'Finished'}[status];
 const text=status==='idle'?'00:00':formatTime(session.elapsed());if($('timer-value').textContent!==text)$('timer-value').textContent=text;
 $('timer-pb').textContent=formatTime(session.bestMs);$('timer-result').textContent=status==='finished'?(session.newBest?'New PB':`${session.completed} solved`):'';
 $('timer-hint').textContent={idle:'Scramble to start a timed solve.',scrambling:'Preparing your scramble…',ready:'Timer starts on your first turn.',running:'',paused:'Press any key to resume.',finished:'Scramble again for another timed solve.'}[status];
 if(status!=='paused')manualPaused=false;
 $('pause').hidden=!['running','paused'].includes(status);$('pause').textContent=manualPaused?'Resume':'Pause';$('pause-message').hidden=!manualPaused;
 document.querySelector('.timer-panel').dataset.status=status;renderTimes();keyboard?.render();
}
function pauseSession(){
 session.pause();if(session.status==='paused'){manualPaused=true;keyboard?.clear({selection:true});controls.cancelAll();}
 save();update();draw();
}
function resumeSession(){
 // Returning focus or closing a dialog only restores the paused screen.
 if(session.status==='paused')manualPaused=true;
 update();draw();
}
function toggleManualPause(){
 if(manualPaused){resumeManualPause();return;}
 if(session.status!=='running')return;
 snapActive();
 while(queue.length){const action=queue.shift(),move=actionMove(action);if(move)commitAction(action,move);}
 build();if(session.status==='running'){manualPaused=true;keyboard?.clear({selection:true});controls.cancelAll();pauseSession();}else{save();update();draw();}
}
function resumeManualPause(){if(session.status!=='paused'||document.hidden||document.querySelector('dialog[open]'))return;manualPaused=false;keyboard?.clear({selection:true});session.resume();save();update();draw();}
$('pause').onclick=toggleManualPause;
// Consume the resume key so it cannot also turn a face or select a suffix.
window.addEventListener('keydown',event=>{
 if(!manualPaused||document.querySelector('dialog[open]')||event.repeat)return;
 event.preventDefault();event.stopImmediatePropagation();resumeManualPause();
},true);
function layoutSolveSpace(){
 const width=document.documentElement.clientWidth,height=window.innerHeight-document.querySelector('.topbar').getBoundingClientRect().height,side=Math.min(width,height);
 const keyboardFits=width>=900&&width-side>=360;
 document.documentElement.classList.toggle('keyboard-unavailable',!keyboardFits);
 document.querySelector('.solve-layout').classList.toggle('panel-below',width-side<280);
}
window.addEventListener('resize',layoutSolveSpace);new ResizeObserver(layoutSolveSpace).observe(document.documentElement);layoutSolveSpace();
function update(){
 renderTimer();
 const scrambling=session.status==='scrambling';$('scramble').disabled=scrambling;
 $('scramble').textContent=scrambling?'Scrambling…':'Scramble';
 const locked=['scrambling','paused'].includes(session.status);
 $('undo').disabled=locked||!actionMove({type:'undo'},true);$('redo').disabled=locked||!actionMove({type:'redo'},true);

}
function enqueue(action){
 if(queue.length+(active?.turns.length??0)>=500||['scrambling','paused'].includes(session.status))return false;
 if(['undo','redo'].includes(action.type)&&!actionMove(action,true))return false;
 const now=performance.now();pacing.input(now);if(viewTween)viewTween.deadline=Math.min(viewTween.deadline,now+animationDuration(pacing.duration()));session.start();queue.push(action);if(action.type==='move')keyboard?.recordTurn();sounds.play();pump();return true;
}
function pendingTimeline(prune=false){
 const past=history.slice();let future=redo.slice();const valid=[];
 for(const turn of active?.turns??[]){
  if(turn.action.type==='undo'){if(past.length<=undoFloor)continue;future.push(past.pop());}
  else if(turn.action.type==='redo'){if(!future.length)continue;past.push(future.pop());}
  else{past.push(turn.move);future=[];}
  valid.push(turn);
 }
 if(prune&&active)active.turns=valid;
 return {past,future};
}
function actionMove(action,includeActive=false){
 const {past,future}=includeActive&&active?pendingTimeline():{past:history,future:redo};
 if(action.type==='undo')return past.length>undoFloor?inverse(past.at(-1)):null;
 if(action.type==='redo')return future.length?future.at(-1):null;
 return action.move;
}
function commitAction(action,move){
 if(['undo','redo'].includes(action.type)){move=actionMove(action);if(!move)return;}
 state=applyMove(state,move);
 if(action.type==='undo')redo.push(history.pop());
 else if(action.type==='redo')history.push(redo.pop());
 else{history.push(move);redo=[];}
 if(action.source==='scramble'){
  sounds.play();undoFloor=history.length;
  if(!queue.some(a=>a.source==='scramble'))session.arm();
 }else if(isSolved(state)&&session.finish()){
  solveEnd=history.length;undoFloor=solveEnd;redo=[];
  if($('auto-default-mode').checked)keyboard?.returnToDefault();
 }
}
function snapActive(){
 if(!active)return false;
 const turns=active.turns;active=null;
 for(const turn of turns)commitAction(turn.action,turn.move);
 return true;
}
function finishCompleted(now){
 let changed=false;
 while(active?.turns.length&&now-active.turns[0].started>=active.turns[0].duration){
  const turn=active.turns.shift();commitAction(turn.action,turn.move);changed=true;
  if(session.status==='finished')pendingTimeline(true);
 }
 if(active&&!active.turns.length)active=null;
 return changed;
}
let turnFramePending=false;
function scheduleTurns(){
 if(active&&!turnFramePending){turnFramePending=true;requestAnimationFrame(tickTurns);}
}
function tickTurns(now){
 turnFramePending=false;
 pump(finishCompleted(now));
 renderTurns(now);draw();scheduleTurns();
}
function pump(changed=false){
 const now=performance.now();changed=finishCompleted(now)||changed;
 while(queue.length){
  // Computer scrambling stays sequential and uses its own animation setting.
  if(active?.turns[0].action.source==='scramble')break;
  const action=queue[0];let move=actionMove(action,true);
  if(!move){queue.shift();changed=true;continue;}
  if(active&&(action.source==='scramble'||action.source==='pointer'||!parallelMoves(active.turns[0].move,move))){
   snapActive();changed=true;move=actionMove(action);
   if(!move){queue.shift();continue;}
  }
  queue.shift();
  const animated=action.source==='scramble'?$('animate-scrambling').checked:$('animate').checked;
  if(!animated){snapActive();commitAction(action,move);changed=true;continue;}
  if(!active)active={turns:[]};
  active.turns.push({action,move,started:now,duration:animationDuration(action.source==='scramble'?65:TURN_ANIMATION_MS)});changed=true;
  if(action.source==='scramble')break;
 }
 if(changed){build();renderTurns(now);save();update();requestDraw();}
 scheduleTurns();
}
async function confirmPaused(message,label,title='Replace this solve?'){
 const dialog=$('confirm-dialog');if(dialog.open)return false;
 pauseSession();controls.cancelAll();keyboard?.clear({selection:true});
 $('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-accept').textContent=label;dialog.returnValue='cancel';dialog.dataset.pending='true';
 const result=new Promise(resolve=>dialog.addEventListener('close',()=>{delete dialog.dataset.pending;resumeSession();resolve(dialog.returnValue==='accept');},{once:true}));
 dialog.showModal();return result;
}
$('undo').onclick=()=>enqueue({type:'undo'});$('redo').onclick=()=>enqueue({type:'redo'});
$('scramble').onclick=async()=>{
 const timed=['ready','running','paused'].includes(session.status);
 const title=timed?'Replace this solve?':'Start a new timed solve?';
 const message=timed?`Discard this attempt and scramble the ${size} × ${size} FTO for a new timed solve?`:`Scramble the ${size} × ${size} FTO and start a new timed solve?${history.length>(solveEnd??0)||active?' This clears the current free-play moves.':''} Saved times are kept.`;
 if(!await confirmPaused(message,'Scramble',title))return;
 viewTween=null;controls.cancelAll();keyboard?.clear({selection:true});queue=[];
 active=null;
 state=solvedState(size);history=[];redo=[];undoFloor=0;solveEnd=null;manualPaused=false;pacing.reset();session.scramble();
 let moves=scrambleMoves(Math.max(50,size*10),Math.random,size);
 while(isSolved(moves.reduce(applyMove,state)))moves=scrambleMoves(Math.max(50,size*10),Math.random,size);
 if($('animate-scrambling').checked){build();queue=moves.map(move=>({type:'move',move,source:'scramble'}));save();update();requestDraw();pump();}
 else{state=moves.reduce(applyMove,state);history=moves;undoFloor=history.length;build();session.arm();save();update();requestDraw();}
};
async function resetSolve(){
 const timed=['ready','running','paused'].includes(session.status);
 if((history.length||active||queue.length)&&!await confirmPaused(timed?'Reset the puzzle to solved and discard this attempt? Saved times are kept.':'Reset the puzzle to solved and clear free-play moves? Saved times are kept.','Reset','Reset puzzle?'))return;
 viewTween=null;keyboard?.clear({selection:true});queue=[];active=null;manualPaused=false;
 state=solvedState(size);history=[];redo=[];undoFloor=0;solveEnd=null;pacing.reset();session.reset();build();save();update();requestDraw();
}
$('freeplay-reset').onclick=resetSolve;
function homeView(){viewTween=null;controls.setPosition(HOME_POSITION);requestDraw();}
$('follow').onchange=()=>{requestDraw();saveSettings();};
for(const id of ['label-switch-angle','label-switch-angle-value'])$(id).oninput=()=>{
 const value=$(id).valueAsNumber;if(!Number.isFinite(value))return;
 labelSwitchAngle=Math.round(THREE.MathUtils.clamp(value,0,40));
 for(const control of ['label-switch-angle','label-switch-angle-value'])if(control!==id)$(control).value=String(labelSwitchAngle);
 requestDraw();queueSettingsSave();
};
for(const id of ['label-switch-angle','label-switch-angle-value'])$(id).onchange=()=>{
 for(const control of ['label-switch-angle','label-switch-angle-value'])$(control).value=String(labelSwitchAngle);
 saveSettings();
};
$('animate').onchange=()=>{if(!$('animate').checked)viewTween=null;saveSettings();requestDraw();};$('animate-scrambling').onchange=saveSettings;
function renderSize(){$('size').value=String(size);keyboard?.render();}
$('size').onchange=()=>{
 // Save completed and pending turns before switching to another puzzle size.
 session.pause();manualPaused=session.status==='paused';solves[size]=structuredClone(currentSolve());queue=[];viewTween=null;pacing.reset();
 active=null;
 controls.cancelAll();keyboard?.clear({selection:true});size=Number($('size').value);keyboard?.setSize(size);
 const saved=structuredClone(solves[size]??{});
 history=saved.history??[];redo=saved.redo??[];undoFloor=saved.undoFloor??0;solveEnd=saved.solveEnd??null;session=new SolveTimer(saved.timer);manualPaused=session.status==='paused';queue=saved.pending??[];
 if(saved.view?.rotation?.length===4&&saved.view.rotation.every(Number.isFinite)&&Number.isFinite(Math.hypot(...saved.view.rotation))&&Math.hypot(...saved.view.rotation)>1e-9&&Number.isFinite(saved.view.radius)){controls.rotation.fromArray(saved.view.rotation).normalize();controls.radius=THREE.MathUtils.clamp(saved.view.radius,controls.minDistance,controls.maxDistance);controls.update();}else controls.setPosition(HOME_POSITION);
 if(session.status==='scrambling'&&!queue.length)session.reset();
 state=history.reduce(applyMove,solvedState(size));frame=currentFrame();build();renderSize();resumeSession();save();saveSettings();update();pump();draw();
};
function renderPointerMode(){
 controls.mode=pointerMode;$('pointer-mode').value=pointerMode;
 renderer.domElement.setAttribute('aria-label',pointerMode==='swipe'?'Interactive FTO. Drag a sticker to turn a slice; drag the background to orbit.':'Interactive FTO. Drag to orbit; click a face to turn.');
}
$('pointer-mode').onchange=()=>{controls.cancelAll();pointerMode=$('pointer-mode').value;renderPointerMode();save();};
renderPointerMode();renderSize();$('labels').hidden=!$('show-labels').checked;
window.addEventListener('blur',()=>{controls.cancelAll();pauseSession();});
window.addEventListener('focus',resumeSession);
document.addEventListener('visibilitychange',()=>{if(document.hidden){controls.cancelAll();saveSettings();pauseSession();}else resumeSession();});
$('show-labels').onchange=()=>{$('labels').hidden=!$('show-labels').checked;requestDraw();saveSettings();};
$('settings').onclick=()=>{controls.cancelAll();$('settings-dialog').showModal();pauseSession();};
$('close-settings').onclick=()=>$('settings-dialog').close();
$('about').onclick=()=>{controls.cancelAll();$('about-dialog').showModal();pauseSession();};
$('close-about').onclick=()=>$('about-dialog').close();
function renderColorSwatches(){
 const grid=$('face-color-swatches');grid.replaceChildren();
 for(const face of FACES){
  const label=document.createElement('label');label.className='face-color-swatch';
  const name=document.createElement('span');name.textContent=face.name;
  const input=document.createElement('input');input.type='color';input.value=faceColors[face.name];input.id=`face-color-${face.name}`;input.setAttribute('aria-label',`${face.name} face color`);
  const value=document.createElement('span');value.className='face-color-value';value.textContent=input.value;
  const update=()=>{faceColors[face.name]=input.value;value.textContent=input.value;requestDraw();saveSettings();};
  input.addEventListener('input',update);input.addEventListener('change',update);
  label.append(name,input,value);grid.append(label);
 }
}
$('customize-colors').onclick=()=>{renderColorSwatches();$('color-scheme-dialog').showModal();pauseSession();};
$('close-color-scheme').onclick=()=>$('color-scheme-dialog').close();
$('reset-face-colors').onclick=()=>{faceColors=Object.fromEntries(FACES.map(face=>[face.name,face.color]));renderColorSwatches();requestDraw();saveSettings();};
for(const dialog of document.querySelectorAll('dialog')){
 dialog.addEventListener('close',resumeSession);
 const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 let startedOutside=false;dialog.addEventListener('pointerdown',e=>{startedOutside=e.target===dialog&&outside(e);});
 dialog.addEventListener('click',e=>{if(startedOutside&&e.target===dialog&&outside(e))dialog.close();startedOutside=false;});
}
$('settings-dialog').addEventListener('close',()=>{saveSettings();});
window.addEventListener('pagehide',()=>{saveSettings();pauseSession();});
window.addEventListener('pageshow',resumeSession);
window.addEventListener('beforeprint',pauseSession);window.addEventListener('afterprint',resumeSession);

const raycaster=new THREE.Raycaster();
controls.pick=(x,y)=>{
 if(manualPaused||session.status==='scrambling')return null;
 const rect=renderer.domElement.getBoundingClientRect();
 raycaster.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),displayedCamera);
 const hit=pickSurface(raycaster);
 if(hit)hit.candidates=swipeCandidates(hit,displayedCamera,rect.width,rect.height,size);
 return hit;
};
controls.addEventListener('swipe',e=>{
 if(manualPaused||session.status==='scrambling')return;
 const move=chooseSwipeMove(e.hit.candidates,e.dx,e.dy,outerTurnBias/100);if(!move)return;
 const index=FACES.findIndex(f=>transformedNormal(f.normal,frame).every((v,i)=>v===move.normal[i]));
 if(index>=0)keyboard.pointerMove(FACES[index].name,e,{kind:'slice',depth:move.depth,dir:move.dir});
});
controls.addEventListener('tap',e=>{
 if(manualPaused||session.status==='scrambling')return;
 const rect=renderer.domElement.getBoundingClientRect();
 if(e.x<rect.left||e.x>rect.right||e.y<rect.top||e.y>rect.bottom)return;
 raycaster.setFromCamera(new THREE.Vector2((e.x-rect.left)/rect.width*2-1,-(e.y-rect.top)/rect.height*2+1),displayedCamera);
 const normal=pickFaceNormal(raycaster);if(!normal)return;
 const index=FACES.findIndex(f=>transformedNormal(f.normal,frame).every((v,i)=>v===normal[i]));
 if(index>=0)keyboard.pointerMove(FACES[index].name,e);
});
if(!storageOK)$('save-status').textContent='Saved solve could not be loaded';
update();requestDraw();
// Read-only diagnostics for verifying geometry and input behavior in a browser.
window.fto={snapshot:()=>({size,pointerMode,undoFloor,manualPaused,ready:document.documentElement.hasAttribute('data-app-ready'),animationMs:animationDuration(TURN_ANIMATION_MS),outerTurnBias,animationSpeed,animating:active?.turns.map(turn=>({move:structuredClone(turn.move),progress:Math.min(1,Math.max(0,(performance.now()-turn.started)/turn.duration))}))??[],renderedMoves,rotating:!!viewTween,viewOrbit:displayedCamera.quaternion.clone().invert().toArray(),stickerColors:materials.map(m=>m.color.getHexString()),keyboard:keyboard?.snapshot(),timer:session.snapshot(),state:structuredClone(state),history:structuredClone(history),redo:structuredClone(redo),queued:queue.length,busy:!!active,solved:isSolved(state),frame:frame.normals.flat(),hold:{up:frame.up,front:frame.front,notation:frame.notation},camera:displayedCamera.position.toArray(),cameraUp:displayedCamera.up.toArray(),orbit:controls.rotation.toArray(),labels:labels.filter(e=>!e.hidden).map(e=>e.textContent)})};

function executeMove(move){
  const face=FACES.find(f=>f.name===move.face);
  if(move.rotation){
   if(['scrambling','paused'].includes(session.status))return false;
   const axis=new THREE.Vector3(...transformedNormal(face.normal,frame));
   if(move.vertex)axis.add(new THREE.Vector3(...transformedNormal(FACES.find(f=>f.name==='F').normal,frame)));
   axis.normalize();
   const from=displayedCamera.quaternion.clone().invert(),now=performance.now();pacing.input(now);
   // Retargeting may shorten a transition, but can never postpone its finish.
   const deadline=Math.min(viewTween?.deadline??Infinity,now+animationDuration(pacing.duration()));
   controls.rotation.multiply(new THREE.Quaternion().setFromAxisAngle(axis,-move.dir*(move.vertex?Math.PI/2:2*Math.PI/3))).normalize();
   viewTween=$('animate').checked?{from,started:now,deadline}:null;
   controls.update();frame=currentFrame();sounds.play();if(!viewTween)draw();save();return true;
  }
  const notation={'1,1':'outer','2,1':'inner','1,2':'wide','1,3':'ultra'}[`${move.depth},${move.count}`]??'slice';
  return enqueue({type:'move',source:move.source,move:{normal:transformedNormal(face.normal,frame),name:face.name,layer:notation,depth:move.depth,count:move.count,dir:move.dir}});
 }
keyboard=new KeyboardUI({
 context:()=>({size,scrambling:session.status==='scrambling',canPause:['running','paused'].includes(session.status),manualPaused,defaultMove:{depth:1,count:1,dir:1}}),
 move:executeMove,
 command:command=>{
  if(command==='undo'||command==='redo')enqueue({type:command});
  if(command==='scramble')$('scramble').click();
  if(command==='home')homeView();
  if(command==='fit'){controls.radius=HOME_POSITION.length();controls.update();requestDraw();}
  if(command==='reset')resetSolve();
  if(command==='pause')toggleManualPause();
  if(command==='resume')resumeManualPause();
  if(command==='cancel'&&session.status!=='scrambling'){queue=[];save();update();}
 },
 suffix:()=>sounds.play('suffix'),
 status:renderSaveStatus,
});

initialized=true;resizeViewport();resumeSession();pump();draw();
let lastTimerSave=performance.now();
setInterval(()=>{
 if(session.status==='running'){
  renderTimer();if(performance.now()-lastTimerSave>=1000){save();lastTimerSave=performance.now();}
 }
},50);
