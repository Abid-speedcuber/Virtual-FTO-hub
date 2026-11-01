import * as THREE from 'three';
import {ViewControls} from './view-controls.js';
import {swipeMove} from './swipe.js';
import {pickSurface,pickFaceNormal} from './picking.js';
import {FACES,solvedState,selected,applyMove,inverse,isSolved,scrambleMoves} from './puzzle.js';
import {HOME_POSITION,FIXED_FRAME,frameForCamera,transformedNormal} from './orientation.js';
const $=id=>document.getElementById(id);
const storageKey='master-fto-v1';
let size=4,solves={},pointerMode='swipe';
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
 }
 history=solves[size]?.history??[];redo=solves[size]?.redo??[];state=history.reduce(applyMove,solvedState(size));
}}catch{storageOK=false;size=4;solves={};history=[];redo=[];state=solvedState();}
const viewport=$('viewport');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.copy(HOME_POSITION);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;viewport.prepend(renderer.domElement);
renderer.domElement.setAttribute('aria-label','Interactive FTO. Drag a sticker to turn a slice; drag the background to orbit.');
const controls=new ViewControls(camera,renderer.domElement);
const displayedCamera=camera.clone();
const puzzle=new THREE.Group();scene.add(puzzle);
const materials=FACES.map(f=>new THREE.MeshBasicMaterial({color:f.color,side:THREE.DoubleSide}));
const core=new THREE.Mesh(new THREE.OctahedronGeometry(1.976),new THREE.MeshBasicMaterial({color:'#080e11'}));scene.add(core);
const batches=[];
function build(move=null,turnGroup=null){
 for(const mesh of batches){mesh.removeFromParent();mesh.geometry.dispose();}batches.length=0;
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
 b.title=`${f.name} · ${shortcuts[i]} or ${i+1} · Right-click: CCW · Shift: wide · Ctrl: slice · Ctrl+Shift: 3 layers`;
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
 renderer.render(scene,camera);displayedCamera.copy(camera);
}
function requestDraw(){if(!scheduled){scheduled=true;requestAnimationFrame(draw);}}
controls.addEventListener('change',requestDraw);
new ResizeObserver(()=>{const {width,height}=viewport.getBoundingClientRect();camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);requestDraw();}).observe(viewport);
function save(){try{localStorage.setItem(storageKey,JSON.stringify({size,solves:{...solves,[size]:{history,redo}},pointerMode}));storageOK=true;}catch{storageOK=false;}$('save-status').textContent=storageOK?'Saved on this device':'Autosave unavailable';}
function update(){
 const solved=isSolved(state);$('puzzle-status').textContent=solved?'Solved':'In progress';$('state-dot').style.background=solved?'#c7edb2':'#ffbb62';
 $('move-count').textContent=`${history.length} move${history.length===1?'':'s'}`;$('history-total').textContent=history.length;
 $('undo').disabled=!history.length&&!active;$('redo').disabled=!redo.length;
 $('queue-status').textContent=queue.length?`· ${queue.length} queued`:'';
 const h=$('history');h.replaceChildren();if(!history.length){const empty=document.createElement('span');empty.className='history-empty';empty.textContent='A fresh start. Make your first move.';h.append(empty);}
 history.slice(-100).forEach(m=>{const el=document.createElement('span');el.className='history-move';el.textContent=moveNotation(m.name,m.layer,m.dir<0,m).replace("'","′");el.title=`${m.name} ${m.layer} ${m.dir<0?'counterclockwise':'clockwise'} (notation at input)`;h.append(el);});h.scrollTop=h.scrollHeight;
}
function enqueue(action){if(queue.length>=500)return;queue.push(action);update();pump();}
function requestMove(normal,name,event={}){
 enqueue({type:'move',move:{normal:[...normal],...chosenLayer(event),dir:reverse||event.reverse?-1:1,name}});
}
function requestFace(index,event={}){
 const f=FACES[index];requestMove(transformedNormal(f.normal,frame),f.name,event);
}

