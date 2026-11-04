import test from 'node:test';
import assert from 'node:assert/strict';
import {PhaseTracker,phaseProfile,profileKey,trackedBest,splitRows,builtinPatterns,detectBuiltin,ROTATIONS} from '../src/solve-phases.js';
import {solvedState,applyMove,selected,inverse,FACES} from '../src/puzzle.js';
import {SolveTimer} from '../src/solve-timer.js';
const same=(a,b)=>a.every((v,i)=>v===b[i]);
const identity=ROTATIONS.findIndex(r=>same(r.p,[0,1,2])&&same(r.s,[1,1,1]));
function setup(){const {variants,families}=builtinPatterns(),anchor=variants.findIndex(v=>v.rotation===identity),variant=variants[anchor],axes=families[variant.family].axes;return {anchor,variant,U:axes[variant.up].normal,R:axes[variant.center].normal.map(v=>-v)};}
const move=(normal,dir=1,layer='outer')=>({normal,dir,layer});

test('automatic reduction masks contain a center and two triples, then the completed bottom triples and aligned centers',()=>{
 const {variants}=builtinPatterns();assert.equal(variants.length,576);
 for(const variant of variants){assert.equal(variant.first.length,21);assert.equal(variant.lower.length,54);}
 const {variant,U,R,anchor}=setup();const state=solvedState(3);
 for(const normal of [U,R])for(const layer of normal===R?['outer','wide']:['outer'])assert.ok(variant.first.every(([id])=>!selected(state[id],move(normal,1,layer))));
 const scrambled=[move(R),move(U),move(R,1,'wide'),move(U,-1),move(R,-1)].reduce(applyMove,state);
 assert.equal(detectBuiltin(scrambled,anchor).stage,1);
 // The working U layer still contains the missing bottom triple.
 assert.equal(detectBuiltin(applyMove(state,move(U)),anchor).stage,2);
});

test('first block detection remains valid under every whole-puzzle rotation',()=>{
 const {U,R,anchor}=setup(),state=[move(R),move(U),move(R,-1)].reduce(applyMove,solvedState(3));
 for(const r of ROTATIONS){const rotated=state.map(s=>({...s,vertices:s.vertices.map(p=>r.p.map((axis,i)=>p[axis]*r.s[i]))}));assert.ok(detectBuiltin(rotated).stage>=1);assert.ok(detectBuiltin(rotated,anchor).stage>=1);}
});

test('cancellation or simultaneous milestones produce combined segments, never invented zeros',()=>{
 const {U}=setup(),tracker=new PhaseTracker(3,phaseProfile(3,{method:'bencisco'}));
 tracker.observe(applyMove(solvedState(3),move(U)),1200);
 assert.deepEqual(tracker.groups.map(g=>[g.start,g.end,g.ms,g.kind]),[[0,1,1200,'combined']]);
 tracker.observe(solvedState(3),1800,{finished:true});const rows=splitRows(tracker,1800);
 assert.equal(rows.length,2);assert.equal(rows[0].ms,1200);assert.equal(rows[1].ms,600);assert.ok(rows[0].name.includes('E centers'));
});

test('custom checkpoint progress works on every size and survives reload',()=>{
 for(let size=2;size<=20;size++){
  const profile=phaseProfile(size,{method:'custom',phases:[{name:'Build',type:'pattern'},{name:'Face',type:'pattern',stickers:[0,1]}]});
  const tracker=new PhaseTracker(size,profile);assert.equal(tracker.profile.phases.length,3);
  assert.equal(tracker.groups.length,0);
  tracker.record(0,500);const loaded=new PhaseTracker(size,profile,tracker.serialize());assert.equal(loaded.next,1);
  // Last layer / finish wins over any unresolved custom goals.
  loaded.observe(solvedState(size),1200,{finished:true});assert.equal(loaded.complete,true);assert.equal(loaded.groups.at(-1).kind,'combined');
 }
});

