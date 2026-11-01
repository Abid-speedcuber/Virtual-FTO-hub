import test from 'node:test';
import assert from 'node:assert/strict';
import {TurnPacing} from '../src/turn-pacing.js';
test('animation duration shortens below input intervals and returns to normal after a pause',()=>{
 const p=new TurnPacing();p.input(0);assert.equal(p.duration(),145);
 p.input(50);assert.equal(p.duration(),40);p.input(70);assert.equal(p.duration(),16);
 p.input(70);assert.equal(p.duration(),6);p.input(1000);assert.equal(p.duration(),145);
 p.reset();assert.equal(p.duration(),145);
});