function pump(){
 if(active||!queue.length)return;
 const action=queue.shift();let move=action.move;
 if(action.type==='undo'){if(!history.length){pump();update();return;}move=inverse(history.at(-1));}
 if(action.type==='redo'){if(!redo.length){pump();update();return;}move=redo.at(-1);}
 const group=new THREE.Group();puzzle.add(group);
 build(move,group);
 const running={action,move,group};active=running;update();
 const finish=()=>{
  if(active!==running)return;
  state=applyMove(state,move);
  if(action.type==='undo'){redo.push(history.pop());}else if(action.type==='redo'){history.push(redo.pop());}else{history.push(move);redo=[];}
  build();group.removeFromParent();active=null;save();update();requestDraw();pump();
 };
 const duration=$('animate').checked?(action.fast?32:145):0;
 if(!duration){finish();return;}
 const start=performance.now();const axis=new THREE.Vector3(...move.normal).normalize();
 function tick(now){if(active!==running)return;const t=Math.min(1,(now-start)/duration);group.quaternion.setFromAxisAngle(axis,-move.dir*2*Math.PI/3*(t*t*(3-2*t)));draw();if(t<1)requestAnimationFrame(tick);else finish();}
 requestAnimationFrame(tick);
}
$('undo').onclick=()=>enqueue({type:'undo'});$('redo').onclick=()=>enqueue({type:'redo'});
$('scramble').onclick=()=>{for(const move of scrambleMoves(Math.max(50,size*10),Math.random,size))queue.push({type:'move',move,fast:true});update();pump();};
$('reset').onclick=()=>{
 if((history.length||active||queue.length)&&!confirm('Reset the puzzle to solved and clear this solve’s history?'))return;
 queue=[];const previous=active;active=null;
 if(previous)previous.group.removeFromParent();
 state=solvedState(size);history=[];redo=[];build();save();update();requestDraw();
};