test('sticker patterns are color goals, rotation invariant, and reject incorrect colors',()=>{
 const profile=phaseProfile(4,{method:'custom',phases:[{name:'U face',type:'pattern',stickers:Array.from({length:16},(_,i)=>i)}]});
 for(const r of ROTATIONS){
  const state=solvedState(4).map(s=>({...s,vertices:s.vertices.map(p=>r.p.map((axis,i)=>p[axis]*r.s[i]))}));
  const tracker=new PhaseTracker(4,profile);tracker.observe(state,0,{initial:true});assert.equal(tracker.next,1);
 }
 const broken=solvedState(4).map(s=>({...s,color:(s.color+s.id)%8}));const tracker=new PhaseTracker(4,profile);tracker.observe(broken,100);assert.equal(tracker.next,0);
});

test('PB reference is the fastest run with identical phase definitions, including combined ranges',()=>{
 const profile=phaseProfile(3,{method:'custom',phases:[{name:'Build',type:'pattern'},{name:'Finish pair',type:'pattern'}]});
 const tracker=new PhaseTracker(3,profile);tracker.record(0,1000);tracker.record(1,2000);tracker.record(2,3000);
 const entry={ms:3000,splitData:tracker.serialize()},other={ms:1000,splitData:{...tracker.serialize(),profile:phaseProfile(3,{method:'nautilus'})}};
 assert.equal(trackedBest([other,entry,{ms:2000}],profile),entry);
 const current=new PhaseTracker(3,profile);current.arm(solvedState(3),[entry]);current.record(1,1700);current.record(2,2800);
 const rows=splitRows(current,2800);assert.equal(rows[0].delta,-300);assert.equal(rows[1].delta,100);assert.equal(rows[1].totalDelta,-200);
 const saved=new PhaseTracker(3,profile,current.serialize());assert.deepEqual(saved.serialize(),current.serialize());assert.equal(profileKey(saved.profile),profileKey(profile));
});

test('timer records split data without losing old times, and uses final accepted turn time',()=>{
 let now=0;const timer=new SolveTimer({},()=>now),tracker=new PhaseTracker(3,phaseProfile(3,{method:'custom',phases:[{name:'Build',type:'pattern'}]}));
 timer.scramble();timer.arm();timer.start();now=500;tracker.record(0,500);now=1200;tracker.observe(solvedState(3),1100,{finished:true});timer.finish(tracker.serialize(),1100);
 const loaded=new SolveTimer(timer.serialize());assert.equal(loaded.times[0].ms,1100);assert.deepEqual(loaded.times[0].splitData,tracker.serialize());assert.equal(loaded.bestMs,1100);
 const serialized=loaded.serialize();serialized.times[0].splitData.groups[0].ms=9999;assert.equal(loaded.times[0].splitData.groups[0].ms,500);
});


test('undo keeps earlier checkpoints while an algorithm temporarily disrupts their block',()=>{
 const tracker=new PhaseTracker(3,phaseProfile(3,{method:'nautilus'}));
 tracker.turnIndex=10;tracker.record(0,1000);tracker.turnIndex=30;tracker.record(1,3000);
 const broken=[move([1,1,1]),move([1,1,-1]),move([-1,1,1])].reduce(applyMove,solvedState(3));
 tracker.rewind(broken,5000,{turnIndex:45});assert.deepEqual(tracker.groups.map(g=>g.ms),[1000,3000]);
 tracker.rewind(broken,5500,{turnIndex:20});assert.equal(tracker.groups[0].ms,1000);assert.ok(!tracker.groups.some(g=>g.ms===3000));
});

test('checkpoint boundaries are removed only if their checkpoint move is undone',()=>{
 const tracker=new PhaseTracker(4,phaseProfile(4,{method:'custom',phases:[{name:'Build',type:'pattern'}]}));
 tracker.turnIndex=8;tracker.record(0,1000);const state=applyMove(solvedState(4),move(FACES[0].normal));
 tracker.rewind(state,2000,{turnIndex:12});assert.equal(tracker.groups[0].ms,1000);
 tracker.rewind(state,3000,{turnIndex:7});assert.equal(tracker.groups.length,0);
});

