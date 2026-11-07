import test from 'node:test';
import assert from 'node:assert/strict';
import {KeyboardEngine,TurnMeter,defaultConfig,validateConfig,parseTrigger,triggerKey,displayTrigger,upgradeEIFDefaults} from '../src/keyboard-engine.js';
import {keyboardLayout} from '../src/keyboard-layout.js';
const ctx={size:20,defaultMove:{depth:1,count:1,dir:1}};
const tap=(e,code)=>{const result=e.keyDown(code);e.keyUp(code);return result;};
const action=(face,dir=1)=>({type:'move',face,dir,kind:'outer',depth:1});
function config(bindings){return {version:1,activeMode:'cif',modes:[{id:'cif',name:'CIF',bindings:bindings.map((b,i)=>({id:String(i),trigger:b[0],action:b[1]}))}],display:defaultConfig().display};}
test('selected depths and held slice actions resolve 8 wide, slice 8, and 18 wide',()=>{
 const e=new KeyboardEngine(defaultConfig(3));tap(e,'Digit8');assert.equal(e.pending,8);
 let a=tap(e,'KeyF').action;assert.deepEqual(e.resolve(a,ctx),{face:'U',layer:'slice',depth:1,count:8,dir:-1,label:'8Uw′',valid:true});
 e.keyDown('ShiftLeft');a=tap(e,'KeyF').action;assert.equal(e.resolve(a,ctx).depth,8);assert.equal(e.resolve(a,ctx).count,1);
 e.keyUp('ShiftLeft');e.consume();assert.equal(e.pending,null);
 e.keyDown('ShiftLeft');tap(e,'Digit8');e.keyUp('ShiftLeft');assert.equal(e.pending,18);
 assert.equal(e.resolve(tap(e,'KeyF').action,ctx).count,18);
 assert.equal(e.resolve(action('U'),{...ctx,size:4}).valid,false);
});
test('same key has different actions in persistent and temporary modes',()=>{
 const c=config([['F',action('U',-1)],['M',{type:'next-mode'}],['Space',{type:'hold-mode',mode:'eif'}]]);
 c.modes.push({id:'eif',name:'EIF',bindings:[{id:'eif-f',trigger:'F',action:action('R')},{id:'eif-m',trigger:'M',action:{type:'next-mode'}}]});
 const e=new KeyboardEngine(c);assert.equal(tap(e,'KeyF').action.face,'U');
 tap(e,'KeyM');assert.equal(e.mode.id,'eif');assert.equal(tap(e,'KeyF').action.face,'R');
 tap(e,'KeyM');e.keyDown('Space');assert.equal(e.mode.id,'eif');assert.equal(tap(e,'KeyF').action.face,'R');e.keyUp('Space');assert.equal(e.mode.id,'cif');
});
test('manual chords and sequences dispatch one action and show resolved labels',()=>{
 const e=new KeyboardEngine(config([['A+F',action('U',-1)],['B F',action('L')],['F',action('F')]]));
 e.keyDown('KeyA');assert.equal(e.label('KeyF',ctx),'U′');assert.equal(tap(e,'KeyF').action.face,'U');e.keyUp('KeyA');
 assert.equal(tap(e,'KeyB').handled,true);assert.equal(e.label('KeyF',ctx),'L');assert.equal(tap(e,'KeyF').action.face,'L');
 assert.equal(e.label('KeyQ',ctx),'');
});
test('duplicate triggers rejected within one mode, same action and cross-mode reuse accepted',()=>{
 const c=config([['Ctrl+F',action('U')],['Control+F',action('R')]]);assert.throws(()=>validateConfig(c),/already has an action/);
 const same=config([['F',action('U')],['G',action('U')]]);assert.doesNotThrow(()=>validateConfig(same));
 same.modes.push({...same.modes[0],id:'second',name:'Second'});assert.doesNotThrow(()=>validateConfig(same));
 assert.throws(()=>validateConfig(config([['A',action('U')],['A F',action('R')]])),/executes before/);
});
test('repeat, blur/cancel and unknown OS modifiers do not create extra moves or stuck keys',()=>{
 const e=new KeyboardEngine();assert.equal(e.keyDown('KeyF').action.type,'move');assert.equal(e.keyDown('KeyF',{repeat:true}).action,undefined);e.keyUp('KeyF');
 e.keyDown('MetaLeft');assert.equal(tap(e,'KeyF').action,undefined);e.keyUp('MetaLeft');
 tap(e,'Digit8');e.keyDown('ShiftLeft');e.clear();assert.equal(e.pending,null);assert.equal(e.pressed.size,0);assert.equal(e.holds.length,0);
 const custom=defaultConfig();custom.modes[0].bindings.find(b=>b.trigger==='Escape').action.command='cancel';e.configure(custom);tap(e,'Digit8');tap(e,'Escape');assert.equal(e.pending,null);
});
test('bindings require the exact active modifier set',()=>{
 const e=new KeyboardEngine(config([['R',action('B')],['Ctrl+R',action('U')]]));
 assert.equal(tap(e,'KeyR').action.face,'B');
 e.syncModifiers({code:'KeyR',shiftKey:false,ctrlKey:true,altKey:false,metaKey:false});
 assert.equal(tap(e,'KeyR').action.face,'U');
 e.syncModifiers({code:'KeyR',shiftKey:false,ctrlKey:false,altKey:true,metaKey:false});
 assert.equal(tap(e,'KeyR').action,undefined);
});
test('logical modifier flags support desktop Ctrl and Alt remapping',()=>{
 const e=new KeyboardEngine(config([['Ctrl+Z',{type:'command',command:'undo'}]]));
 e.syncModifiers({code:'AltLeft',shiftKey:false,ctrlKey:true,altKey:false,metaKey:false});
 e.keyDown('AltLeft');
 assert.equal(e.keyDown('KeyZ').action.command,'undo');
 e.keyUp('KeyZ');e.keyUp('AltLeft');
 e.syncModifiers({code:'ControlLeft',shiftKey:false,ctrlKey:false,altKey:true,metaKey:false});
 e.keyDown('ControlLeft');
 assert.equal(e.keyDown('KeyZ').action,undefined);
});
test('tap sequence timeout does not execute stale sequences',()=>{
 const e=new KeyboardEngine(config([['A F',action('U')]]));e.keyDown('KeyA',{now:1000});e.keyUp('KeyA');assert.equal(e.keyDown('KeyF',{now:5000}).action,undefined);
});
test('physical key names and asterisk round trip through the editor',()=>{
 for(const t of ['ShiftLeft+F','ArrowUp','Numpad8','Quote','A F','Ctrl+Alt+F'])assert.equal(triggerKey(displayTrigger(t)),triggerKey(t));
 assert.equal(triggerKey('*'),triggerKey('Shift+8'));assert.throws(()=>parseTrigger('not-a-key'));
});
test('TPS counts only added turns, decays across its window, and resets',()=>{
 const meter=new TurnMeter();meter.add(100);meter.add(200);meter.add(300);
 assert.deepEqual(meter.sample(500),{tps:3,peak:3,total:3});assert.equal(meter.sample(1500).tps,0);assert.equal(meter.sample(1500,3).tps,1);meter.reset();assert.deepEqual(meter.sample(2000),{tps:0,peak:0,total:0});
});
test('ANSI, ISO, navigation and numpad retain physical footprints without duplicate keys',()=>{
 for(const layout of ['ansi','iso'])for(const numpad of [false,true]){
  const geometry=keyboardLayout({layout,numpad});assert.equal(new Set(geometry.keys.map(k=>k.code)).size,geometry.keys.length);
  const key=c=>geometry.keys.find(k=>k.code===c);assert.ok(key('Space').w>6);assert.ok(key('Backspace').w>1.8);assert.ok(key('Tab').x<key('KeyQ').x);
  assert.equal(!!key('IntlBackslash'),layout==='iso');assert.equal(key('Enter').h>1,layout==='iso');
  if(numpad){assert.ok(key('NumpadEnter').h>1);assert.ok(key('Numpad0').w>1.8);}
 }
});

