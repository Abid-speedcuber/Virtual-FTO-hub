import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FRAMES,frameForCamera,snappedViewRotation} from '../src/orientation.js';
import {defaultConfig,KeyboardEngine,upgradeKeyboardDefaults,validateConfig,triggerKey} from '../src/keyboard-engine.js';
import {cstimerConfig} from '../src/keyboard-presets.js';
const cameraAt=(rotation,radius=9)=>{
 const camera=new THREE.PerspectiveCamera();camera.quaternion.copy(rotation).invert();camera.position.set(0,0,radius).applyQuaternion(camera.quaternion);camera.up.set(0,1,0).applyQuaternion(camera.quaternion);camera.updateMatrixWorld();return camera;
};
const action=(config,mode,key)=>new KeyboardEngine({...config,activeMode:mode.id}).keyDown(key).action;

test('snap preserves every CIF/EIF face assignment at every label switch angle and zoom',()=>{
 for(const frame of FRAMES)for(const angle of [0,15,40])for(const zoom of [6,10,20]){
  const target=snappedViewRotation(frame),camera=cameraAt(target,zoom),after=frameForCamera(camera,angle);
  assert.deepEqual(after.normals,frame.normals);assert.equal(after.notation,frame.notation);assert.ok(Math.abs(camera.position.length()-zoom)<1e-10);
  assert.ok(target.angleTo(snappedViewRotation(after))<1e-7);
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
  assert.ok(Math.abs(right.dot(new THREE.Vector3(...frame.normals[0])))<1e-10);
  assert.ok(Math.abs(right.dot(new THREE.Vector3(...frame.normals[2])))<1e-10);
 }
});

test('slightly tilted CIF and EIF holds snap back to the same canonical view',()=>{
 for(const frame of FRAMES)for(const roll of [-.06,.06]){
  const ideal=snappedViewRotation(frame),tilt=new THREE.Quaternion().setFromEuler(new THREE.Euler(.03,-.04,roll));
  const camera=cameraAt(ideal.clone().premultiply(tilt));const before=frameForCamera(camera);
  assert.deepEqual(before.normals,frame.normals);assert.ok(ideal.angleTo(snappedViewRotation(before))<1e-7);
 }
});

test('Abid binds [ in every mode and size; Home is unbound; csTimer gets no new default',()=>{
 for(let size=2;size<=20;size++){
  const abid=defaultConfig(size),cs=cstimerConfig(size);validateConfig(abid);validateConfig(cs);
  for(const mode of abid.modes){assert.equal(action(abid,mode,'BracketLeft').command,'snap-view');assert.equal(action(abid,mode,'Home'),undefined);}
  for(const mode of cs.modes){assert.equal(action(cs,mode,'BracketLeft'),undefined);assert.equal(action(cs,mode,'Home'),undefined);}
 }
});

test('saved profiles migrate Home safely, respect occupied keys, and keep user removal of [',()=>{
 const config=defaultConfig(3);delete config.viewSnapVersion;
 for(const mode of config.modes){mode.bindings=mode.bindings.filter(b=>b.action.command!=='snap-view');mode.bindings.push({id:`old-home-${mode.id}`,trigger:'Home',action:{type:'command',command:'home'}});}
 config.modes[0].bindings.push({id:'custom-bracket',trigger:'[',action:{type:'command',command:'fit'}});
 upgradeKeyboardDefaults(config);validateConfig(config);
 assert.equal(action(config,config.modes[0],'BracketLeft').command,'fit');
 for(const mode of config.modes.slice(1))assert.equal(action(config,mode,'BracketLeft').command,'snap-view');
 for(const mode of config.modes)assert.equal(action(config,mode,'Home'),undefined);
 config.modes[1].bindings=config.modes[1].bindings.filter(b=>triggerKey(b.trigger)!=='BracketLeft');
 const saved=structuredClone(config);upgradeKeyboardDefaults(config);assert.deepEqual(config,saved);
});