test('Nautilus author checkpoints are detected independently, including its different last slot',async()=>{
 const {readFile}=await import('node:fs/promises');
 const fixture=JSON.parse(await readFile(new URL('./fixtures/nautilus-author-goals.json',import.meta.url),'utf8'));
 const states=fixture.checkpoints.map(goal=>solvedState(3).map((s,i)=>({...s,color:goal.colors[i]})));
 assert.deepEqual(states.map(s=>detectBuiltin(s,null,'nautilus').stage),[1,2,3]);
 assert.equal(detectBuiltin(states[2],null,'bencisco').stage,2);
 const tracker=new PhaseTracker(3,phaseProfile(3,{method:'nautilus'}));
 states.forEach((s,i)=>tracker.observe(s,(i+1)*1000,{turnIndex:(i+1)*10}));
 assert.deepEqual(tracker.groups.map(g=>[g.start,g.end,g.ms]),[[0,0,1000],[1,1,2000],[2,2,3000]]);
});

test('author checkpoints support white and every other first-center color in every physical pose',async()=>{
 const {readFile}=await import('node:fs/promises');
 const fixture=JSON.parse(await readFile(new URL('./fixtures/nautilus-author-goals.json',import.meta.url),'utf8'));
 const goals=fixture.checkpoints.map(goal=>solvedState(3).map((s,i)=>({...s,color:goal.colors[i]})));
 const found=detectBuiltin(goals[0],null,'nautilus'),{variants,families}=builtinPatterns(),v=variants[found.anchor];
 const centerNormal=families[v.family].axes[v.center].normal,centerColor=FACES.findIndex(f=>same(f.normal,centerNormal));
 const palettes=new Map();
 for(const r of ROTATIONS){const palette=FACES.map(f=>FACES.findIndex(other=>same(other.normal,r.p.map((axis,i)=>f.normal[axis]*r.s[i]))));palettes.set(palette[centerColor],palette);}
 assert.equal(palettes.size,8);assert.ok(palettes.has(0));
 for(const [firstColor,palette]of palettes)for(const r of ROTATIONS){
  const tracker=new PhaseTracker(3,phaseProfile(3,{method:'nautilus'}));
  goals.forEach((state,i)=>{
   const changed=state.map(s=>({...s,color:s.color<0?-1:palette[s.color],vertices:s.vertices.map(p=>r.p.map((axis,j)=>p[axis]*r.s[j]))}));
   tracker.observe(changed,(i+1)*1000,{turnIndex:i+1});
   assert.equal(tracker.next,i+1,`color ${firstColor}, checkpoint ${i+1}`);
  });
 }
});

test('old automatic traces and full-run combined totals cannot become split PB references',()=>{
 const profile=phaseProfile(3,{method:'nautilus'}),tracker=new PhaseTracker(3,profile);
 tracker.record(0,1000);tracker.record(3,4000);const valid={ms:4000,splitData:tracker.serialize()};
 const old={ms:2000,splitData:{...tracker.serialize(),detectorVersion:1}},combined=new PhaseTracker(3,profile);combined.record(3,1000);
 assert.equal(trackedBest([old,{ms:1000,splitData:combined.serialize()},valid],profile),valid);
});


test('legal setups from the author distinguish center solving, last triple, and last layer including AUF',async()=>{
 const {readFile}=await import('node:fs/promises');
 const fixture=JSON.parse(await readFile(new URL('./fixtures/nautilus-author-goals.json',import.meta.url),'utf8'));
 for(const example of fixture.legalExamples){
  const state=solvedState(3).map((s,i)=>({...s,color:example.colors[i]}));
  assert.equal(detectBuiltin(state,null,'nautilus').stage,example.expectedStage,example.setup);
 }
});

test('accepted-turn diagnostics survive checkpoints but are excluded from historical time records',()=>{
 const tracker=new PhaseTracker(3,phaseProfile(3,{method:'nautilus'}));
 tracker.observe(applyMove(solvedState(3),move(FACES[0].normal)),1000,{turnIndex:12});
 assert.equal(tracker.serialize().samples,undefined);
 assert.equal(tracker.serialize({diagnostics:true}).samples[0].turnIndex,12);
 const restored=new PhaseTracker(3,tracker.profile,tracker.serialize({diagnostics:true}));
 assert.deepEqual(restored.serialize({diagnostics:true}),tracker.serialize({diagnostics:true}));
});