test('generic modifier conflicts are detected while distinct left/right bindings remain legal',()=>{
 assert.throws(()=>validateConfig(config([['Shift+F',action('U')],['ShiftLeft+F',action('R')]])),/overlaps/);
 assert.doesNotThrow(()=>validateConfig(config([['ShiftLeft+F',action('U')],['ShiftRight+F',action('R')]])));
});
test('a held mode chord suppresses smaller modifier actions and restores them on release',()=>{
 const c=config([['Ctrl',{type:'hold-wide'}],['Ctrl+Alt',{type:'hold-mode',mode:'eif'}],['F',action('U')]]);
 c.modes.push({id:'eif',name:'EIF',bindings:[{id:'f',trigger:'F',action:action('R')}]});
 const e=new KeyboardEngine(c);e.keyDown('ControlLeft');e.keyDown('AltLeft');
 assert.equal(e.mode.id,'eif');assert.equal(e.resolve(tap(e,'KeyF').action,ctx).count,1);
 e.keyUp('AltLeft');assert.equal(e.mode.id,'cif');assert.equal(e.resolve(tap(e,'KeyF').action,ctx).count,2);
});
test('tap sequences expire for the live overlay and configured reverse moves can follow the toggle',()=>{
 const e=new KeyboardEngine(config([['A F',action('R')]]));e.keyDown('KeyA',{now:1000});assert.equal(e.expire(3000),true);assert.equal(e.sequence.length,0);
 assert.equal(e.resolve({...action('U',-1),followDirection:true},{...ctx,defaultMove:{depth:1,count:1,dir:-1}}).dir,1);
});

