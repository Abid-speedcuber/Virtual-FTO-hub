import test from 'node:test';
import assert from 'node:assert/strict';
import {ReplayTurnStats} from '../src/replay-stats.js';
import {CIF_COLOR_FACES,faceColorLabel} from '../src/color-scheme.js';
const data=window=>({initial:{keyboard:{display:{window}}},events:[{at:0,type:'accept',action:'move'},{at:10,type:'key',code:'KeyF',repeat:true},{at:100,type:'accept',action:'move'},{at:200,type:'accept',action:'rotate'},{at:400,type:'accept',action:'undo'},{at:500,type:'accept',action:'redo'},{at:1000,type:'accept',action:'move'}]});
test('replay TPS counts accepted moves, excludes commands and keys, and supports arbitrary seeking',()=>{
 const stats=new ReplayTurnStats(data(1));assert.deepEqual(stats.at(-1),{tps:0,peak:0,total:0});assert.deepEqual(stats.at(999),{tps:2,peak:2,total:2});assert.deepEqual(stats.at(1000),{tps:2,peak:2,total:3});assert.deepEqual(stats.at(3000),{tps:0,peak:2,total:3});assert.deepEqual(stats.at(50),{tps:1,peak:1,total:1});
});
test('recorded TPS respects the solver window and legacy recordings fall back to committed turns',()=>{
 const stats=new ReplayTurnStats(data(3));assert.equal(stats.at(1000).tps,1);assert.equal(stats.at(3000).tps,2/3);const legacy=new ReplayTurnStats({initial:{},events:[{type:'turn',at:0},{type:'turn',at:500}]});assert.equal(legacy.at(600).tps,2);
});
test('color editor maps CIF names to stable geometry IDs with white U and green F',()=>{
 assert.equal(CIF_COLOR_FACES.length,8);assert.equal(new Set(CIF_COLOR_FACES.map(face=>face.physical.name)).size,8);assert.equal(CIF_COLOR_FACES.find(face=>face.name==='U').physical.color,'#fafafa');assert.equal(CIF_COLOR_FACES.find(face=>face.name==='F').physical.name,'BR');assert.equal(CIF_COLOR_FACES.find(face=>face.name==='F').physical.color,'#00c853');assert.equal(faceColorLabel('F','#00c853'),'F · Green');assert.equal(faceColorLabel('U','#ffffff'),'U · White');assert.equal(faceColorLabel('F','#123456'),'F · Custom');
});
