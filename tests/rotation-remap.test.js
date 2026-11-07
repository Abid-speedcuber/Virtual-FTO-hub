import assert from 'node:assert/strict';
import test from 'node:test';
import {parseRotation,remappedFace,ROTATION_ORDER} from '../src/rotation-remap.js';

test('rotation mappings keep the old-face rows in the canonical order',()=>{
 assert.deepEqual(ROTATION_ORDER,['U','D','R','L','F','B','BR','BL']);
 const result=parseRotation('{U, R}');
 assert.equal(result.state,'valid');
 assert.deepEqual(ROTATION_ORDER.map(face=>[face,result.mapping[face]]),[
  ['U','U'],['D','D'],['R','F'],['L','BL'],
  ['F','L'],['B','BR'],['BR','R'],['BL','B']
 ]);
});

test('rotation remapping applies old-face to new-face assignments',()=>{
 const mapping=parseRotation('{U, R}').mapping;
 assert.equal(remappedFace({type:'move',face:'R'},mapping),'F');
 assert.equal(remappedFace({type:'move',face:'F'},mapping),'L');
 assert.equal(remappedFace({type:'rotate',face:'U'},mapping),'U');
 assert.equal(remappedFace({type:'rotate',face:'U',vertex:true},mapping),undefined);
});
