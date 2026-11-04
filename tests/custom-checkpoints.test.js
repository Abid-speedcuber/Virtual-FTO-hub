import test from 'node:test';
import assert from 'node:assert/strict';
import {ROTATIONS,PhaseTracker,phaseProfile} from '../src/solve-phases.js';
import {FACES,solvedState,applyMove,normalOf} from '../src/puzzle.js';
import {pieceGroups} from '../src/puzzle-viewer.js';
const rotate=(p,r)=>r.p.map((axis,i)=>p[axis]*r.s[i]);
const palette=r=>FACES.map(f=>FACES.findIndex(other=>other.normal.every((v,i)=>v===rotate(f.normal,r)[i])));

test('splits are off by default on every size; custom checkpoints are cumulative solved patterns',()=>{
 for(let size=2;size<=20;size++)assert.deepEqual(phaseProfile(size),{method:'off',phases:[]});
 const profile=phaseProfile(3,{method:'custom',phases:[{name:'Block',stickers:[2,1]},{name:'More',stickers:[3]},{name:'Finish',type:'finish'}]});
 assert.deepEqual(profile.phases.map(p=>p.type),['pattern','pattern','finish']);assert.deepEqual(profile.phases[1].stickers,[1,2,3]);
});

test('whole physical pieces have every sticker grouped together on all sizes',()=>{
 for(let size=2;size<=20;size++){
  const groups=pieceGroups(size),state=solvedState(size);assert.equal(groups.size,state.length);
  for(const [id,group] of groups){assert.ok([1,2,4].includes(group.length));assert.ok(group.includes(id));for(const other of group)assert.deepEqual(groups.get(other),group);}
 }
});

test('custom checkpoints accept every color-neutral scheme in every spatial pose',()=>{
 for(const size of [2,3,4]){
  const solved=solvedState(size),ids=solved.filter(s=>s.color===0).map(s=>s.id),profile=phaseProfile(size,{method:'custom',phases:[{name:'Face',stickers:ids}]});
  const unsolved=applyMove(solved,{normal:FACES[7].normal,layer:'outer',dir:1});
  for(const colors of ROTATIONS.map(palette))for(const pose of ROTATIONS){
   const state=unsolved.map(s=>({...s,color:colors[s.color],vertices:s.vertices.map(p=>rotate(p,pose))})),tracker=new PhaseTracker(size,profile);
   tracker.observe(state,100);assert.equal(tracker.next,1);assert.ok(tracker.colorAnchors.length>0);
   const restored=new PhaseTracker(size,profile,tracker.serialize());assert.deepEqual(restored.colorAnchors,tracker.colorAnchors);
  }
 }
});

test('later checkpoints cannot independently switch the color scheme selected by the first',()=>{
 const size=3,solved=solvedState(size),first=solved.filter(s=>s.color===0).map(s=>s.id),more=solved.filter(s=>s.color<2).map(s=>s.id);
 const profile=phaseProfile(size,{method:'custom',phases:[{name:'Anchor face',stickers:first},{name:'Adjacent face',stickers:more}]});
 const partial=(ids,colors)=>solved.map(s=>({...s,color:ids.includes(s.id)?colors[s.color]:s.id%8}));
 const firstColors=palette(ROTATIONS[0]),tracker=new PhaseTracker(size,profile);tracker.observe(partial(first,firstColors),100);
 assert.equal(tracker.next,1);assert.ok(tracker.colorAnchors?.length);
 const incompatible=ROTATIONS.map(palette).find(p=>p[0]!==firstColors[0]&&p[1]!==firstColors[0]);assert.ok(incompatible);
 const state=partial(more,incompatible),unlocked=new PhaseTracker(size,profile);unlocked.observe(state,200);assert.equal(unlocked.next,2);
 tracker.observe(state,200);assert.equal(tracker.next,1);
});

test('color neutrality preserves handed color relationships rather than accepting mirror schemes',()=>{
 const solved=solvedState(3),ids=solved.filter(s=>s.color<3).map(s=>s.id),profile=phaseProfile(3,{method:'custom',phases:[{name:'Three faces',stickers:ids}]});
 const mirrored=palette({p:[1,0,2],s:[1,1,1]}),state=solved.map(s=>({...s,color:ids.includes(s.id)?mirrored[s.color]:s.id%8}));
 const tracker=new PhaseTracker(3,profile);tracker.observe(state,100);assert.equal(tracker.next,0);
});