test('a specific sequence prefix beats a bare key modified by a held action',()=>{
 const c=config([['Ctrl',{type:'hold-wide'}],['K',action('BL')],['F',action('F')],['Ctrl+K F',action('U',-1)]]);
 const e=new KeyboardEngine(c);e.keyDown('ControlLeft');const prefix=e.keyDown('KeyK');assert.equal(prefix.action,undefined);assert.equal(prefix.handled,true);e.keyUp('KeyK');e.keyUp('ControlLeft');
 assert.equal(e.label('KeyF',ctx),'U′');assert.equal(tap(e,'KeyF').action.face,'U');
});
test('a held action can also lead a tapped sequence without producing a turn',()=>{
 const e=new KeyboardEngine(config([['Ctrl',{type:'hold-wide'}],['F',action('F')],['Ctrl F',action('R')]]));
 tap(e,'ControlLeft');assert.equal(tap(e,'KeyF').action.face,'R');
});

test('modifier flags repair a missed release before the next move, without delaying depth input',()=>{
 const e=new KeyboardEngine();e.keyDown('ShiftLeft');tap(e,'Digit8');assert.equal(e.pending,18);
 assert.deepEqual(e.syncModifiers({code:'KeyF',shiftKey:false,ctrlKey:false,altKey:false,metaKey:false}),['ShiftLeft']);
 const move=e.resolve(e.keyDown('KeyF').action,ctx);assert.equal(move.depth,1);assert.equal(move.count,18);assert.equal(e.effectiveHolds.length,0);
});
test('modifier synchronization preserves other held sides and virtual-pointer chords',()=>{
 const e=new KeyboardEngine(defaultConfig(3));e.keyDown('ShiftLeft');e.keyDown('ShiftRight');e.keyUp('ShiftLeft');e.syncModifiers({code:'ShiftLeft',shiftKey:true});
 assert.ok(e.pressed.has('ShiftRight'));assert.equal(e.resolve(tap(e,'KeyF').action,ctx).depth,2);
 e.syncModifiers({code:'KeyF',shiftKey:false},new Set(['ShiftRight']));assert.ok(e.pressed.has('ShiftRight'));
 e.syncModifiers({code:'KeyF',shiftKey:false});assert.equal(e.resolve(tap(e,'KeyF').action,ctx).depth,1);
});

test('suffix waits through unbound input, then clears on one accepted turn',()=>{
 const e=new KeyboardEngine();tap(e,'Digit6');tap(e,'KeyQ');assert.equal(e.pending,6);assert.ok(e.keyState('Digit6',ctx).selected);assert.ok(e.keyState('KeyF',ctx).affected);
 e.consume();assert.equal(e.pending,null);assert.equal(e.keyState('Digit6',ctx).selected,false);tap(e,'Digit7');tap(e,'Digit7');assert.equal(e.pending,null);assert.equal(e.keyState('KeyF',ctx).affected,false);
});
test('selected shifted suffix keeps its label and glow after releasing Shift',()=>{
 const e=new KeyboardEngine();e.keyDown('ShiftLeft');tap(e,'Digit8');e.keyUp('ShiftLeft');
 assert.deepEqual(e.keyState('Digit8',ctx),{selected:true,affected:false,label:'18w'});assert.equal(e.keyState('KeyF',ctx).label,'18Uw′');
 e.keyDown('ShiftLeft');tap(e,'Digit8');e.keyUp('ShiftLeft');assert.equal(e.pending,null);
});
test('out-of-range suffix bindings are blank and do not select or replace a valid depth',()=>{
 const e=new KeyboardEngine(),small={...ctx,size:7};tap(e,'Digit6');
 assert.equal(e.label('Digit8',small),'');const result=e.keyDown('Digit8',{size:7});e.keyUp('Digit8');assert.equal(result.unavailable,true);assert.equal(e.pending,6);
 e.keyDown('ShiftLeft');assert.equal(e.label('Digit1',small),'');e.keyUp('ShiftLeft');
});
test('legacy sticky preferences are normalized to one-shot suffixes',()=>{
 const config=defaultConfig();config.suffixMode='toggle';const e=new KeyboardEngine(config);tap(e,'Digit8');e.consume();assert.equal(e.pending,null);assert.equal(e.pendingSource,null);
});