function homeView(){controls.setPosition(HOME_POSITION);requestDraw();}
$('home').onclick=homeView;$('fit').onclick=()=>{controls.radius=HOME_POSITION.length();controls.update();requestDraw();};
$('follow').onchange=()=>{$('frame-status').textContent=$('follow').checked?'View-relative controls':'Fixed face controls';requestDraw();};
$('animate').checked=!matchMedia('(prefers-reduced-motion: reduce)').matches;
// The selected default is independent of the temporary modifier preview.
const heldModifiers={shiftKey:false,ctrlKey:false};
function inputLayer(event={}){return event.ctrlKey?(event.shiftKey?'ultra':'inner'):(event.shiftKey?'wide':layer);}
function chosenLayer(event={}){
 const slice=Number($('slice').value);
 return slice&&!event.ctrlKey&&!event.shiftKey?{layer:'slice',depth:slice,count:1}:{layer:inputLayer(event)};
}
function moveNotation(name,depth,counterclockwise=reverse,move=chosenLayer(heldModifiers)){
 if(depth==='slice'||move.layer==='slice')return `${move.depth===1?'':move.depth}${name}${move.count>1?`w${move.count}`:''}${counterclockwise?"'":''}`;
 return `${depth==='inner'?'2':depth==='ultra'?'3':''}${name}${depth==='wide'||depth==='ultra'?'w':''}${counterclockwise?"'":''}`;
}
function renderDepth(){
 const effective=inputLayer(heldModifiers);
 for(const button of $('layers').children){
  const selected=(!Number($('slice').value)||heldModifiers.shiftKey||heldModifiers.ctrlKey)&&button.dataset.layer===effective;
  button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
 }
 for(const [i,button] of [...$('move-buttons').children].entries()){
  const notation=moveNotation(button.dataset.face,effective);
  button.querySelector('.name').textContent=notation;button.setAttribute('aria-label',notation);button.classList.toggle('long-notation',notation.length>3);
  button.title=`${notation} · ${shortcuts[i]} or ${i+1} · Right-click: ${moveNotation(button.dataset.face,effective,true)} · Shift: wide · Ctrl: slice · Ctrl+Shift: 3 layers`;
 }
}
function renderSize(){
 $('size').value=String(size);$('edition').textContent=`${size} × ${size}`;
 $('sticker-count').textContent=String(8*size*size);
 $('slice').replaceChildren(new Option('Use depth tabs','0'),...Array.from({length:size},(_,i)=>new Option(`Slice ${i+1}`,String(i+1))));
 renderDepth();
}
$('size').onchange=()=>{
 // Keep completed moves; discard an unfinished gesture/animation.
 solves[size]={history,redo};queue=[];
 if(active){active.group.removeFromParent();active=null;}
 controls.cancelAll();size=Number($('size').value);
 history=solves[size]?.history??[];redo=solves[size]?.redo??[];
 state=history.reduce(applyMove,solvedState(size));build();renderSize();save();update();requestDraw();
};
$('slice').onchange=renderDepth;
function renderPointerMode(){
 controls.mode=pointerMode;$('pointer-mode').value=pointerMode;
 document.querySelector('.orbit-hint').textContent=pointerMode==='swipe'?'Drag a sticker to turn · Drag background to orbit · Two fingers to orbit / pinch':'Drag to orbit · Hold + scroll to roll · Click a face to turn';
}
$('pointer-mode').onchange=()=>{controls.cancelAll();pointerMode=$('pointer-mode').value;renderPointerMode();save();};
renderPointerMode();renderSize();
function syncModifiers(event){
 const shiftKey=!!event.shiftKey,ctrlKey=!!event.ctrlKey;
 if(heldModifiers.shiftKey===shiftKey&&heldModifiers.ctrlKey===ctrlKey)return;
 heldModifiers.shiftKey=shiftKey;heldModifiers.ctrlKey=ctrlKey;renderDepth();
}
function clearModifiers(){syncModifiers({});}
for(const type of ['keydown','keyup','pointerdown','pointerup','pointermove'])window.addEventListener(type,syncModifiers,true);
window.addEventListener('blur',()=>{clearModifiers();controls.cancelAll();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearModifiers();controls.cancelAll();}});
$('layers').onclick=e=>{const b=e.target.closest('[data-layer]');if(!b)return;layer=b.dataset.layer;$('slice').value='0';renderDepth();};
renderDepth();
$('direction').onclick=()=>{reverse=!reverse;$('direction').textContent=reverse?'↺ Counterclockwise':'↻ Clockwise';$('direction').setAttribute('aria-pressed',String(reverse));renderDepth();};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
window.addEventListener('keydown',e=>{
 if($('help-dialog').open||e.target.matches('input:not([type=checkbox]):not([type=range]),select,textarea,[contenteditable=true]'))return;
 const key=e.key.toLowerCase();
 if((e.ctrlKey||e.metaKey)&&(key==='z'||key==='y')){
  e.preventDefault();enqueue({type:key==='y'||e.shiftKey?'redo':'undo'});return;
 }
 if(e.metaKey||e.altKey||e.repeat)return;
 const index=/^[1-8]$/.test(e.code.replace('Digit',''))?Number(e.code.slice(-1))-1:shortcuts.indexOf(key.toUpperCase());
 // Ctrl modifies face inputs; unrelated browser shortcuts keep their defaults.
 if(e.ctrlKey&&index<0)return;
 if(key==='backspace'){e.preventDefault();enqueue({type:'undo'});return;}
 if(key==='escape'){queue=[];update();return;}
 if(key==='home'){e.preventDefault();homeView();return;}

 if(index>=0){e.preventDefault();requestFace(index,e);}
});
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
window.fto={snapshot:()=>({size,pointerMode,state:structuredClone(state),history:structuredClone(history),redo:structuredClone(redo),queued:queue.length,busy:!!active,solved:isSolved(state),frame:frame.normals.flat(),hold:{up:frame.up,front:frame.front,notation:frame.notation},camera:displayedCamera.position.toArray(),cameraUp:displayedCamera.up.toArray(),orbit:controls.rotation.toArray(),labels:labels.filter(e=>!e.hidden).map(e=>e.textContent)})};
