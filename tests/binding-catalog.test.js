import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingCatalog,bindingActionKey,bindingSubgroups,inBindingSubgroup,relevantBindingAction} from '../src/binding-catalog.js';
import {defaultConfig,validateConfig,equivalentTrigger} from '../src/keyboard-engine.js';
test('catalog covers every valid layer, direction and supported action on every puzzle',()=>{
 for(let size=2;size<=20;size++){
  const config=defaultConfig(size),rows=bindingCatalog(size,config),keys=rows.map(row=>row.key);assert.equal(new Set(keys).size,keys.length);
  for(const row of rows)validateConfig({...config,modes:[...config.modes.map(mode=>({...mode,bindings:[]})),{id:'test',name:'Test',bindings:[{id:'one',trigger:'F',action:row.action}]}]});
  for(const mode of config.modes)for(const binding of mode.bindings.filter(binding=>relevantBindingAction(binding.action,size)))assert.ok(keys.includes(bindingActionKey(binding.action)));
  assert.ok(rows.some(row=>row.label===`${size}R′`));assert.ok(rows.some(row=>row.label===`${size===2?'':size}BLw`));assert.ok(rows.some(row=>row.label===`Suffix ${size}w`));assert.ok(rows.some(row=>row.action.command==='snap-view'));
 }
});

test('conflict matching treats generic modifiers as overlaps with either physical side',()=>{
 assert.equal(equivalentTrigger('Ctrl+F','F+ControlLeft'),true);assert.equal(equivalentTrigger('Shift','ShiftRight'),true);assert.equal(equivalentTrigger('ShiftLeft','ShiftRight'),false);assert.equal(equivalentTrigger('F8 F9','F8'),false);
});

test('catalog contains every relevant slice and width, hiding larger-puzzle and 1w actions',()=>{
 for(const size of [2,3,4,9,20]){const config=defaultConfig(size),rows=bindingCatalog(size,config);for(const face of ['U','R','F','BR','L','B','BL','D'])for(const dir of [1,-1])for(let depth=2;depth<=size;depth++)for(const kind of ['slice','wide'])assert.ok(rows.some(row=>row.key===bindingActionKey({type:'move',face,dir,kind,depth})));assert.equal(rows.some(row=>row.action.depth>size&&['move','depth'].includes(row.action.type)),false);assert.equal(rows.some(row=>row.label==='1Uw'||row.label==='Suffix 1w'),false);}
});

test('mode actions follow the current mode library, including newly added, renamed and deleted modes',()=>{
 const config=defaultConfig(3);config.modes.push({id:'custom-mode',name:'Custom',bindings:[]});
 let rows=bindingCatalog(3,config);assert.ok(rows.some(row=>row.label==='Switch to Custom'&&row.action.mode==='custom-mode'));assert.ok(rows.some(row=>row.label==='Hold Custom'));
 config.modes.at(-1).name='New name';rows=bindingCatalog(3,config);assert.ok(rows.some(row=>row.label==='Switch to New name'));assert.equal(rows.some(row=>row.label==='Switch to Custom'),false);
 config.modes.pop();assert.equal(bindingCatalog(3,config).some(row=>row.action.mode==='custom-mode'),false);
});

test('mode switch and hold entries stay together for all 40 modes',()=>{
 const config=defaultConfig(3);while(config.modes.length<40){const n=config.modes.length;config.modes.push({id:`mode-${n}`,name:`Mode ${n}`,bindings:[]});}
 const rows=bindingCatalog(3,config).filter(row=>row.category==='modes');
 for(const mode of config.modes){const switchIndex=rows.findIndex(row=>row.action.type==='mode'&&row.action.mode===mode.id),holdIndex=rows.findIndex(row=>row.action.type==='hold-mode'&&row.action.mode===mode.id);assert.equal(holdIndex,switchIndex+1);}
});

test('depth subgroups expose every face and direction together, and mode subgroups follow the library',()=>{
 const config=defaultConfig(3),rows=bindingCatalog(3,config);
 for(const category of ['slices','wide'])for(let depth=2;depth<=3;depth++){
  assert.ok(bindingSubgroups(category,config,3).some(([value])=>value===`depth:${depth}`));
  const group=rows.filter(row=>row.category===category&&inBindingSubgroup(row,`depth:${depth}`));assert.equal(group.length,16);assert.equal(new Set(group.map(row=>row.action.face)).size,8);
 }
 config.modes.push({id:'custom',name:'New mode',bindings:[]});assert.ok(bindingSubgroups('modes',config).some(([value,label])=>value==='mode:custom'&&label==='New mode'));
 config.modes.at(-1).name='Renamed';assert.ok(bindingSubgroups('modes',config).some(([value,label])=>value==='mode:custom'&&label==='Renamed'));
 config.modes.pop();assert.equal(bindingSubgroups('modes',config).some(([value])=>value==='mode:custom'),false);
});