test('3x3 defaults contain all requested CIF moves and clockwise/counterclockwise EIF cycles',()=>{
 const c=defaultConfig(3);validateConfig(c);const get=(mode,key)=>c.modes.find(m=>m.id===mode).bindings.find(b=>b.trigger===key)?.action;
 const expected={F:['U',-1],J:['U',1],G:['F',-1],H:['F',1],E:['L',-1],D:['L',1],I:['R',1],K:['R',-1],R:['B',-1],U:['B',1],S:['BL',1],W:['BL',-1],L:['BR',-1],O:['BR',1],A:['D',1],Semicolon:['D',-1]};
 const right={R:'BR',F:'R',L:'F',BL:'L',B:'BL',BR:'B',U:'U',D:'D'},left=Object.fromEntries(Object.entries(right).map(([a,b])=>[b,a]));
 for(const [key,[face,dir]] of Object.entries(expected))for(const [mode,map] of [['cif',{}],['eif-r',right],['eif-l',left]]){assert.equal(get(mode,key).face,map[face]??face);assert.equal(get(mode,key).dir,dir);}
 assert.equal(get('cif','Tab').mode,'eif-r');assert.equal(get('eif-r','Tab').mode,'cif');assert.equal(get('cif','C').mode,'eif-l');assert.equal(get('eif-l','C').mode,'cif');assert.equal(get('cif','M').mode,'e-center');assert.equal(get('e-center','M').mode,'cif');
 assert.equal(get('cif','Space').depth,2);assert.equal(get('cif','2').depth,2);assert.equal(get('cif','1').depth,11);assert.equal(get('cif','0').depth,10);assert.equal(get('cif','Shift+1').depth,11);
 assert.equal(get('cif','Ctrl'),undefined);assert.equal(get('cif','Alt'),undefined);assert.equal(get('cif',"'"),undefined);
 for(const [key,face,dir,kind,depth] of [['F','U',1,'outer',1],['D','U',-1,'outer',1],['J','R',-1,'slice',2],['U','R',1,'slice',2],['K','R',-1,'outer',1],['I','R',1,'outer',1]])assert.deepEqual(get('e-center',key),{type:'move',face,dir,kind,depth});
 for(let size=2;size<=20;size++){const config=defaultConfig(size);validateConfig(config);if(size!==3){assert.equal(config.modes.length,3);assert.equal(config.modes[0].bindings.filter(b=>b.action.type==='move').length,16);assert.deepEqual(config.modes[0].bindings.filter(b=>b.action.type.startsWith('hold-')).map(b=>b.action.type),['hold-slice']);}}
});
test('full width is a cube rotation; slice suffix stacks in either order and clears after one move',()=>{
 const c=defaultConfig(3);c.modes[0].bindings.push({id:'slice-suffix',trigger:"'",action:{type:'suffix-slice'}},{id:'rotation',trigger:'Q',action:{type:'rotate',face:'R',dir:-1,kind:'outer',depth:1}});
 const e=new KeyboardEngine(c),context={size:3};assert.equal(e.label('Digit3',context),'Rot');tap(e,'Digit3');assert.equal(e.resolve(tap(e,'KeyF').action,context).rotation,true);e.consume();
 for(const codes of [['Digit2','Quote'],['Quote','Digit2']]){for(const code of codes)tap(e,code);tap(e,'KeyQ');const move=e.resolve(tap(e,'KeyF').action,context);assert.equal(move.depth,2);assert.equal(move.count,1);assert.equal(move.label,'2U′');assert.equal(move.rotation,undefined);assert.equal(e.keyState('Quote',context).selected,true);e.consume();assert.equal(e.slicePending,false);assert.equal(e.pending,null);}
 assert.equal(e.resolve(tap(e,'KeyQ').action,context).rotation,true);
 assert.equal(new KeyboardEngine(defaultConfig(2)).label('Digit2',{size:2}),'Rot');
});

