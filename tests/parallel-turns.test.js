import test from 'node:test';
import assert from 'node:assert/strict';
import {parallelMoves,parallelBands,bandAngle,TURN_ANIMATION_MS} from '../src/parallel-turns.js';
import {FACES,solvedState,selected} from '../src/puzzle.js';
const move=(normal,depth=1,count=1,dir=1)=>({normal,layer:'slice',depth,count,dir});
const up=FACES[0].normal,down=up.map(v=>-v);

test('parallel detection includes opposite faces and excludes other axes',()=>{
 assert.equal(parallelMoves(move(up),move(down)),true);
 assert.equal(parallelMoves(move(up,1),move(up,3)),true);
 assert.equal(parallelMoves(move(up),move(FACES[1].normal)),false);
});
test('opposite and overlapping wide moves partition each sticker exactly once',()=>{
 const moves=[move(up,1,3),move(down,1,2),move(up,2,1,-1)];
 const bands=parallelBands(4,moves);
 for(const sticker of solvedState(4)){
  const matches=bands.filter(band=>selected(sticker,band.move));assert.equal(matches.length,1);
  assert.deepEqual(matches[0].turns.map(t=>t.index),moves.flatMap((turn,index)=>selected(sticker,turn)?[index]:[]));
 }
});
test('overlapping bands add independently timed rotations without restarting earlier turns',()=>{
 const turns=[{move:move(up),started:0,duration:TURN_ANIMATION_MS},{move:move(up,1,1,-1),started:50,duration:TURN_ANIMATION_MS}];
 const band=parallelBands(4,turns.map(turn=>turn.move)).find(b=>b.turns.length===2);
 const progress=50/TURN_ANIMATION_MS,expected=-2*Math.PI/3*progress*progress*(3-2*progress);
 assert.ok(Math.abs(bandAngle(band,turns,50)-expected)<1e-12);
 assert.ok(Math.abs(bandAngle(band,turns,50))>0);
 assert.ok(Math.abs(bandAngle(band,turns,200))<1e-12);
});
test('opposite-face turns rotate around the common axis with opposite signs',()=>{
 const turns=[{move:move(up,1,4),started:0,duration:145},{move:move(down,1,4),started:0,duration:145}];
 const band=parallelBands(4,turns.map(turn=>turn.move))[0];
 assert.equal(bandAngle(band,turns,70),0);
});
