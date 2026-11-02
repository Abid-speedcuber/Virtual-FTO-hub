import test from 'node:test';
import assert from 'node:assert/strict';
import {KeyboardEngine,defaultConfig,validateConfig,upgradeKeyboardDefaults,triggerKey,SUFFIX_HOLD_MS} from '../src/keyboard-engine.js';
import {cstimerConfig} from '../src/keyboard-presets.js';
const context={size:20},move={type:'move',face:'U',dir:1,kind:'outer',depth:1};
const tap=(engine,code,now=0)=>{const result=engine.keyDown(code,{now});engine.keyUp(code,{now:now+10});return result;};
const find=(mode,key)=>mode.bindings.find(b=>triggerKey(b.trigger)===triggerKey(key))?.action;

test('both presets give centers exactly six moves, all three exits, and Backspace undo in every mode',()=>{
 for(const factory of [defaultConfig,cstimerConfig]){
  const config=factory(3),center=config.modes.find(m=>m.id==='e-center');validateConfig(config);
  assert.deepEqual(center.bindings.filter(b=>b.action.type==='move').map(b=>[b.trigger,b.action.face,b.action.dir,b.action.kind]),[
   ['F','U',1,'outer'],['D','U',-1,'outer'],['J','R',-1,'slice'],['U','R',1,'slice'],['K','R',-1,'outer'],['I','R',1,'outer']
  ]);
  assert.equal(find(center,'M').mode,'cif');assert.equal(find(center,'Tab').mode,'eif-r');assert.equal(find(center,config.preset==='cstimer'?'Shift+Tab':'C').mode,'eif-l');
  for(const mode of config.modes){assert.equal(find(mode,'Backspace').command,'undo');assert.equal(find(mode,'Shift+Backspace').command,'redo');}
 }
});
test('saved center defaults upgrade once and missing undo bindings are added without overwriting custom keys',()=>{
 const config=defaultConfig(3);delete config.centerVersion;delete config.undoVersion;
 const center=config.modes.find(m=>m.id==='e-center');
 center.bindings=center.bindings.filter(b=>!['move','mode'].includes(b.action.type));
 const old=[['F','U',-1,'outer',1],['H','U',1,'outer',1],['K','R',1,'outer',1],['D','R',-1,'outer',1],['S','R',-1,'wide',2],['L','R',1,'wide',2],['E','R',-1,'slice',2],['I','R',1,'slice',2]];
 center.bindings.push(...old.map(([trigger,face,dir,kind,depth])=>({id:`center-${trigger}`,trigger,action:{type:'move',face,dir,kind,depth}})));
 for(const mode of config.modes)mode.bindings=mode.bindings.filter(b=>!b.trigger.includes('Backspace'));
 config.modes.push({id:'custom',name:'Custom',bindings:[{id:'my-backspace',trigger:'Backspace',action:{type:'command',command:'home'}}]});
 upgradeKeyboardDefaults(config);validateConfig(config);
 assert.equal(find(center,'F').dir,1);assert.equal(find(center,'D').face,'U');assert.equal(find(center,'J').kind,'slice');assert.equal(find(center,'Tab').mode,'eif-r');assert.equal(find(center,'C').mode,'eif-l');assert.equal(find(center,'M').mode,'cif');
 assert.equal(center.bindings.filter(b=>b.action.type==='move').length,6);assert.equal(find(center,'Backspace').command,'undo');assert.equal(find(config.modes.at(-1),'Backspace').command,'home');
 const upgraded=structuredClone(config);upgradeKeyboardDefaults(config);assert.deepEqual(config,upgraded);
});
test('a quick suffix tap leaves Slice and move legends unchanged until release, then affects one move',()=>{
 const engine=new KeyboardEngine();engine.keyDown('Digit6',{now:0});
 assert.equal(engine.pending,null);assert.equal(engine.keyState('Digit6',context).selected,false);assert.equal(engine.label('ShiftLeft',context),'Slice');assert.equal(engine.label('KeyF',context),'U′');
 engine.activateSuffixes(SUFFIX_HOLD_MS-1);assert.equal(engine.label('ShiftLeft',context),'Slice');
 engine.keyUp('Digit6',{now:100});assert.equal(engine.pending,6);assert.equal(engine.resolve(move,context).count,6);
 engine.consume();assert.equal(engine.resolve(move,context).count,1);
});
test('a held depth stays active through repeated turns and does not leave a suffix after release',()=>{
 const engine=new KeyboardEngine();engine.keyDown('Digit6',{now:0});engine.activateSuffixes(SUFFIX_HOLD_MS);
 for(let n=0;n<3;n++){assert.equal(engine.resolve(move,context).count,6);engine.consume();}
 engine.keyUp('Digit6',{now:300});assert.equal(engine.pending,null);assert.equal(engine.resolve(move,context).count,1);
});
test('a rapid suffix-plus-move chord activates immediately and stays held for later moves',()=>{
 const engine=new KeyboardEngine();engine.keyDown('Digit6',{now:0});
 for(const [code,now] of [['KeyF',20],['KeyJ',40]]){const action=engine.keyDown(code,{now}).action;assert.equal(engine.resolve(action,context).count,6);engine.consume();engine.keyUp(code,{now:now+5});}
 engine.keyUp('Digit6',{now:70});assert.equal(engine.pending,null);assert.equal(engine.resolve(move,context).count,1);
});
test('slice suffix is both a one-shot tap and a repeatable held modifier, including with depth',()=>{
 const config=defaultConfig();config.modes[0].bindings.push({id:'slice',trigger:'Quote',action:{type:'suffix-slice'}});
 const engine=new KeyboardEngine(config);tap(engine,'Quote');assert.equal(engine.slicePending,true);engine.consume();
 tap(engine,'Digit8',20);engine.keyDown('Quote',{now:40});engine.activateSuffixes(250);
 for(let n=0;n<2;n++){const turn=engine.resolve(move,context);assert.equal(turn.depth,n===0?8:2);assert.equal(turn.count,1);engine.consume();}
 assert.equal(engine.keyState('Quote',context).label,'Slice');engine.keyUp('Quote',{now:260});assert.equal(engine.slicePending,false);assert.equal(engine.resolve(move,context).depth,1);
});
test('two held suffixes stack across moves and releasing slice restores the held wide depth',()=>{
 const config=defaultConfig();config.modes[0].bindings.push({id:'slice',trigger:'Quote',action:{type:'suffix-slice'}});
 const engine=new KeyboardEngine(config);engine.keyDown('Digit8',{now:0});engine.keyDown('Quote',{now:10});engine.activateSuffixes(220);
 for(let n=0;n<2;n++){const turn=engine.resolve(move,context);assert.equal(turn.depth,8);assert.equal(turn.count,1);engine.consume();}
 engine.keyUp('Quote',{now:230});assert.equal(engine.resolve(move,context).count,8);engine.keyUp('Digit8',{now:240});assert.equal(engine.pending,null);assert.equal(engine.slicePending,false);
});
test('shifted depth remains held when Shift is released, and missed modifier releases cancel taps',()=>{
 const engine=new KeyboardEngine();engine.keyDown('ShiftLeft',{now:0});engine.keyDown('Digit8',{now:10});engine.keyUp('ShiftLeft',{now:20});engine.activateSuffixes(220);
 assert.equal(engine.resolve(move,context).count,18);engine.keyUp('Digit8',{now:230});assert.equal(engine.pending,null);
 const config=defaultConfig();config.modes[0].bindings.push({id:'alt-slice',trigger:'Alt',action:{type:'suffix-slice'}});engine.configure(config);
 engine.keyDown('AltLeft',{now:0});engine.syncModifiers({code:'KeyF',altKey:false});assert.equal(engine.slicePending,false);
 engine.keyDown('AltLeft',{now:0});const action=engine.keyDown('KeyF',{now:20}).action;assert.equal(engine.resolve(action,context).depth,2);engine.consume();engine.keyUp('AltLeft',{now:40});assert.equal(engine.slicePending,false);
});
test('blur/cancel discards an undecided suffix instead of turning it into a tap',()=>{
 const engine=new KeyboardEngine();engine.keyDown('Digit6',{now:0});engine.clear();engine.keyUp('Digit6',{now:30});assert.equal(engine.pending,null);assert.equal(engine.suffixPresses.length,0);
});