test('mode labels name their destinations and unbound shortcut modifiers stay blank',()=>{
 const e=new KeyboardEngine(defaultConfig(3));assert.equal(e.label('Tab',ctx),'EIF-R');assert.equal(e.label('KeyC',ctx),'EIF-L');assert.equal(e.label('KeyM',ctx),'E– cntr');
 for(const code of ['ControlLeft','ControlRight','MetaLeft','AltLeft','KeyZ'])assert.equal(e.label(code,ctx),'');
 assert.equal(e.label('ShiftLeft',ctx),'Slice');tap(e,'Tab');assert.equal(e.label('Tab',ctx),'CIF');
});
test('mode names allow at most two six-character words and a single space',()=>{
 for(const name of ['CIF','EIF-R','E– cntr','ABCDEF GHIJKL']){const c=config([]);c.modes[0].name=name;assert.doesNotThrow(()=>validateConfig(c));}
 for(const name of ['1234567','a  b','one two three','a\tb','a\nb',' space','space ']){const c=config([]);c.modes[0].name=name;assert.throws(()=>validateConfig(c),/6 characters/);}
});
test('60 percent geometry contains only the main block and ignores optional numpad',()=>{
 for(const numpad of [false,true]){const board=keyboardLayout({layout:'60',numpad}),codes=board.keys.map(k=>k.code);assert.equal(board.width,15);assert.equal(board.height,5);assert.equal(board.keys.length,61);assert.ok(codes.includes('Escape'));assert.ok(codes.includes('Enter'));for(const code of ['F1','ArrowUp','Home','Delete','Numpad0','Backquote'])assert.ok(!codes.includes(code));assert.equal(new Set(codes).size,codes.length);}
});

test('Escape pauses timed solves only, Shift+Backspace redoes, and two-wide labels say Wide',()=>{
 for(const size of [3,4]){const e=new KeyboardEngine(defaultConfig(size)),context={size,canPause:true};assert.equal(e.label('Escape',{...context,canPause:false}),'');assert.equal(e.label('Escape',context),'Pause');assert.equal(tap(e,'Escape').action.command,'pause');assert.equal(e.label('Digit2',context),'Wide');tap(e,'Digit2');assert.equal(e.keyState('Digit2',context).label,'Wide');e.consume();e.keyDown('ShiftLeft');assert.equal(tap(e,'Backspace').action.command,'redo');}
});

test('every size defaults Shift to Slice, using the selected depth for exactly one turn',()=>{
 for(let size=2;size<=20;size++){
  const config=defaultConfig(size);for(const mode of config.modes){const e=new KeyboardEngine({...config,activeMode:mode.id});assert.equal(e.label('ShiftLeft',{size}),'Slice');assert.equal(e.label('ShiftRight',{size}),'Slice');}
  const e=new KeyboardEngine(config),depth=Math.min(6,size),context={size};tap(e,`Digit${depth}`);e.keyDown('ShiftLeft');const move=e.resolve(tap(e,'KeyF').action,context);assert.equal(move.depth,depth);assert.equal(move.count,1);assert.equal(move.rotation,undefined);e.consume();e.keyUp('ShiftLeft');const outer=e.resolve(tap(e,'KeyF').action,context);assert.equal(outer.depth,1);assert.equal(outer.count,1);
 }
});

test('all sizes have both EIF directions with unchanged U/D, and only 3x3 has centers',()=>{
 const ring=['F','R','BR','B','BL','L'];
 for(let size=2;size<=20;size++){
  const c=defaultConfig(size);validateConfig(c);assert.equal(c.modes.some(m=>m.id==='e-center'),size===3);
  for(const [id,offset,key] of [['eif-r',1,'Tab'],['eif-l',-1,'C']]){
   const mode=c.modes.find(m=>m.id===id);assert.equal(mode.bindings.find(b=>b.trigger===key).action.mode,'cif');
   for(const binding of c.modes[0].bindings.filter(b=>b.action.type==='move')){const target=mode.bindings.find(b=>b.trigger===binding.trigger).action,source=binding.action;assert.equal(target.face,ring.includes(source.face)?ring[(ring.indexOf(source.face)+offset+6)%6]:source.face);assert.equal(target.dir,source.dir);}
  }
 }
});
test('saved EIF upgrades preserve custom keys/modes and do not restore deleted defaults',()=>{
 const c=defaultConfig(20);delete c.eifVersion;c.modes=c.modes.filter(m=>m.id==='cif');c.modes[0].bindings=c.modes[0].bindings.filter(b=>!['Tab','C'].includes(b.trigger));c.modes[0].bindings.push({id:'custom-c',trigger:'C',action:action('U',-1)});
 upgradeEIFDefaults(c);validateConfig(c);assert.equal(c.modes.length,3);assert.deepEqual(c.modes[0].bindings.find(b=>b.trigger==='C').action,action('U',-1));assert.equal(c.modes[0].bindings.find(b=>b.trigger==='Tab').action.mode,'eif-r');
 c.modes=c.modes.filter(m=>m.id!=='eif-l');upgradeEIFDefaults(c);assert.equal(c.modes.length,2);
});
