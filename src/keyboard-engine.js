// Physical-code bindings are independent of the character produced by the OS.
export const FACE_NAMES=['U','R','F','BR','L','B','BL','D'];
export const MODIFIERS=['Shift','Control','Alt','Meta'];
export const SUFFIX_HOLD_MS=200;
export const modifierOf=code=>/^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code)?.[1]??code;
const aliases={ctrl:'Control',control:'Control',shift:'Shift',alt:'Alt',option:'Alt',cmd:'Meta',command:'Meta',meta:'Meta',space:'Space',spacebar:'Space',esc:'Escape',escape:'Escape',enter:'Enter',return:'Enter',tab:'Tab',backspace:'Backspace',capslock:'CapsLock',delete:'Delete',del:'Delete',insert:'Insert',home:'Home',end:'End',pageup:'PageUp',pagedown:'PageDown',up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',';':'Semicolon',"'":'Quote',',':'Comma','.':'Period','/':'Slash','[':'BracketLeft',']':'BracketRight','\\':'Backslash','`':'Backquote','-':'Minus','=':'Equal'};
export function codeName(token){
 if(aliases[token.toLowerCase()])return aliases[token.toLowerCase()];
 if(/^[a-z]$/i.test(token))return `Key${token.toUpperCase()}`;
 if(/^\d$/.test(token))return `Digit${token}`;
 if(/^(Key[A-Z]|Digit\d|F(?:[1-9]|1\d|2[0-4])|Numpad(?:\d|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal)|(?:Shift|Control|Alt|Meta)(?:Left|Right)|IntlBackslash|IntlRo|IntlYen|ContextMenu|NumLock|PrintScreen|ScrollLock|Pause|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Semicolon|Quote|Comma|Period|Slash|BracketLeft|BracketRight|Backslash|Backquote|Minus|Equal)$/.test(token))return token;
 throw Error(`Unknown key “${token}”. Use a letter, key name, or physical code such as KeyF.`);
}
export function parseTrigger(text){
 if(typeof text!=='string'||!text.trim())throw Error('Enter a key, chord, or sequence.');
 const strokes=text.trim().split(/\s+/).map(part=>[...new Set(part.split('+').flatMap(token=>token==='*'?['Shift','Digit8']:[codeName(token)]))].sort());
 if(strokes.length>6||strokes.some(s=>s.length>5))throw Error('Use at most six sequence steps and five keys per chord.');
 return strokes;
}
export const triggerKey=text=>parseTrigger(text).map(s=>s.join('+')).join(' ');
export const displayCode=code=>code.replace(/^Key/,'').replace(/^Digit/,'').replace(/^Control$/,'Ctrl');
export const displayTrigger=text=>parseTrigger(text).map(s=>s.map(displayCode).join('+')).join(' ');
const intersects=(a,b)=>a.some(x=>b.includes(x)||b.includes(modifierOf(x))||b.some(y=>modifierOf(y)===x));
const held=(pressed,key)=>pressed.has(key)||[...pressed].some(code=>modifierOf(code)===key);
const strokeMatches=(stroke,pressed,code)=>intersects(stroke,[code])&&stroke.every(key=>held(pressed,key));
const compatibleKey=(a,b)=>a===b||(modifierOf(a)===modifierOf(b)&&(MODIFIERS.includes(a)||MODIFIERS.includes(b)));
const sameStroke=(a,b)=>a.length===b.length&&a.every(key=>b.some(other=>compatibleKey(key,other)));
export const validModeName=name=>typeof name==='string'&&/^\S{1,6}(?: \S{1,6})?$/u.test(name);
export function validateConfig(config,{legacyNames=false}={}){
 if(config?.suffixMode!==undefined&&!['toggle','one-shot'].includes(config.suffixMode))throw Error('Suffix behavior must be toggle or one-shot.');
 if(config?.sequenceTimeout!==undefined&&(!Number.isInteger(config.sequenceTimeout)||config.sequenceTimeout<200||config.sequenceTimeout>10000))throw Error('Sequence timeout must be 200–10000 ms.');
 if(!config||config.version!==1||!Array.isArray(config.modes)||!config.modes.length||config.modes.length>40)throw Error('A keyboard needs 1–40 modes.');
 const modeNames=config.modes.map(m=>typeof m.name==='string'?m.name.trim().toLowerCase():'');
 if(new Set(modeNames).size!==modeNames.length)throw Error('Give each mode a different name.');
 const ids=new Set(config.modes.map(m=>m.id));if(ids.size!==config.modes.length)throw Error('Mode IDs must be unique.');
 for(const mode of config.modes){
  if(typeof mode.id!=='string'||!mode.id||typeof mode.name!=='string'||!mode.name.trim()||mode.name.length>60||(!legacyNames&&!validModeName(mode.name))||!Array.isArray(mode.bindings)||mode.bindings.length>400)throw Error('Mode names need one or two words, up to 6 characters each, separated by one space.');
  const triggers=new Set(),bindingIds=new Set();
  for(const binding of mode.bindings){
   const key=triggerKey(binding.trigger);
   if(triggers.has(key))throw Error(`“${displayTrigger(binding.trigger)}” already has an action in ${mode.name}. Edit that binding instead.`);
   if(typeof binding.id!=='string'||bindingIds.has(binding.id))throw Error('Binding IDs must be unique.');
   bindingIds.add(binding.id);triggers.add(key);
   const a=binding.action;
   if(!a||!['move','rotate','depth','suffix-slice','hold-slice','hold-wide','hold-reverse','hold-mode','mode','next-mode','command'].includes(a.type))throw Error('Unknown binding action.');
   if(['move','rotate'].includes(a.type)&&(!FACE_NAMES.includes(a.face)||![1,-1].includes(a.dir)||!['default','outer','slice','wide'].includes(a.kind)||!Number.isInteger(a.depth)||a.depth<1||a.depth>20))throw Error('Move bindings need a face, direction, and depth from 1–20.');
   if(a.type==='rotate'&&a.vertex!==undefined&&typeof a.vertex!=='boolean')throw Error('Invalid rotation axis.');
   if(a.type==='depth'&&(!Number.isInteger(a.depth)||a.depth<1||a.depth>20))throw Error('Next-move depth must be 1–20.');
   if(['hold-mode','mode'].includes(a.type)&&!ids.has(a.mode))throw Error('Select an existing target mode.');
   if(a.type==='command'&&!['undo','redo','scramble','home','fit','reset','pause','cancel','reset-tps'].includes(a.command))throw Error('Unknown command.');
   if(a.type.startsWith('hold-')&&parseTrigger(binding.trigger).length!==1)throw Error('Held actions need a single key or chord, not a tap sequence.');
  }
  // A tap sequence may start with a held-action key, but never an immediate
  // move/depth/command: that would execute before the sequence is complete.
  const bindings=mode.bindings.map(b=>({...b,steps:parseTrigger(b.trigger)}));
  for(let i=0;i<bindings.length;i++)for(let j=i+1;j<bindings.length;j++){
   const a=bindings[i],b=bindings[j];if(a.steps.length===b.steps.length&&a.steps.every((s,k)=>sameStroke(s,b.steps[k])))throw Error(`“${displayTrigger(a.trigger)}” overlaps “${displayTrigger(b.trigger)}” in ${mode.name}. Use distinct physical keys or a different mode.`);
  }
  for(const a of bindings)for(const b of bindings){
   if(a===b||a.steps.length>=b.steps.length||a.action.type.startsWith('hold-'))continue;
   if(a.steps.every((s,i)=>sameStroke(s,b.steps[i])))throw Error(`“${displayTrigger(a.trigger)}” executes before “${displayTrigger(b.trigger)}”. Remove the shorter binding or use a held chord.`);
  }
 }
 return config;
}
export function defaultConfig(size=4){
 let id=0;const bindings=[],add=(trigger,action)=>bindings.push({id:`default-${++id}`,trigger,action});
 const move=(face,dir=1,kind='outer',depth=1)=>({type:'move',face,dir,kind,depth});
 const keys=[['F','U',-1],['J','U',1],['G','F',-1],['H','F',1],['E','L',-1],['D','L',1],['I','R',1],['K','R',-1],['R','B',-1],['U','B',1],['S','BL',1],['W','BL',-1],['L','BR',-1],['O','BR',1],['A','D',1],['Semicolon','D',-1]];
 for(const [key,face,dir] of keys)add(key,move(face,dir));
 for(let n=0;n<=9;n++){
  add(String(n),{type:'depth',depth:n===1?11:n||10});
  add(`Shift+${n}`,{type:'depth',depth:n?n+10:20});
 }
 add('NumpadMultiply',{type:'depth',depth:18});
 for(const [trigger,command] of [['Ctrl+Z','undo'],['Meta+Z','undo'],['Backspace','undo'],['Shift+Backspace','redo'],['Ctrl+Shift+Z','redo'],['Meta+Shift+Z','redo'],['Ctrl+Y','redo'],['Home','home'],['Escape','pause']])add(trigger,{type:'command',command});
 add('Shift',{type:'hold-slice'});
 add('Backquote',{type:'rotate',face:'U',dir:1,kind:'outer',depth:1});add('Minus',{type:'rotate',face:'U',dir:-1,kind:'outer',depth:1});
 let modes=[{id:'cif',name:'CIF',bindings}];
 if(size===3){
  add('Space',{type:'depth',depth:2});
  for(const [key,face,dir] of [['Y','R',1],['T','L',-1],['B','R',-1],['V','L',1]])add(key,move(face,dir,'wide',2));
  add('M',{type:'mode',mode:'e-center'});
 }
 add('Tab',{type:'mode',mode:'eif-r'});add('C',{type:'mode',mode:'eif-l'});
 const cycle=['F','R','BR','B','BL','L'];
  for(const [mode,name,offset] of [['eif-r','EIF-R',1],['eif-l','EIF-L',-1]]){
   const copy=structuredClone(bindings).map(b=>{b.id=`${mode}-${b.id}`;if(b.action.type==='move'&&cycle.includes(b.action.face))b.action.face=cycle[(cycle.indexOf(b.action.face)+offset+6)%6];return b;});
   copy.find(b=>b.trigger===(mode==='eif-r'?'Tab':'C')).action={type:'mode',mode:'cif'};
   modes.push({id:mode,name,bindings:copy});
  }
 if(size===3){
  const center=[['F','U',1,'outer',1],['D','U',-1,'outer',1],['J','R',-1,'slice',2],['U','R',1,'slice',2],['K','R',-1,'outer',1],['I','R',1,'outer',1]].map(([trigger,face,dir,kind,depth])=>({id:`center-${trigger}`,trigger,action:move(face,dir,kind,depth)}));
  center.push({id:'center-rot-u',trigger:'Backquote',action:{type:'rotate',face:'U',dir:1,kind:'outer',depth:1}},{id:'center-rot-ui',trigger:'Minus',action:{type:'rotate',face:'U',dir:-1,kind:'outer',depth:1}},{id:'center-slice',trigger:'Shift',action:{type:'hold-slice'}},{id:'center-pause',trigger:'Escape',action:{type:'command',command:'pause'}},{id:'center-undo',trigger:'Backspace',action:{type:'command',command:'undo'}},{id:'center-redo',trigger:'Shift+Backspace',action:{type:'command',command:'redo'}},{id:'center-exit',trigger:'M',action:{type:'mode',mode:'cif'}},{id:'center-right',trigger:'Tab',action:{type:'mode',mode:'eif-r'}},{id:'center-left',trigger:'C',action:{type:'mode',mode:'eif-l'}});modes.push({id:'e-center',name:'E– cntr',bindings:center});
 }
 for(const mode of modes)for(const [trigger,dir] of [['Q',1],['P',1],['Z',-1],['Period',-1]])mode.bindings.push({id:`right-rotation-${mode.id}-${trigger}`,trigger,action:{type:'rotate',face:'R',dir,kind:'outer',depth:1}});
 return {version:1,preset:'abid',rotationVersion:1,rightRotationVersion:1,eifVersion:1,sliceVersion:1,centerVersion:2,undoVersion:1,suffixMode:'one-shot',activeMode:'cif',defaultMode:'cif',modes,display:{show:false,layout:'ansi',numpad:false,width:900,cornerVersion:3,opacity:100,showTPS:true,window:1},sequenceTimeout:1400};
}
// Upgrade shipped bindings without replacing user-owned keys or modes.
export function upgradeKeyboardDefaults(config){
 const add=(mode,trigger,action,id)=>{
  const steps=parseTrigger(trigger);
  if(mode.bindings.some(b=>{const other=parseTrigger(b.trigger);return other.length===1&&sameStroke(other[0],steps[0]);}))return;
  mode.bindings.push({id,trigger,action});
  try{validateConfig(config);}catch{mode.bindings.pop();}
 };
 const center=config.modes.find(m=>m.id==='e-center');
 if(config.centerVersion!==2&&center){
  const old=[['F','U',-1,'outer',1],['H','U',1,'outer',1],['K','R',1,'outer',1],['D','R',-1,'outer',1],['S','R',-1,'wide',2],['L','R',1,'wide',2],['E','R',-1,'slice',2],['I','R',1,'slice',2]];
  center.bindings=center.bindings.filter(b=>!old.some(([trigger,face,dir,kind,depth])=>b.id===`center-${trigger}`&&triggerKey(b.trigger)===triggerKey(trigger)&&JSON.stringify(b.action)===JSON.stringify({type:'move',face,dir,kind,depth})));
  for(const binding of defaultConfig(3).modes.find(m=>m.id==='e-center').bindings.filter(b=>['move','mode'].includes(b.action.type))){
   if(binding.action.type==='mode'&&!config.modes.some(m=>m.id===binding.action.mode))continue;
   const trigger=binding.id==='center-left'&&config.preset==='cstimer'?'Shift+Tab':binding.trigger;
   add(center,trigger,binding.action,`upgrade-${binding.id}`);
  }
 }
 config.centerVersion=2;
 if(config.undoVersion!==1){
  for(const mode of config.modes)for(const [trigger,command] of [['Backspace','undo'],['Shift+Backspace','redo']])add(mode,trigger,{type:'command',command},`upgrade-${mode.id}-${command}`);
  config.undoVersion=1;
 }
 if(config.rightRotationVersion!==1){
  for(const mode of config.modes.filter(m=>['cif','eif-r','eif-l','e-center'].includes(m.id)&&(config.preset!=='cstimer'||m.id==='e-center'))){
   for(const [trigger,dir] of [['Q',1],['P',1],['Z',-1],['Period',-1]])add(mode,trigger,{type:'rotate',face:'R',dir,kind:'outer',depth:1},`right-rotation-${mode.id}-${trigger}`);
  }
  config.rightRotationVersion=1;
 }
 return config;
}
// Upgrade existing CIF profiles once. User-owned modes and occupied keys win.
export function upgradeEIFDefaults(config){
 if(config.eifVersion===1)return config;
 const cif=config.modes.find(m=>m.id==='cif');
 if(cif){
  const ring=['F','R','BR','B','BL','L'];
  const occupied=(mode,key)=>mode.bindings.some(b=>parseTrigger(b.trigger)[0].includes(key));
  for(const [id,name,offset,key] of [['eif-r','EIF-R',1,'Tab'],['eif-l','EIF-L',-1,'KeyC']]){
   let mode=config.modes.find(m=>m.id===id)||config.modes.find(m=>m.name.toLowerCase()===name.toLowerCase());
   if(!mode&&config.modes.length<40){
    const bindings=structuredClone(cif.bindings).map(b=>{b.id=`${id}-${b.id}`;if(b.action.type==='move'&&ring.includes(b.action.face))b.action.face=ring[(ring.indexOf(b.action.face)+offset+6)%6];return b;});
    mode={id,name,bindings};config.modes.push(mode);
    const back=mode.bindings.find(b=>triggerKey(b.trigger)===key&&b.action.type==='mode'&&b.action.mode===id);
    if(back)back.action.mode=cif.id;
    else if(!occupied(mode,key))mode.bindings.push({id:`${id}-return`,trigger:key,action:{type:'mode',mode:cif.id}});
   }
   if(mode&&!occupied(cif,key))cif.bindings.push({id:`${id}-switch`,trigger:key,action:{type:'mode',mode:mode.id}});
  }
 }
 config.eifVersion=1;return config;
}
export function actionLabel(action){
 if(action.type==='rotate')return `Rot ${action.vertex?'T':action.face}${action.dir<0?'′':''}`;
 if(action.type==='move')return `${action.kind==='slice'?action.depth:action.kind==='wide'&&action.depth>2?action.depth:''}${action.face}${action.kind==='wide'?'w':''}${action.dir<0?'′':''}`;
 return ({depth:action.depth===2?'Wide':`${action.depth}w`,'suffix-slice':'Slice next','hold-slice':'Slice','hold-wide':'Wide','hold-reverse':'Reverse','hold-mode':'Hold mode',mode:'Mode','next-mode':'Next mode',command:{undo:'Undo',redo:'Redo',scramble:'Scramble',home:'Home',fit:'Fit',reset:'Reset',pause:'Pause',cancel:'Clear','reset-tps':'Reset TPS'}[action.command]})[action.type]??'';
}
export class KeyboardEngine{
 constructor(config=defaultConfig()){
  this.configure(config);this.pressed=new Set();this.holds=[];this.sequence=[];this.pending=null;this.lastStroke=0;
 }
 configure(config){
  validateConfig(config);this.config={...structuredClone(config),suffixMode:'one-shot'};
  this.baseMode=this.config.modes.some(m=>m.id===config.activeMode)?config.activeMode:config.modes[0].id;
  this.compiled=new Map(this.config.modes.map(m=>[m.id,m.bindings.map(b=>({...b,steps:parseTrigger(b.trigger)}))]));
  this.clear();
 }
 clear({selection=true}={}){this.pressed?.clear();this.holds=[];this.suffixPresses=[];this.sequence=[];if(selection){this.pending=null;this.pendingSource=null;this.slicePending=false;this.sliceSource=null;}}
 get effectiveHolds(){return this.holds.filter(h=>h.keys.every(key=>held(this.pressed,key))&&!this.holds.some(other=>other!==h&&other.keys.length>h.keys.length&&h.keys.every(key=>other.keys.includes(key))));}
 get mode(){const id=this.effectiveHolds.filter(h=>h.action.type==='hold-mode').at(-1)?.action.mode??this.baseMode;return this.config.modes.find(m=>m.id===id)??this.config.modes[0];}
 setMode(id){if(!this.config.modes.some(m=>m.id===id))return;this.baseMode=id;this.config.activeMode=id;this.sequence=[];}
 get activeSuffixes(){return this.suffixPresses.filter(p=>p.active&&!p.superseded&&this.pressed.has(p.code));}
 activateSuffixes(now=Date.now(),chord=false){
  let changed=false;
  for(const press of this.suffixPresses)if(!press.active&&!press.superseded&&(chord||now-press.startedAt>=SUFFIX_HOLD_MS)){press.active=true;changed=true;}
  return changed;
 }
 get suffixDeadline(){return Math.min(...this.suffixPresses.filter(p=>!p.active&&!p.superseded).map(p=>p.startedAt+SUFFIX_HOLD_MS));}
 selectSuffix(action,source){
  if(action.type==='depth'){this.pending=this.pending===action.depth?null:action.depth;this.pendingSource=this.pending===null?null:source;}
  else{this.slicePending=!this.slicePending;this.sliceSource=this.slicePending?source:null;}
 }
 keyUp(code,{now=Date.now(),cancel=false}={}){
  if(!cancel)this.activateSuffixes(now);
  this.pressed.delete(code);this.holds=this.holds.filter(h=>h.keys.every(key=>held(this.pressed,key)));
  const released=this.suffixPresses.filter(p=>!this.pressed.has(p.code));
  this.suffixPresses=this.suffixPresses.filter(p=>!released.includes(p));
  let result;
  for(const press of released)if(!cancel&&!press.active&&!press.superseded){this.selectSuffix(press.action,{code:press.code,mode:press.mode});result={handled:true,action:press.action,binding:press.binding};}
  return result;
 }
 // KeyboardEvent flags are authoritative when a modifier key-up was missed.
 // Pointer-generated virtual chords omit these flags and retain their holds.
 syncModifiers(event,protectedCodes=new Set()){
  const released=[];
  for(const [modifier,flag] of [['Shift','shiftKey'],['Control','ctrlKey'],['Alt','altKey'],['Meta','metaKey']]){
   if(event[flag]===false)for(const code of [...this.pressed])if(modifierOf(code)===modifier&&code!==event.code&&!protectedCodes.has(code)){this.keyUp(code,{cancel:true});released.push(code);}
  }
  return released;
 }
 // Custom non-modifier keys can serve as modifiers, e.g. hold A, then F.
 find(code,sequence=this.sequence,pressed=this.pressed){
  const bindings=this.compiled.get(this.mode.id),candidates=[];
  for(const binding of bindings){
   const steps=binding.steps,last=steps.at(-1);
   if(!strokeMatches(last,pressed,code))continue;
   const preceding=steps.slice(0,-1);
   if(preceding.length>sequence.length||!preceding.every((s,i)=>s.join('+')===sequence[sequence.length-preceding.length+i]?.join('+')))continue;
   // Unbound OS modifiers must not accidentally invoke a bare move.
   const extras=MODIFIERS.filter(m=>held(pressed,m)&&!last.includes(m)&&!last.some(k=>modifierOf(k)===m));
   const allowed=[...this.effectiveHolds,...this.suffixPresses.filter(p=>!p.superseded)].flatMap(h=>h.keys.map(modifierOf));
   if(extras.some(m=>!allowed.includes(m)))continue;
   candidates.push(binding);
  }
  return candidates.sort((a,b)=>(b.steps.length-a.steps.length)*20+b.steps.at(-1).length-a.steps.at(-1).length)[0]??null;
 }
 prefix(code){
  const candidates=[];
  for(const binding of this.compiled.get(this.mode.id))for(let n=0;n<binding.steps.length-1;n++){
   const before=binding.steps.slice(0,n),stroke=binding.steps[n];
   if(before.length>this.sequence.length||!before.every((step,i)=>step.join('+')===this.sequence[this.sequence.length-before.length+i]?.join('+')))continue;
   if(strokeMatches(stroke,this.pressed,code))candidates.push({binding,sequence:[...before,stroke],score:(n+1)*20+stroke.length});
  }
  return candidates.sort((a,b)=>b.score-a.score)[0];
 }
 keyDown(code,{repeat=false,now=Date.now(),size=20}={}){
  this.activateSuffixes(now);
  const already=this.pressed.has(code);this.pressed.add(code);
  if(repeat||already)return {handled:!!this.find(code),repeat:true};
  if(now-this.lastStroke>(this.config.sequenceTimeout??1400))this.sequence=[];
  const binding=this.find(code),prefix=this.prefix(code);
  const score=binding?binding.steps.length*20+binding.steps.at(-1).length:0;
  this.lastStroke=now;
  if(prefix&&prefix.score>score){this.sequence=prefix.sequence;return {handled:true,prefix:prefix.binding};}
  if(!binding){this.sequence=[];return {handled:false};}
  const stroke=binding.steps.at(-1);
  const action=binding.action;
  if(action.type==='depth'&&action.depth>size){this.sequence=[];return {handled:true,unavailable:true,binding};}
  if(['depth','suffix-slice'].includes(action.type)){
   // A tap is selected on release. A hold (or a chord with a move) remains
   // active across accepted turns and never becomes a sticky suffix afterward.
   const existing=this.suffixPresses.find(p=>!p.superseded&&p.keys.every(key=>stroke.includes(key)));
   const owner=MODIFIERS.includes(modifierOf(code))&&existing?existing.code:code;
   for(const press of this.suffixPresses)if(press.keys.every(key=>stroke.includes(key)))press.superseded=true;
   this.suffixPresses.push({code:owner,keys:stroke,action,binding,mode:this.mode.id,startedAt:now,active:false});
   this.sequence=[];return {handled:true,binding,deferred:true};
  }
  if(['move','rotate'].includes(action.type))this.activateSuffixes(now,true);
  if(action.type.startsWith('hold-')){
   this.holds.push({keys:stroke,action});
   // Held actions may also be the first step of a tap sequence.
   if(prefix)this.sequence=prefix.sequence;
   return {handled:true,action,binding,prefix:prefix?.binding};
  }
  this.sequence=[];
  if(action.type==='mode')this.setMode(action.mode);
  if(action.type==='next-mode'){const i=this.config.modes.findIndex(m=>m.id===this.baseMode);this.setMode(this.config.modes[(i+1)%this.config.modes.length].id);}
  if(action.type==='command'&&action.command==='cancel'){this.pending=null;this.pendingSource=null;this.slicePending=false;this.sliceSource=null;this.sequence=[];this.suffixPresses=[];}
  return {handled:true,action,binding};
 }
 resolve(action,context){
  if(action.type==='rotate')return {face:action.face,layer:'slice',depth:1,count:context.size,dir:action.dir,label:actionLabel(action),valid:true,rotation:true,...(action.vertex?{vertex:true}:{})};
  const holds=this.effectiveHolds.map(h=>h.action.type),suffixes=this.activeSuffixes;
  const depth=suffixes.filter(p=>p.action.type==='depth').at(-1)?.action.depth??this.pending;
  let start=1,count=1,dir=action.dir;
  if(action.kind==='default'){const base=context.defaultMove??{depth:1,count:1,dir:1};start=base.depth;count=base.count;dir=base.dir*action.dir;}
  else if(action.followDirection===true)dir*=context.defaultMove?.dir??1;
  if(action.kind==='slice')start=action.depth;
  if(action.kind==='wide')count=action.depth;
  if(depth!==null){start=1;count=depth;}
  if(holds.includes('hold-wide')){start=1;count=depth??2;}
  if(this.slicePending||suffixes.some(p=>p.action.type==='suffix-slice')||holds.includes('hold-slice')){start=depth??(action.kind==='slice'?action.depth:2);count=1;}
  if(holds.includes('hold-reverse'))dir*=-1;
  const valid=start>=1&&count>=1&&start+count-1<=context.size;
  const rotation=action.type==='rotate'||(start===1&&count===context.size);
  const label=rotation?`Rot ${action.face}${dir<0?'′':''}`:`${count>1?(count>2?count:''):start>1?start:''}${action.face}${count>1?'w':''}${dir<0?'′':''}`;
  return {face:action.face,layer:'slice',depth:start,count,dir,label,valid,...(rotation?{rotation:true}:{})};
 }
 actionText(action){
  if(['mode','hold-mode'].includes(action.type))return this.config.modes.find(m=>m.id===action.mode)?.name??'';
  if(action.type==='next-mode'){const i=this.config.modes.findIndex(m=>m.id===this.baseMode);return this.config.modes[(i+1)%this.config.modes.length].name;}
  return actionLabel(action);
 }
 label(code,context){
  const pressed=this.labelPressed(code);
  const binding=this.find(code,this.sequence,pressed);
  if(binding){
   if(binding.action.type==='command'&&binding.action.command==='pause')return context.canPause?(context.manualPaused?'Resume':'Pause'):'';
   if(binding.action.type==='depth'&&binding.action.depth>context.size)return '';
   return ['move','rotate'].includes(binding.action.type)?(this.resolve(binding.action,context).valid?this.resolve(binding.action,context).label:''):binding.action.type==='depth'&&binding.action.depth===context.size?'Rot':this.actionText(binding.action);
  }
  const partial=this.compiled.get(this.mode.id).find(b=>(b.action.type!=='depth'||b.action.depth<=context.size)&&(b.steps.length>1||b.steps[0].length>1)&&b.steps[0].some(k=>k===code||k===modifierOf(code)));
  return partial?.steps.length>1?`${this.actionText(partial.action)} …`:'';
 }
 keyState(code,context){
  const pressed=this.labelPressed(code);
  const binding=this.find(code,this.sequence,pressed);
  const active=this.activeSuffixes,heldSuffix=active.find(p=>p.code===code);
  const depth=active.filter(p=>p.action.type==='depth').at(-1)?.action.depth??this.pending;
  const selectedSlice=heldSuffix?.action.type==='suffix-slice'||this.slicePending&&this.sliceSource?.code===code&&this.sliceSource.mode===this.mode.id;
  const selected=selectedSlice||heldSuffix?.action.type==='depth'||this.pending!==null&&this.pending<=context.size&&((this.pendingSource?.code===code&&this.pendingSource.mode===this.mode.id)||(binding?.action.type==='depth'&&binding.action.depth===this.pending));
  const move=binding?.action.type==='move'?this.resolve(binding.action,context):null;
  const affected=(depth!==null||this.slicePending||active.length>0)&&!!move?.valid;
  const selectedDepth=heldSuffix?.action.type==='depth'?heldSuffix.action.depth:this.pending;
  return {selected:!!selected,affected,label:selectedSlice?(heldSuffix?'Slice':'Slice next'):selected?(selectedDepth===context.size?'Rot':selectedDepth===2?'Wide':`${selectedDepth}w`):this.label(code,context)};
 }
 labelPressed(code){
  const pressed=new Set(this.pressed);
  // A suffix key still being tested as a tap must not turn Shift's "Slice"
  // legend into a shifted-number shortcut, or change the move legends yet.
  for(const press of this.suffixPresses)if(!press.active)pressed.delete(press.code);
  pressed.add(code);return pressed;
 }
 expire(now=Date.now()){
  if(this.sequence.length&&now-this.lastStroke>(this.config.sequenceTimeout??1400)){this.sequence=[];return true;}return false;
 }
 consume(){this.pending=null;this.pendingSource=null;this.slicePending=false;this.sliceSource=null;this.sequence=[];}
}
export class TurnMeter{
 constructor(){this.reset();}
 reset(){this.times=[];this.total=0;this.peak=0;}
 add(now){this.times=this.times.filter(t=>now-t<5000);this.times.push(now);this.total++;}
 sample(now,seconds=1){this.times=this.times.filter(t=>now-t<5000);const tps=this.times.filter(t=>now-t<seconds*1000).length/seconds;this.peak=Math.max(this.peak,tps);return {tps,peak:this.peak,total:this.total};}
}
