import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultConfig,KeyboardEngine,validateConfig,upgradeKeyboardDefaults,triggerKey,UNDO_REDO_SHORTCUTS,parseTrigger} from '../src/keyboard-engine.js';
import {cstimerConfig} from '../src/keyboard-presets.js';
import {formatBindingTrigger} from '../src/binding-key-labels.js';
test('every preset mode on every size has Windows/Linux Ctrl and macOS Command editing shortcuts',()=>{
 for(const factory of [defaultConfig,cstimerConfig])for(let size=2;size<=20;size++){
  const config=factory(size);validateConfig(config);
  for(const mode of config.modes)for(const [trigger,command] of UNDO_REDO_SHORTCUTS){const binding=mode.bindings.find(binding=>triggerKey(binding.trigger)===triggerKey(trigger));assert.equal(binding?.action.command,command,`${config.preset} ${size} ${mode.name} ${trigger}`);}
  for(const mode of config.modes)for(const binding of mode.bindings.filter(binding=>parseTrigger(binding.trigger).flat().includes('Meta'))){const ctrl=triggerKey(binding.trigger).replaceAll('Meta','Control').split(' ').map(step=>step.split('+').sort().join('+')).join(' ');assert.deepEqual(mode.bindings.find(other=>triggerKey(other.trigger)===ctrl)?.action,binding.action);}
 }
});
test('both left and right Control/Command chords dispatch undo and redo in the center mode',()=>{
 for(const factory of [defaultConfig,cstimerConfig]){
  const config=factory(3);config.activeMode='e-center';const engine=new KeyboardEngine(config);
  for(const side of ['Left','Right'])for(const [modifier,shift,key,command] of [['Control',false,'KeyZ','undo'],['Control',false,'KeyY','redo'],['Control',true,'KeyZ','redo'],['Meta',false,'KeyZ','undo'],['Meta',true,'KeyZ','redo']]){
   engine.clear();engine.keyDown(modifier+side);if(shift)engine.keyDown('Shift'+side);assert.equal(engine.keyDown(key).action?.command,command);
  }
 }
});
test('saved defaults gain missing platform equivalents once, preserving user keys, modes and later deletions',()=>{
 const config=defaultConfig(3),center=config.modes.find(mode=>mode.id==='e-center');delete config.platformShortcutVersion;center.bindings=center.bindings.filter(binding=>!['Control+KeyZ','KeyZ+Meta','Control+KeyZ+Shift','KeyZ+Meta+Shift','Control+KeyY'].includes(triggerKey(binding.trigger)));
 center.bindings.push({id:'mine',trigger:'Ctrl+Z',action:{type:'move',face:'F',kind:'outer',depth:1,dir:1}});config.modes.push({id:'custom',name:'Custom',bindings:[]});upgradeKeyboardDefaults(config);validateConfig(config);
 assert.equal(center.bindings.find(binding=>triggerKey(binding.trigger)===triggerKey('Ctrl+Z')).id,'mine');assert.equal(center.bindings.find(binding=>triggerKey(binding.trigger)===triggerKey('Cmd+Z')).action.command,'undo');assert.deepEqual(config.modes.at(-1).bindings,[]);
 center.bindings=center.bindings.filter(binding=>triggerKey(binding.trigger)!==triggerKey('Cmd+Z'));upgradeKeyboardDefaults(config);assert.equal(center.bindings.some(binding=>triggerKey(binding.trigger)===triggerKey('Cmd+Z')),false);
});
test('modifier labels and aliases match Windows, Linux and macOS without changing stored triggers',()=>{
 for(const alias of ['Meta','Cmd','Command','Win','Windows','Super'])assert.deepEqual(parseTrigger(`${alias}+Z`),parseTrigger('Meta+Z'));
 assert.equal(formatBindingTrigger('Meta+Shift+Z','MacIntel'),'Cmd+Shift+Z');assert.equal(formatBindingTrigger('Meta+Z','Windows'),'Win+Z');assert.equal(formatBindingTrigger('Meta+Z','Linux x86_64'),'Super+Z');assert.equal(formatBindingTrigger('MetaRight+Z','macOS'),'Right Cmd+Z');assert.equal(formatBindingTrigger('Control+Z','Windows'),'Ctrl+Z');
});
