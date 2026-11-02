import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig,validateConfig,KeyboardEngine,triggerKey} from '../src/keyboard-engine.js';
import {cstimerConfig,CSTIMER_FTO_KEYS} from '../src/keyboard-presets.js';
const find=(config,key,mode='cif')=>config.modes.find(m=>m.id===mode).bindings.find(b=>triggerKey(b.trigger)===triggerKey(key))?.action;
test('both presets validate for every size, retaining EIF and 3x3-only Abid centers',()=>{
 for(let size=2;size<=20;size++)for(const factory of [defaultConfig,cstimerConfig]){const c=factory(size);validateConfig(c);assert.equal(c.modes.length,size===3?4:3);assert.equal(find(c,'Tab').mode,'eif-r');assert.equal(find(c,c.preset==='cstimer'?'Shift+Tab':'C').mode,'eif-l');assert.equal(c.modes.some(m=>m.id==='e-center'),size===3);}
 assert.deepEqual(cstimerConfig(3).modes.find(m=>m.id==='e-center').bindings.filter(b=>b.action.type==='move'),defaultConfig(3).modes.find(m=>m.id==='e-center').bindings.filter(b=>b.action.type==='move'));
});
test('csTimer native FTO mapping exactly retains 16 turns, 4 wides, and 8 rotations',()=>{
 const c=cstimerConfig(3);assert.equal(CSTIMER_FTO_KEYS.length,28);
 const expected={I:['R',1],K:['R',-1],D:['L',1],E:['L',-1],J:['U',1],F:['U',-1],H:['F',1],G:['F',-1],S:['D',1],L:['D',-1],W:['B',1],O:['B',-1],'8':['BR',1],',':['BR',-1],C:['BL',1],'3':['BL',-1],U:['R',1],M:['R',-1],R:['L',-1],V:['L',1]};
 for(const [key,[face,dir]] of Object.entries(expected)){const a=find(c,key);assert.equal(a.face,face);assert.equal(a.dir,dir);assert.equal(a.kind,'UMRV'.includes(key)?'wide':'outer');}
 for(const [key,face,dir] of [['Y','R',1],['N','R',-1],['T','L',-1],['B','L',1],[';','U',1],['A','U',-1],['P','U',1],['Q','U',-1]]){const a=find(c,key);assert.equal(a.type,'rotate');assert.equal(a.face,face);assert.equal(a.dir,dir);assert.equal(!!a.vertex,['P','Q'].includes(key));}
 assert.equal(find(c,'Shift+3'),undefined);assert.equal(find(c,'Shift+8'),undefined);assert.equal(find(c,'Space').mode,'e-center');assert.equal(find(c,'Space','e-center').mode,'cif');assert.equal(find(c,'M','e-center').mode,'cif');
});
test('Abid independent rotations ignore selected depth and held slice',()=>{
 const c=defaultConfig(20);for(const mode of c.modes){const e=new KeyboardEngine({...c,activeMode:mode.id});e.keyDown('Digit6');e.keyUp('Digit6');e.keyDown('ShiftLeft');for(const [code,dir] of [['Backquote',1],['Minus',-1]]){const action=e.keyDown(code).action;e.keyUp(code);const move=e.resolve(action,{size:20});assert.equal(move.rotation,true);assert.equal(move.face,'U');assert.equal(move.dir,dir);assert.equal(move.count,20);assert.equal(e.pending,6);}}
});
test('csTimer EIF maps turn faces while keeping independent rotations stable',()=>{
 const c=cstimerConfig(3);assert.equal(find(c,'I','eif-r').face,'BR');assert.equal(find(c,'I','eif-l').face,'F');assert.equal(find(c,'C','eif-r').face,'L');assert.equal(find(c,'J','eif-l').face,'U');assert.deepEqual(find(c,'P','eif-r'),find(c,'P'));assert.deepEqual(find(c,'Y','eif-l'),find(c,'Y'));
});
