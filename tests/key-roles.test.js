import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig,validateConfig,KeyboardEngine} from '../src/keyboard-engine.js';
import {keyRole,keyRoleImpact,changeKeyRole} from '../src/key-roles.js';
const move={type:'move',face:'R',dir:1,kind:'outer',depth:1};
const config=()=>{const c=defaultConfig(3);c.modes=[c.modes[0]];c.modes[0].bindings=[{id:'suffix',trigger:'5',action:{type:'depth',depth:2}},{id:'move',trigger:'F',action:move},{id:'chord',trigger:'5+G',action:{...move,face:'L'}},{id:'seq',trigger:'G 5+H',action:{...move,face:'U'}}];return c;};
test('key-type changes preview dependencies and leave affected combinations unassigned',()=>{
 const c=config(),mode=c.modes[0],impact=keyRoleImpact(mode,'Digit5');assert.equal(keyRole(mode,'Digit5'),'suffix');assert.equal(impact.direct.length,1);assert.equal(impact.dependent.length,2);assert.equal(impact.implicit.length,1);
 changeKeyRole(mode,'Digit5','move',move,'');validateConfig(c);
 assert.deepEqual(mode.bindings.map(b=>b.trigger),['F','5']);assert.equal(keyRole(mode,'Digit5'),'move');assert.equal(keyRole(mode,'MetaLeft'),'modifier');
 assert.equal(new KeyboardEngine(c).keyDown('Digit5').action.face,'R');
});
test('replacement preserves the suffix, chords and sequences without affecting other modes',()=>{
 const c=config(),mode=c.modes[0];changeKeyRole(mode,'Digit5','move',move,'F8');validateConfig(c);
 assert.ok(mode.bindings.some(b=>b.trigger==='F8+G'));assert.ok(mode.bindings.some(b=>b.trigger==='G F8+H'));assert.equal(keyRole(mode,'F8'),'suffix');
 const engine=new KeyboardEngine(c);engine.keyDown('F8',{now:0,size:3});const result=engine.keyDown('KeyF',{now:1,size:3});assert.equal(engine.resolve(result.action,{size:3}).count,2);
});
test('replacement rejects occupied triggers, the source key and sequences',()=>{
 for(const replacement of ['F','5','F8 F9','Ctrl+5'])assert.throws(()=>changeKeyRole(config().modes[0],'Digit5','move',move,replacement));
});
test('physical Meta becomes a move key and no longer blocks the next move while held',()=>{
 const c=config(),mode=c.modes[0];changeKeyRole(mode,'MetaLeft','move',move,'');validateConfig(c);
 const engine=new KeyboardEngine(JSON.parse(JSON.stringify(c)));engine.syncModifiers({code:'MetaLeft',metaKey:true});assert.equal(engine.keyDown('MetaLeft',{now:0}).action.face,'R');engine.syncModifiers({code:'KeyF',metaKey:true});assert.equal(engine.keyDown('KeyF',{now:1}).action.face,'R');
});
test('physical modifier can host a suffix and its held depth works',()=>{
 const c=config(),mode=c.modes[0];changeKeyRole(mode,'Digit5','move',move,'MetaLeft');validateConfig(c);
 const engine=new KeyboardEngine(c);engine.syncModifiers({code:'MetaLeft',metaKey:true});engine.keyDown('MetaLeft',{now:0});engine.syncModifiers({code:'KeyF',metaKey:true});const result=engine.keyDown('KeyF',{now:1});assert.equal(engine.resolve(result.action,{size:3}).count,2);
});
test('generic modifier dependencies are included when changing a physical side',()=>{
 const c=config(),mode=c.modes[0];mode.bindings.push({id:'undo',trigger:'Ctrl+Z',action:{type:'command',command:'undo'}});assert.ok(keyRoleImpact(mode,'ControlLeft').dependent.some(b=>b.id==='undo'));
 changeKeyRole(mode,'ControlLeft','move',move,'F9');validateConfig(c);assert.equal(mode.bindings.find(b=>b.id==='undo').trigger,'F9+Z');
});

test('unsupported depth keys are unassigned move keys, including old saved presets',()=>{
 for(const size of [3,4,7,8,20]){const c=defaultConfig(size);for(const mode of c.modes)assert.ok(mode.bindings.every(b=>b.action.type!=='depth'||b.action.depth<=size));}
 const c=defaultConfig(3),mode=c.modes[0];mode.bindings.push({id:'old7',trigger:'7',action:{type:'depth',depth:7}},{id:'old17',trigger:'Shift+7',action:{type:'depth',depth:17}});
 assert.equal(keyRole(mode,'Digit7',3),'move');const impact=keyRoleImpact(mode,'Digit7',3,c);assert.equal(impact.implicit.length,0);assert.equal(impact.dependent.length,0);assert.equal(impact.unavailable.length,2);
 changeKeyRole(mode,'Digit7','move',null,'',3,c);assert.ok(!mode.bindings.some(b=>b.id.startsWith('old')));
});
test('only turns that actually change are shown as suffix dependencies',()=>{
 const c=config(),mode=c.modes[0];mode.bindings.push({id:'wide',trigger:'H',action:{...move,kind:'wide',depth:2}});
 const impact=keyRoleImpact(mode,'Digit5',3,c);assert.ok(impact.implicit.some(b=>b.id==='move'&&b.modifiedLabel==='Rw'));assert.ok(!impact.implicit.some(b=>b.id==='wide'));
});
test('a replacement chord receives the old suffix and all dependent chords',()=>{
 const c=config(),mode=c.modes[0];changeKeyRole(mode,'Digit5','move',null,'Ctrl+F8',3,c);validateConfig(c);
 assert.ok(mode.bindings.some(b=>b.trigger==='Ctrl+F8'&&b.action.type==='depth'));assert.equal(mode.bindings.find(b=>b.id==='chord').trigger,'Ctrl+F8+G');assert.ok(!mode.bindings.some(b=>b.trigger==='5'));
 const engine=new KeyboardEngine(c);engine.keyDown('ControlLeft',{now:0,size:3});engine.keyDown('F8',{now:1,size:3});const result=engine.keyDown('KeyF',{now:2,size:3});assert.equal(engine.resolve(result.action,{size:3}).count,2);
});

test('a replacement that already triggers an implicit modified turn is rejected atomically',()=>{
 const c=config(),mode=c.modes[0];mode.bindings.push({id:'hold',trigger:'Shift',action:{type:'hold-slice'}});
 const before=JSON.stringify(mode);assert.throws(()=>changeKeyRole(mode,'Digit5','move',null,'Shift+F',3,c),/already has bindings/);assert.equal(JSON.stringify(mode),before);
 assert.throws(()=>changeKeyRole(mode,'Digit5','move',null,'F8+F',3,c),/already has bindings/);assert.equal(JSON.stringify(mode),before);
});

test('an inactive old suffix counts as unassigned and can receive a working suffix',()=>{
 const c=config(),mode=c.modes[0];mode.bindings.push({id:'inactive',trigger:'7',action:{type:'depth',depth:7}});
 changeKeyRole(mode,'Digit5','move',null,'7',3,c);validateConfig(c);assert.ok(!mode.bindings.some(b=>b.id==='inactive'));assert.equal(mode.bindings.find(b=>b.trigger==='7').action.depth,2);
});
