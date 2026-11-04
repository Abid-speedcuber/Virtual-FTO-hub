import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseFtoScramble} from '../src/fto-scramble.js';
import {solvedState,applyMove,inverse,isSolved,FACES,normalOf,dot} from '../src/puzzle.js';

// Instrument only the test copy: inspect the sampled state before the upstream
// solver inverts its solution, without modifying the vendored module.
const source=await readFile(new URL('../src/vendor/cstimer-fto.mjs',import.meta.url),'utf8');
const reference=await import('data:text/javascript;base64,'+Buffer.from(source.replace(
 'return ftosolver.solveFacelet(fc.toFaceCube(), true);',
 'sampledState=fc.toFaceCube();return ftosolver.solveFacelet(sampledState, true);'
)+'\nexport let sampledState;export {ftosolver};').toString('base64'));
const Cubie=reference.ftosolver.FtoCubie;
const names=['U',"U'",'F',"F'",'BR',"BR'",'BL',"BL'",'D',"D'",'B',"B'",'R',"R'",'L',"L'"];
const faceNames=['U','F','BR','BL','D','B','R','L'];
const normals=faceNames.map(n=>parseFtoScramble(n)[0].normal);
const key=sticker=>sticker.vertices.map(v=>v.join(',')).sort().join(';');
const solved=solvedState(3),positions=new Map(solved.map(s=>[key(s),s.id]));
const geometricMoves=names.map(n=>applyMove(solved,parseFtoScramble(n)[0]).map(s=>positions.get(key(s))));
// Cubie.toFaceCube(1) gives source sticker IDs at destination positions.
const referenceMoves=Cubie.moveCube.slice(0,16).map(c=>c.toFaceCube(1)).map(p=>{
 const destination=[];p.forEach((from,to)=>destination[from]=to);return destination;
});

function faceletMap(){
 const initial=Array(72).fill(-1),used=new Set();
 // Corners and edges are fixed by the faces that meet at that piece.
 const corners=[[0,54,9,63],[4,53,22,62],[8,67,35,49],[27,36,18,45],[13,44,31,71],[26,40,17,58]];
 const edges=[[1,57],[3,64],[6,51],[28,39],[21,37],[15,42],[12,55],[10,66],[33,69],[30,46],[19,48],[24,60]];
 for(const piece of [...corners,...edges]){
  const ns=piece.map(i=>normals[Math.floor(i/9)]);
  const common=solved.flatMap(s=>s.vertices).filter(v=>ns.every(n=>dot(v,n)===3));
  for(const i of piece){
   const candidates=solved.filter(s=>normalOf(s).every((v,k)=>v===normals[Math.floor(i/9)][k])&&!used.has(s.id)&&s.vertices.filter(v=>common.some(p=>p.every((x,k)=>x===v[k]))).length>=(piece.length===4?1:2));
   // Edges exclude corner stickers already assigned above.
   assert.equal(candidates.length,1,`reference facelet ${i}`);initial[i]=candidates[0].id;used.add(candidates[0].id);
  }
 }
 function complete(mapping){
  const start=mapping.indexOf(-1);if(start<0)return mapping;
  for(const candidate of solved.filter(s=>!mapping.includes(s.id)&&normalOf(s).every((v,k)=>v===normals[Math.floor(start/9)][k]))){
   const next=[...mapping],queue=[[start,candidate.id]];let valid=true;
   while(queue.length&&valid){
    const [ref,ours]=queue.shift();
    if(next[ref]!==-1){if(next[ref]!==ours)valid=false;continue;}
    if(next.includes(ours)||!normalOf(solved[ours]).every((v,k)=>v===normals[Math.floor(ref/9)][k])){valid=false;break;}
    next[ref]=ours;
    for(let m=0;m<16;m++)queue.push([referenceMoves[m][ref],geometricMoves[m][ours]]);
   }
   if(valid){const result=complete(next);if(result)return result;}
  }
 }
 const map=complete(initial);assert.ok(map,'csTimer and geometric sticker models must be isomorphic');return map;
}
const map=faceletMap();
function referenceColors(state){
 const byPosition=new Map(state.map(s=>[key(s),s.color]));
 const palette=normals.map(n=>FACES.findIndex(f=>f.normal.every((v,k)=>v===n[k])));
 return map.map(id=>palette.indexOf(byPosition.get(key(solved[id]))));
}

test('all sixteen csTimer face turns match exact simulator sticker permutations',()=>{
 for(let m=0;m<16;m++){
  for(let i=0;i<72;i++)assert.equal(map[referenceMoves[m][i]],geometricMoves[m][map[i]],`${names[m]} sticker ${i}`);
  assert.deepEqual(referenceColors(applyMove(solved,parseFtoScramble(names[m])[0])),Cubie.moveCube[m].toFaceCube());
 }
});

test('csTimer random-state scrambles reproduce the sampled states and their inverses solve them',()=>{
 const seen=new Set();
 for(let i=0;i<4;i++){
  const text=reference.getRandomScramble(),moves=parseFtoScramble(text),state=moves.reduce(applyMove,solved);
  // The upstream solver may finish in a globally rotated solved hold.
  // Its inverse reproduces the sampled state with that same color rotation.
  const colors=referenceColors(state);
  const palettes=Cubie.symCube.map(c=>c.toFaceCube().filter((_v,i)=>i%9===0));
  assert.ok(palettes.some(p=>colors.every((color,i)=>color===p[reference.sampledState[i]])),'scramble must match sampled state up to a proper global rotation');
  assert.ok(!isSolved(state));assert.ok(isSolved(moves.toReversed().map(inverse).reduce(applyMove,state)));
  seen.add(text);
 }
 assert.equal(seen.size,4);
});

test('scramble parser rejects empty, invalid, and unsupported wide/slice moves',()=>{
 for(const value of ['',null,'FTO Solver ERROR!','U Rw','U 2R','F2','U ?'])assert.throws(()=>parseFtoScramble(value));
});
