import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bindingCatalog,bindingSubgroups} from '../src/binding-catalog.js';
import {defaultConfig,upgradeKeyboardDefaults,validateConfig} from '../src/keyboard-engine.js';
import {defaultCifRotation,frameForCamera,DEFAULT_CIF_FRAME} from '../src/orientation.js';
test('catalog and subgroups include only widths relevant to each selected puzzle, with no 1w',()=>{
 for(let size=2;size<=20;size++){const config=defaultConfig(size),rows=bindingCatalog(size,config);assert.equal(rows.filter(row=>row.category==='wide').length,(size-1)*16);assert.equal(rows.filter(row=>row.category==='slices').length,(size-1)*16);assert.equal(rows.filter(row=>row.action.type==='depth').length,size-1);assert.equal(rows.some(row=>(row.action.type==='depth'||row.action.type==='move'&&['slice','wide'].includes(row.action.kind))&&(row.action.depth<2||row.action.depth>size)),false);assert.equal(bindingSubgroups('wide',config,size).length,size);}
});
test('obsolete 1w bindings are retired without deleting other custom bindings',()=>{
 const config=defaultConfig(3);config.modes[0].bindings.push({id:'one',trigger:'F8',action:{type:'depth',depth:1}},{id:'wide-one',trigger:'F9',action:{type:'move',face:'U',dir:1,kind:'wide',depth:1}},{id:'mine',trigger:'F10',action:{type:'move',face:'R',dir:1,kind:'outer',depth:1}});upgradeKeyboardDefaults(config);validateConfig(config);assert.equal(config.modes[0].bindings.some(binding=>['one','wide-one'].includes(binding.id)),false);assert.ok(config.modes[0].bindings.some(binding=>binding.id==='mine'));
});
test('default puzzle hold is exact CIF with white top and green front',()=>{
 const q=defaultCifRotation(),camera=new THREE.PerspectiveCamera();camera.quaternion.copy(q).invert();assert.deepEqual(frameForCamera(camera),DEFAULT_CIF_FRAME);assert.equal(DEFAULT_CIF_FRAME.up,'U');assert.equal(DEFAULT_CIF_FRAME.front,'BR');for(const normal of [DEFAULT_CIF_FRAME.normals[0],DEFAULT_CIF_FRAME.normals[2]])assert.ok(Math.abs(new THREE.Vector3(...normal).applyQuaternion(q).x)<1e-8);
});
