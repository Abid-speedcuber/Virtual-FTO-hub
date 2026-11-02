import * as THREE from 'three';
import {PuzzleSounds} from './sounds.js';
import {TurnPacing} from './turn-pacing.js';
import {SolveTimer,formatTime} from './solve-timer.js';
import {KeyboardUI} from './keyboard-ui.js';
import {ViewControls} from './view-controls.js';
import {bodyGeometry} from './body-geometry.js';
import {swipeMove} from './swipe.js';
import {pickSurface,pickFaceNormal} from './picking.js';
import {FACES,solvedState,selected,applyMove,inverse,isSolved,scrambleMoves} from './puzzle.js';
import {HOME_POSITION,FIXED_FRAME,frameForCamera,transformedNormal} from './orientation.js';
const $=id=>document.getElementById(id);
const storageKey='master-fto-v1';
let keyboard,initialized=false,renderedMoves=0,manualPaused=false;
const pacing=new TurnPacing();
let size=4,solves={},pointerMode='swipe',undoFloor=0;
let state=solvedState(),history=[],redo=[],queue=[],active=null,frame,scheduled=false;
let storageOK=true;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){
 const valid=m=>m&&FACES.some(f=>f.normal.every((v,i)=>v===m.normal?.[i]))&&['outer','inner','wide','ultra','slice'].includes(m.layer)&&[1,-1].includes(m.dir)&&typeof m.name==='string'&&(m.layer!=='slice'||(Number.isInteger(m.depth)&&m.depth>=1&&m.depth<=20&&Number.isInteger(m.count)&&m.count>=1&&m.count<=21-m.depth));
 if(saved.solves){
  if(!Number.isInteger(saved.size)||saved.size<2||saved.size>20)throw Error('Invalid size');
  solves=saved.solves;size=saved.size;pointerMode=saved.pointerMode==='legacy'?'legacy':'swipe';
 }else solves[4]=saved;
 for(const [key,solve] of Object.entries(solves)){
  if(!Number.isInteger(+key)||+key<2||+key>20||!Array.isArray(solve.history)||!Array.isArray(solve.redo)||!solve.history.every(valid)||!solve.redo.every(valid))throw Error('Invalid saved solve');
  if(solve.undoFloor!==undefined&&(!Number.isInteger(solve.undoFloor)||solve.undoFloor<0||solve.undoFloor>solve.history.length))throw Error('Invalid scramble boundary');
  if(solve.undoFloor===undefined){
   const timeline=[...solve.history,...solve.redo.toReversed()];
   const timed=['scrambling','ready','running','paused','finished'].includes(solve.timer?.status);
   solve.undoFloor=timed?Math.min(timeline.length,Math.max(50,Number(key)*10)):0;
   while(solve.history.length<solve.undoFloor)solve.history.push(solve.redo.pop());
  }
  if(solve.pending!==undefined&&(!Array.isArray(solve.pending)||solve.pending.length>600||!solve.pending.every(a=>a&&(['undo','redo'].includes(a.type)||(a.type==='move'&&valid(a.move)))&&(a.source===undefined||a.source==='scramble'))))throw Error('Invalid pending turns');
 }
 history=structuredClone(solves[size]?.history??[]);redo=structuredClone(solves[size]?.redo??[]);undoFloor=solves[size]?.undoFloor??0;state=history.reduce(applyMove,solvedState(size));
}}catch{storageOK=false;size=4;solves={};history=[];redo=[];state=solvedState();}
let session=new SolveTimer(solves[size]?.timer);manualPaused=solves[size]?.manualPaused===true&&session.status==='paused';
queue=structuredClone(solves[size]?.pending??[]);
if(session.status==='scrambling'&&!queue.length)session.reset();
const settingsKey='master-fto-settings-v1';
let preferences={},settingsOK=true,settingsTimer;
try{const value=JSON.parse(localStorage.getItem(settingsKey)||'{}');if(value&&typeof value==='object')preferences=value;}catch{settingsOK=false;}
for(const [id,key,fallback] of [['disable-sounds','disableSounds',false],['follow','follow',true],['animate','animate',!matchMedia('(prefers-reduced-motion: reduce)').matches],['animate-scrambling','animateScrambling',false],['show-labels','showLabels',true]]){
 $(id).checked=typeof preferences[key]==='boolean'?preferences[key]:fallback;
}
function renderSaveStatus(){ $('save-status').textContent=storageOK&&settingsOK&&keyboard?.storageOK!==false?'Saved on this device':'Local storage unavailable'; }
function saveSettings(){
 clearTimeout(settingsTimer);
 try{
  localStorage.setItem(settingsKey,JSON.stringify({disableSounds:$('disable-sounds').checked,follow:$('follow').checked,animate:$('animate').checked,animateScrambling:$('animate-scrambling').checked,showLabels:$('show-labels').checked,view:{rotation:controls.rotation.toArray(),radius:controls.radius}}));settingsOK=true;
 }catch{settingsOK=false;}
 renderSaveStatus();
}
const sounds=new PuzzleSounds(()=>$('disable-sounds').checked);
$('disable-sounds').onchange=saveSettings;
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
const displayedCamera=camera.clone();
const puzzle=new THREE.Group();scene.add(puzzle);
const materials=FACES.map(f=>new THREE.MeshBasicMaterial({color:f.color,side:THREE.DoubleSide}));
const bodyMaterial=new THREE.MeshBasicMaterial({color:'#080e11'});
const batches=[];
function build(move=null,turnGroup=null){
 for(const mesh of batches){mesh.removeFromParent();mesh.geometry.dispose();}batches.length=0;
 const body=bodyGeometry(size,move);
 for(const [part,pos] of Object.entries(body)){
  if(!pos.length)continue;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const mesh=new THREE.Mesh(geometry,bodyMaterial);(part==='turning'?turnGroup:puzzle).add(mesh);batches.push(mesh);
 }
 const positions=Array.from({length:16},()=>[]);
 for(const sticker of state){
  const points=sticker.vertices.map(v=>new THREE.Vector3(...v).multiplyScalar(2/size));
  const center=points.reduce((a,v)=>a.add(v),new THREE.Vector3()).multiplyScalar(1/3);
  const target=sticker.color+(move&&selected(sticker,move)?8:0);
  positions[target].push(...points.flatMap(p=>p.clone().sub(center).multiplyScalar(.935).add(center).toArray()));
 }
 positions.forEach((pos,i)=>{
  if(!pos.length)return;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const mesh=new THREE.Mesh(geometry,materials[i%8]);(i>=8?turnGroup:puzzle).add(mesh);batches.push(mesh);
 });
}
build();
const labels=FACES.map(f=>{const el=document.createElement('span');el.className='face-label';el.textContent=f.name;$('labels').append(el);return el;});
function currentFrame(){return $('follow').checked?frameForCamera(camera):FIXED_FRAME;}
frame=currentFrame();
function draw(){
 scheduled=false;
 if(!active)frame=currentFrame();
 const {width,height}=viewport.getBoundingClientRect();
 labels.forEach((el,i)=>{
  const n=new THREE.Vector3(...transformedNormal(FACES[i].normal,frame)).normalize();
  const position=n.clone().multiplyScalar(1.24);const visible=n.dot(camera.position.clone().sub(position))>0.5;
  const p=position.project(camera);el.hidden=!visible||p.z>1;el.style.left=`${(p.x*.5+.5)*width}px`;el.style.top=`${(-p.y*.5+.5)*height}px`;
 });
 materials.forEach((material,i)=>material.color.set(session.status==='paused'?'#888888':FACES[i].color));
 renderer.render(scene,camera);displayedCamera.copy(camera);renderedMoves=history.length;
 if(initialized&&width>0&&height>0)document.documentElement.setAttribute('data-app-ready','');
}
function requestDraw(){if(!scheduled){scheduled=true;requestAnimationFrame(draw);}}
controls.addEventListener('change',()=>{requestDraw();queueSettingsSave();});
function resizeViewport(){
 const {width,height}=viewport.getBoundingClientRect();if(!width||!height)return;
 camera.aspect=width/height;camera.fov=360/Math.PI*Math.atan(Math.tan(Math.PI/10)/Math.min(1,camera.aspect));camera.updateProjectionMatrix();renderer.setSize(width,height);requestDraw();
}
new ResizeObserver(resizeViewport).observe(viewport);
function currentSolve(){return {history,redo,undoFloor,view:{rotation:controls.rotation.toArray(),radius:controls.radius},manualPaused,timer:session.serialize(),pending:[...(active?[active.action]:[]),...queue]};}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({size,solves:{...solves,[size]:currentSolve()},pointerMode}));storageOK=true;}catch{storageOK=false;}renderSaveStatus();}
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
 $('timer-hint').textContent={idle:'Scramble to start a timed solve.',scrambling:'Preparing your scramble…',ready:'Timer starts on your first turn.',running:'',paused:manualPaused?'Press any key to resume.':'Resumes when you return.',finished:'Scramble again for another timed solve.'}[status];
 if(status!=='paused')manualPaused=false;
 $('pause').hidden=!['running','paused'].includes(status);$('pause').textContent=manualPaused?'Resume':'Pause';$('pause-message').hidden=!manualPaused;
 document.querySelector('.timer-panel').dataset.status=status;renderTimes();keyboard?.render();
}
function pauseSession(){session.pause();save();update();draw();}
function resumeSession(){if(!manualPaused&&!document.hidden&&!document.querySelector('dialog[open]')){session.resume();update();draw();}}
function toggleManualPause(){
 if(manualPaused){resumeManualPause();return;}
 if(session.status!=='running')return;
 if(active){const running=active;active=null;commitAction(running.action,running.move);running.group.removeFromParent();}
 while(queue.length){const action=queue.shift(),move=actionMove(action);if(move)commitAction(action,move);}
 build();if(session.status==='running'){manualPaused=true;keyboard?.clear({selection:true});controls.cancelAll();pauseSession();}else{save();update();draw();}
}
function resumeManualPause(){if(!manualPaused||document.querySelector('dialog[open]'))return;manualPaused=false;keyboard?.clear({selection:true});resumeSession();save();}
$('pause').onclick=toggleManualPause;
// Consume the resume key so it cannot also turn a face or select a suffix.
window.addEventListener('keydown',event=>{
 if(!manualPaused||document.querySelector('dialog[open]')||event.repeat)return;
 event.preventDefault();event.stopImmediatePropagation();resumeManualPause();
},true);
function layoutSolveSpace(){
 const width=document.documentElement.clientWidth,height=window.innerHeight,side=Math.min(width,height);
 document.documentElement.classList.toggle('shared-corner',width-side<150);
 document.querySelector('.solve-layout').classList.toggle('panel-below',width-side<280);
}
window.addEventListener('resize',layoutSolveSpace);new ResizeObserver(layoutSolveSpace).observe(document.documentElement);layoutSolveSpace();
function update(){
 renderTimer();
 const scrambling=session.status==='scrambling';$('scramble').disabled=scrambling;
 $('scramble').textContent=scrambling?'Scrambling…':'Scramble';
 const locked=['scrambling','paused'].includes(session.status);
 $('undo').disabled=locked||(history.length<=undoFloor&&!active);$('redo').disabled=locked||!redo.length;

}
function enqueue(action){
 if(queue.length>=500||['scrambling','paused'].includes(session.status))return false;
 if(action.type==='undo'&&history.length<=undoFloor&&!active)return false;if(action.type==='redo'&&!redo.length&&active?.action.type!=='undo'&&!queue.some(a=>a.type==='undo'))return false;
 pacing.input(performance.now());session.start();queue.push(action);if(action.type==='move')keyboard?.recordTurn();sounds.play();save();update();pump();return true;
}
function actionMove(action){
 if(action.type==='undo')return history.length>undoFloor?inverse(history.at(-1)):null;
 if(action.type==='redo')return redo.length?redo.at(-1):null;
 return action.move;
}
function commitAction(action,move){
 state=applyMove(state,move);
 if(action.type==='undo')redo.push(history.pop());
 else if(action.type==='redo')history.push(redo.pop());
 else{history.push(move);redo=[];}
 if(action.source==='scramble'){
  sounds.play();undoFloor=history.length;
  if(!queue.some(a=>a.source==='scramble'))session.arm();
 }else if(isSolved(state))session.finish();
}
function pump(){
 if(active||!queue.length)return;
 const action=queue.shift(),move=actionMove(action);
 if(!move){pump();update();return;}
 const group=new THREE.Group();puzzle.add(group);build(move,group);
 const running={action,move,group};active=running;update();
 const finish=(catchUp=false)=>{
  if(active!==running)return;
  commitAction(action,move);group.removeFromParent();active=null;
  if(catchUp){
   // Preserve every logical turn/undo/redo, but skip obsolete intermediate
   // visual frames. Render the exact latest state once after a burst.
   while(queue.length&&queue[0].source!=='scramble'){
    const next=queue.shift(),turn=actionMove(next);if(turn)commitAction(next,turn);
   }
  }
  if(!queue.length)build();save();update();pump();if(catchUp)draw();else requestDraw();
 };
 const animated=action.source==='scramble'?$('animate-scrambling').checked:$('animate').checked;
 if(!animated){finish();return;}
 let previous=performance.now(),progress=0;const axis=new THREE.Vector3(...move.normal).normalize();
 function tick(now){
  if(active!==running)return;
  if(action.source!=='scramble'&&queue.some(a=>a.source!=='scramble')){finish(true);return;}
  const duration=action.source==='scramble'?65:pacing.duration();
  progress=Math.min(1,progress+Math.max(0,now-previous)/duration);previous=now;
  group.quaternion.setFromAxisAngle(axis,-move.dir*2*Math.PI/3*(progress*progress*(3-2*progress)));draw();
  if(progress<1)requestAnimationFrame(tick);else finish();
 }
 requestAnimationFrame(tick);
}
async function confirmPaused(message,label){
 const dialog=$('confirm-dialog');if(dialog.open)return false;
 pauseSession();controls.cancelAll();keyboard?.clear({selection:true});
 $('confirm-message').textContent=message;$('confirm-accept').textContent=label;dialog.returnValue='cancel';dialog.dataset.pending='true';
 const result=new Promise(resolve=>dialog.addEventListener('close',()=>{delete dialog.dataset.pending;resumeSession();resolve(dialog.returnValue==='accept');},{once:true}));
 dialog.showModal();return result;
}
$('undo').onclick=()=>enqueue({type:'undo'});$('redo').onclick=()=>enqueue({type:'redo'});
$('scramble').onclick=async()=>{
 if(!await confirmPaused(`Scramble this ${size} × ${size} FTO? This replaces the current solve and starts a new timed attempt.`,'Scramble'))return;
 controls.cancelAll();keyboard?.clear({selection:true});queue=[];
 if(active){active.group.removeFromParent();active=null;}
 state=solvedState(size);history=[];redo=[];undoFloor=0;manualPaused=false;pacing.reset();session.scramble();
 let moves=scrambleMoves(Math.max(50,size*10),Math.random,size);
 while(isSolved(moves.reduce(applyMove,state)))moves=scrambleMoves(Math.max(50,size*10),Math.random,size);
 if($('animate-scrambling').checked){build();queue=moves.map(move=>({type:'move',move,source:'scramble'}));save();update();requestDraw();pump();}
 else{state=moves.reduce(applyMove,state);history=moves;undoFloor=history.length;build();session.arm();save();update();requestDraw();}
};
async function resetSolve(){
 if((history.length||active||queue.length)&&!await confirmPaused('Reset the puzzle to solved and clear this solve’s history?','Reset'))return;
 keyboard?.clear({selection:true});queue=[];const previous=active;active=null;manualPaused=false;
 if(previous)previous.group.removeFromParent();
 state=solvedState(size);history=[];redo=[];undoFloor=0;pacing.reset();session.reset();build();save();update();requestDraw();
}
$('freeplay-reset').onclick=resetSolve;
function homeView(){controls.setPosition(HOME_POSITION);requestDraw();}
$('follow').onchange=()=>{requestDraw();saveSettings();};
$('animate').onchange=saveSettings;$('animate-scrambling').onchange=saveSettings;
function renderSize(){$('size').value=String(size);keyboard?.render();}
$('size').onchange=()=>{
 // Save completed and pending turns before switching to another puzzle size.
 session.pause();solves[size]=structuredClone(currentSolve());queue=[];pacing.reset();
 if(active){active.group.removeFromParent();active=null;}
 controls.cancelAll();keyboard?.clear({selection:true});size=Number($('size').value);keyboard?.setSize(size);
 const saved=structuredClone(solves[size]??{});
 history=saved.history??[];redo=saved.redo??[];undoFloor=saved.undoFloor??0;session=new SolveTimer(saved.timer);manualPaused=saved.manualPaused===true&&session.status==='paused';queue=saved.pending??[];
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
 if(active||manualPaused)return null;
 const rect=renderer.domElement.getBoundingClientRect();
 raycaster.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),displayedCamera);
 return pickSurface(raycaster);
};
controls.addEventListener('swipe',e=>{
 if(active||manualPaused)return;
 const rect=renderer.domElement.getBoundingClientRect();
 const move=swipeMove(e.hit,e.dx,e.dy,displayedCamera,rect.width,rect.height,size);if(!move)return;
 const index=FACES.findIndex(f=>transformedNormal(f.normal,frame).every((v,i)=>v===move.normal[i]));
 if(index>=0)keyboard.pointerMove(FACES[index].name,e,{kind:'slice',depth:move.depth,dir:move.dir});
});
controls.addEventListener('tap',e=>{
 if(active||manualPaused)return;
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
window.fto={snapshot:()=>({size,pointerMode,undoFloor,manualPaused,ready:document.documentElement.hasAttribute('data-app-ready'),animationMs:pacing.duration(),renderedMoves,stickerColors:materials.map(m=>m.color.getHexString()),keyboard:keyboard?.snapshot(),timer:session.snapshot(),state:structuredClone(state),history:structuredClone(history),redo:structuredClone(redo),queued:queue.length,busy:!!active,solved:isSolved(state),frame:frame.normals.flat(),hold:{up:frame.up,front:frame.front,notation:frame.notation},camera:displayedCamera.position.toArray(),cameraUp:displayedCamera.up.toArray(),orbit:controls.rotation.toArray(),labels:labels.filter(e=>!e.hidden).map(e=>e.textContent)})};

function executeMove(move){
  const face=FACES.find(f=>f.name===move.face);
  if(move.rotation){
   if(['scrambling','paused'].includes(session.status))return false;
   const axis=new THREE.Vector3(...transformedNormal(face.normal,frame));
   if(move.vertex)axis.add(new THREE.Vector3(...transformedNormal(FACES.find(f=>f.name==='F').normal,frame)));
   axis.normalize();
   controls.rotation.multiply(new THREE.Quaternion().setFromAxisAngle(axis,-move.dir*(move.vertex?Math.PI/2:2*Math.PI/3))).normalize();controls.update();sounds.play();draw();save();return true;
  }
  const notation={'1,1':'outer','2,1':'inner','1,2':'wide','1,3':'ultra'}[`${move.depth},${move.count}`]??'slice';
  return enqueue({type:'move',move:{normal:transformedNormal(face.normal,frame),name:face.name,layer:notation,depth:move.depth,count:move.count,dir:move.dir}});
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
