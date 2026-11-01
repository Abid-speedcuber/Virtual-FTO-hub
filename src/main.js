import * as THREE from 'three';
import {TurnPacing} from './turn-pacing.js';
import {SolveTimer,formatTime} from './solve-timer.js';
import {KeyboardUI} from './keyboard-ui.js';
import {ViewControls} from './view-controls.js';
import {bodyGeometry} from './body-geometry.js';
import {swipeMove} from './swipe.js';
import {pickSurface,pickFaceNormal} from './picking.js';
import {FACES,solvedState,selected,applyMove,inverse,isSolved,scrambleMoves,moveRange} from './puzzle.js';
import {HOME_POSITION,FIXED_FRAME,frameForCamera,transformedNormal} from './orientation.js';
const $=id=>document.getElementById(id);
const storageKey='master-fto-v1';
let keyboard,initialized=false,renderedMoves=0;
const pacing=new TurnPacing();
let size=4,solves={},pointerMode='swipe',undoFloor=0;
let state=solvedState(),history=[],redo=[],queue=[],active=null,layer='outer',reverse=false,frame,scheduled=false;
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
let session=new SolveTimer(solves[size]?.timer);
queue=structuredClone(solves[size]?.pending??[]);
if(session.status==='scrambling'&&!queue.length)session.reset();
const settingsKey='master-fto-settings-v1';
let preferences={},settingsOK=true,settingsTimer;
try{const value=JSON.parse(localStorage.getItem(settingsKey)||'{}');if(value&&typeof value==='object')preferences=value;}catch{settingsOK=false;}
if(['outer','inner','wide','ultra'].includes(preferences.layer))layer=preferences.layer;
reverse=preferences.reverse===true;
let selectedSlice=Number.isInteger(preferences.slice)&&preferences.slice>=0&&preferences.slice<=size?preferences.slice:0;
for(const [id,key,fallback] of [['follow','follow',true],['animate','animate',!matchMedia('(prefers-reduced-motion: reduce)').matches],['animate-scrambling','animateScrambling',false],['show-move-buttons','showMoveButtons',false],['show-labels','showLabels',true]]){
 $(id).checked=typeof preferences[key]==='boolean'?preferences[key]:fallback;
}
function renderSaveStatus(){ $('save-status').textContent=storageOK&&settingsOK&&keyboard?.storageOK!==false?'Saved on this device':'Local storage unavailable'; }
function saveSettings(){
 clearTimeout(settingsTimer);
 try{
  localStorage.setItem(settingsKey,JSON.stringify({layer,slice:selectedSlice,reverse,follow:$('follow').checked,animate:$('animate').checked,animateScrambling:$('animate-scrambling').checked,showMoveButtons:$('show-move-buttons').checked,showLabels:$('show-labels').checked,view:{rotation:controls.rotation.toArray(),radius:controls.radius}}));settingsOK=true;
 }catch{settingsOK=false;}
 renderSaveStatus();
}
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
const shortcuts=['U','R','F','J','L','B','K','D'];
FACES.forEach((f,i)=>{
 const b=document.createElement('button');b.className='move-button';b.dataset.face=f.name;
 b.title=`${f.name} · Right-click: CCW · Shift: wide · Ctrl: slice · Ctrl+Shift: 3 layers`;
 b.innerHTML=`<span class="name">${f.name}</span><span class="shortcut">${shortcuts[i]} / ${i+1}</span>`;
 b.onclick=e=>requestFace(i,e);
 b.oncontextmenu=e=>{
  e.preventDefault();if(e.button!==2)return;
  requestFace(i,{ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,reverse:true});
 };
 $('move-buttons').append(b);
});
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
function currentSolve(){return {history,redo,undoFloor,view:{rotation:controls.rotation.toArray(),radius:controls.radius},input:{layer,slice:selectedSlice,reverse},timer:session.serialize(),pending:[...(active?[active.action]:[]),...queue]};}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({size,solves:{...solves,[size]:currentSolve()},pointerMode}));storageOK=true;}catch{storageOK=false;}renderSaveStatus();}
function renderTimer(){
 const status=session.status;
 $('timer-size').textContent=`${size} × ${size} FTO`;
 $('timer-status').textContent={idle:'Free play',scrambling:'Scrambling',ready:'Ready',running:'Solving',paused:'Paused',finished:'Finished'}[status];
 const text=status==='idle'?'—':formatTime(session.elapsed());if($('timer-value').textContent!==text)$('timer-value').textContent=text;
 $('timer-pb').textContent=formatTime(session.bestMs);$('timer-result').textContent=status==='finished'?(session.newBest?'New PB':`${session.completed} solved`):'';
 $('timer-hint').textContent={idle:'Scramble to start a timed solve.',scrambling:'Preparing your scramble…',ready:'Timer starts on your first turn.',running:'',paused:'Resumes when you return.',finished:'Scramble again for another timed solve.'}[status];
 document.querySelector('.timer-panel').dataset.status=status;
}
function pauseSession(){session.pause();save();renderTimer();}
function resumeSession(){if(!document.hidden){session.resume();renderTimer();}}
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
 for(const button of $('move-buttons').children)button.disabled=scrambling;
 const solved=isSolved(state);$('puzzle-status').textContent=solved?'Solved':'In progress';$('state-dot').style.background=solved?'#c7edb2':'#ffbb62';
 const playerMoves=Math.max(0,history.length-undoFloor);
 $('move-count').textContent=`${playerMoves} move${playerMoves===1?'':'s'}`;$('history-total').textContent=playerMoves;
 $('undo').disabled=scrambling||(history.length<=undoFloor&&!active);$('redo').disabled=scrambling||!redo.length;
 $('queue-status').textContent=queue.length?`· ${queue.length} queued`:'';
 const h=$('history');h.replaceChildren();if(history.length<=undoFloor){const empty=document.createElement('span');empty.className='history-empty';empty.textContent='A fresh start. Make your first move.';h.append(empty);}
 history.slice(undoFloor).slice(-100).forEach(m=>{const el=document.createElement('span');el.className='history-move';el.textContent=moveNotation(m.name,m.layer,m.dir<0,m).replace("'","′");el.title=`${m.name} ${m.layer} ${m.dir<0?'counterclockwise':'clockwise'} (notation at input)`;h.append(el);});h.scrollTop=h.scrollHeight;
}
function enqueue(action){
 if(queue.length>=500||session.status==='scrambling')return false;
 if(action.type==='undo'&&history.length<=undoFloor&&!active)return false;if(action.type==='redo'&&!redo.length&&active?.action.type!=='undo'&&!queue.some(a=>a.type==='undo'))return false;
 pacing.input(performance.now());session.start();queue.push(action);if(action.type==='move')keyboard?.recordTurn();save();update();pump();return true;
}
function requestMove(normal,name,event={}){
 enqueue({type:'move',move:{normal:[...normal],...chosenLayer(event),dir:reverse||event.reverse?-1:1,name}});
}
function requestFace(index,event={}){
 const f=FACES[index];requestMove(transformedNormal(f.normal,frame),f.name,event);
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
  undoFloor=history.length;
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
$('undo').onclick=()=>enqueue({type:'undo'});$('redo').onclick=()=>enqueue({type:'redo'});
$('scramble').onclick=()=>{
 if(!confirm(`Scramble this ${size} × ${size} FTO? This replaces the current solve and starts a new timed attempt.`))return;
 controls.cancelAll();keyboard?.clear({selection:true});queue=[];
 if(active){active.group.removeFromParent();active=null;}
 state=solvedState(size);history=[];redo=[];undoFloor=0;pacing.reset();session.scramble();
 let moves=scrambleMoves(Math.max(50,size*10),Math.random,size);
 while(isSolved(moves.reduce(applyMove,state)))moves=scrambleMoves(Math.max(50,size*10),Math.random,size);
 if($('animate-scrambling').checked){build();queue=moves.map(move=>({type:'move',move,source:'scramble'}));save();update();requestDraw();pump();}
 else{state=moves.reduce(applyMove,state);history=moves;undoFloor=history.length;build();session.arm();save();update();requestDraw();}
};
$('reset').onclick=()=>{
 if((history.length||active||queue.length)&&!confirm('Reset the puzzle to solved and clear this solve’s history?'))return;
 keyboard?.clear({selection:true});queue=[];const previous=active;active=null;
 if(previous)previous.group.removeFromParent();
 state=solvedState(size);history=[];redo=[];undoFloor=0;pacing.reset();session.reset();build();save();update();requestDraw();
};

function homeView(){controls.setPosition(HOME_POSITION);requestDraw();}
$('home').onclick=homeView;$('fit').onclick=()=>{controls.radius=HOME_POSITION.length();controls.update();requestDraw();};
$('follow').onchange=()=>{renderDisplay();saveSettings();};
$('animate').onchange=saveSettings;$('animate-scrambling').onchange=saveSettings;
// The selected default is independent of the temporary modifier preview.
const heldModifiers={shiftKey:false,ctrlKey:false};
function inputLayer(event={}){return event.ctrlKey?(event.shiftKey?'ultra':'inner'):(event.shiftKey?'wide':layer);}
function chosenLayer(event={}){
 const slice=Number($('slice').value);
 return slice&&!event.ctrlKey&&!event.shiftKey?{layer:'slice',depth:slice,count:1}:{layer:inputLayer(event)};
}
function moveNotation(name,depth,counterclockwise=reverse,move=chosenLayer(heldModifiers)){
 if(depth==='slice'||move.layer==='slice')return `${move.count>1?(move.count>2?move.count:''):move.depth>1?move.depth:''}${name}${move.count>1?'w':''}${counterclockwise?"'":''}`;
 return `${depth==='inner'?'2':depth==='ultra'?'3':''}${name}${depth==='wide'||depth==='ultra'?'w':''}${counterclockwise?"'":''}`;
}
function renderDepth(){
 keyboard?.render();
 const effective=inputLayer(heldModifiers);
 for(const button of $('layers').children){
  const selected=(!Number($('slice').value)||heldModifiers.shiftKey||heldModifiers.ctrlKey)&&button.dataset.layer===effective;
  button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
 }
 for(const [i,button] of [...$('move-buttons').children].entries()){
  const notation=moveNotation(button.dataset.face,effective);
  button.querySelector('.name').textContent=notation;button.setAttribute('aria-label',notation);button.classList.toggle('long-notation',notation.length>3);
  button.title=`${notation} · Right-click: ${moveNotation(button.dataset.face,effective,true)} · Shift: wide · Ctrl: slice · Ctrl+Shift: 3 layers`;
 }
}
function renderSize(){
 $('size').value=String(size);$('edition').textContent=`${size} × ${size}`;
 $('sticker-count').textContent=String(8*size*size);
 $('slice').replaceChildren(new Option('Use depth tabs','0'),...Array.from({length:size},(_,i)=>new Option(`Slice ${i+1}`,String(i+1))));
 selectedSlice=Math.min(size,selectedSlice);$('slice').value=String(selectedSlice);
 renderDepth();
}
$('size').onchange=()=>{
 // Save completed and pending turns before switching to another puzzle size.
 session.pause();solves[size]=structuredClone(currentSolve());queue=[];pacing.reset();
 if(active){active.group.removeFromParent();active=null;}
 controls.cancelAll();keyboard?.clear({selection:true});size=Number($('size').value);
 const saved=structuredClone(solves[size]??{});
 history=saved.history??[];redo=saved.redo??[];undoFloor=saved.undoFloor??0;session=new SolveTimer(saved.timer);queue=saved.pending??[];
 if(saved.input){layer=saved.input.layer??'outer';selectedSlice=saved.input.slice??0;reverse=saved.input.reverse===true;}
 if(saved.view?.rotation?.length===4&&saved.view.rotation.every(Number.isFinite)&&Number.isFinite(Math.hypot(...saved.view.rotation))&&Math.hypot(...saved.view.rotation)>1e-9&&Number.isFinite(saved.view.radius)){controls.rotation.fromArray(saved.view.rotation).normalize();controls.radius=THREE.MathUtils.clamp(saved.view.radius,controls.minDistance,controls.maxDistance);controls.update();}else controls.setPosition(HOME_POSITION);
 if(session.status==='scrambling'&&!queue.length)session.reset();
 state=history.reduce(applyMove,solvedState(size));frame=currentFrame();build();renderSize();renderDirection();resumeSession();save();saveSettings();update();pump();draw();
};
$('slice').onchange=()=>{selectedSlice=Number($('slice').value);renderDepth();saveSettings();};
function renderPointerMode(){
 controls.mode=pointerMode;$('pointer-mode').value=pointerMode;
 renderer.domElement.setAttribute('aria-label',pointerMode==='swipe'?'Interactive FTO. Drag a sticker to turn a slice; drag the background to orbit.':'Interactive FTO. Drag to orbit; click a face to turn.');
}
$('pointer-mode').onchange=()=>{controls.cancelAll();pointerMode=$('pointer-mode').value;renderPointerMode();save();};
renderPointerMode();renderSize();renderDirection();renderDisplay();
function syncModifiers(event){
 const shiftKey=!!event.shiftKey,ctrlKey=!!event.ctrlKey;
 if(heldModifiers.shiftKey===shiftKey&&heldModifiers.ctrlKey===ctrlKey)return;
 heldModifiers.shiftKey=shiftKey;heldModifiers.ctrlKey=ctrlKey;renderDepth();
}
function clearModifiers(){syncModifiers({});}
for(const type of ['keydown','keyup','pointerdown','pointerup','pointermove'])window.addEventListener(type,syncModifiers,true);
window.addEventListener('blur',()=>{clearModifiers();controls.cancelAll();pauseSession();});
window.addEventListener('focus',resumeSession);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearModifiers();controls.cancelAll();saveSettings();pauseSession();}else resumeSession();});
$('layers').onclick=e=>{const b=e.target.closest('[data-layer]');if(!b)return;layer=b.dataset.layer;selectedSlice=0;$('slice').value='0';renderDepth();saveSettings();};
renderDepth();
function renderDirection(){
 $('direction').textContent=reverse?'↺ Counterclockwise':'↻ Clockwise';$('direction').setAttribute('aria-pressed',String(reverse));renderDepth();
}
$('direction').onclick=()=>{reverse=!reverse;renderDirection();saveSettings();};
function renderDisplay(){
 $('solve-controls').hidden=!$('show-move-buttons').checked;$('labels').hidden=!$('show-labels').checked;
 $('frame-status').textContent=$('follow').checked?'View-relative controls':'Fixed face controls';requestDraw();
}
for(const id of ['show-move-buttons','show-labels'])$(id).onchange=()=>{renderDisplay();saveSettings();};
$('settings').onclick=()=>{controls.cancelAll();clearModifiers();$('settings-dialog').showModal();};
$('close-settings').onclick=()=>$('settings-dialog').close();
$('settings-dialog').addEventListener('close',()=>{clearModifiers();saveSettings();});
window.addEventListener('pagehide',()=>{saveSettings();pauseSession();});
window.addEventListener('pageshow',resumeSession);

$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
const raycaster=new THREE.Raycaster();
controls.pick=(x,y)=>{
 if(active)return null;
 const rect=renderer.domElement.getBoundingClientRect();
 raycaster.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),displayedCamera);
 return pickSurface(raycaster);
};
controls.addEventListener('swipe',e=>{
 if(active)return;
 const rect=renderer.domElement.getBoundingClientRect();
 const move=swipeMove(e.hit,e.dx,e.dy,displayedCamera,rect.width,rect.height,size);if(!move)return;
 const index=FACES.findIndex(f=>transformedNormal(f.normal,frame).every((v,i)=>v===move.normal[i]));
 enqueue({type:'move',move:{...move,name:index>=0?FACES[index].name:'?'}});
});
controls.addEventListener('tap',e=>{
 if(active)return;
 const rect=renderer.domElement.getBoundingClientRect();
 if(e.x<rect.left||e.x>rect.right||e.y<rect.top||e.y>rect.bottom)return;
 raycaster.setFromCamera(new THREE.Vector2((e.x-rect.left)/rect.width*2-1,-(e.y-rect.top)/rect.height*2+1),displayedCamera);
 const normal=pickFaceNormal(raycaster);if(!normal)return;
 const index=FACES.findIndex(f=>transformedNormal(f.normal,frame).every((v,i)=>v===normal[i]));
 if(index>=0)requestMove(normal,FACES[index].name,{ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,reverse:e.button===2});
});
if(!storageOK)$('save-status').textContent='Saved solve could not be loaded';
update();requestDraw();
// Read-only diagnostics for verifying geometry and input behavior in a browser.
window.fto={snapshot:()=>({size,pointerMode,undoFloor,ready:document.documentElement.hasAttribute('data-app-ready'),animationMs:pacing.duration(),renderedMoves,keyboard:keyboard?.snapshot(),timer:session.snapshot(),state:structuredClone(state),history:structuredClone(history),redo:structuredClone(redo),queued:queue.length,busy:!!active,solved:isSolved(state),frame:frame.normals.flat(),hold:{up:frame.up,front:frame.front,notation:frame.notation},camera:displayedCamera.position.toArray(),cameraUp:displayedCamera.up.toArray(),orbit:controls.rotation.toArray(),labels:labels.filter(e=>!e.hidden).map(e=>e.textContent)})};

keyboard=new KeyboardUI({
 context:()=>({size,scrambling:session.status==='scrambling',defaultMove:{...moveRange(chosenLayer({}),size),dir:reverse?-1:1}}),
 move:move=>{
  const face=FACES.find(f=>f.name===move.face);
  const notation={'1,1':'outer','2,1':'inner','1,2':'wide','1,3':'ultra'}[`${move.depth},${move.count}`]??'slice';
  return enqueue({type:'move',move:{normal:transformedNormal(face.normal,frame),name:face.name,layer:notation,depth:move.depth,count:move.count,dir:move.dir}});
 },
 command:command=>{
  if(command==='undo'||command==='redo')enqueue({type:command});
  if(command==='scramble')$('scramble').click();
  if(command==='home')homeView();
  if(command==='fit')$('fit').click();
  if(command==='reset')$('reset').click();
  if(command==='cancel'&&session.status!=='scrambling'){queue=[];save();update();}
 },
 status:renderSaveStatus,
});

initialized=true;resizeViewport();resumeSession();pump();draw();
let lastTimerSave=performance.now();
setInterval(()=>{
 if(session.status==='running'){
  renderTimer();if(performance.now()-lastTimerSave>=1000){save();lastTimerSave=performance.now();}
 }
},50);
