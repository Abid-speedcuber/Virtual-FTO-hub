import test from 'node:test';
import assert from 'node:assert/strict';
import {OnlineAttempts} from '../src/network.js';
function setup(){let online=true,profile={id:'user',username:'Abid'},next=0;const calls=[],messages=[];const network=new OnlineAttempts({rpc:async(name,args)=>{calls.push({name,args});return name==='begin_attempt'?'ticket-'+calls.length:{dnf:!args.replay||args.replay.usedUndo,submitted:[]};},getProfile:()=>profile,online:()=>online,id:()=>`session-${++next}`,status:text=>messages.push(text)});return {network,calls,messages,setOnline:value=>online=value,setProfile:value=>profile=value};}
const replay={size:3,solveMs:1000,events:[]};
test('only signed-in online 3x3 attempts are submitted, never local historical PBs',async()=>{
 for(const size of [2,3,4]){const s=setup();s.network.arm(size);s.network.start();await s.network.finish({...replay,size});assert.equal(s.calls.length,size===3?2:0);}
 const s=setup();s.setProfile(null);s.network.arm(3);s.network.start();await s.network.finish(replay);assert.equal(s.calls.length,0);
 await s.network.finish(replay);assert.equal(s.calls.length,0);
});
test('undo is permanent eligibility evidence even if followed by redo',async()=>{
 const s=setup();s.network.arm(3);s.network.start();s.network.markUndo();await s.network.finish(replay);
 assert.equal(s.calls[1].args.replay.usedUndo,true);assert.equal(s.calls[1].args.replay.solver.username,'Abid');assert.equal(replay.usedUndo,undefined);
});
test('abandoned online attempts submit DNF rather than disappearing from average windows',async()=>{
 const s=setup();s.network.arm(3);s.network.start();await s.network.finish(null);assert.equal(s.calls[1].args.replay,null);
});
test('offline gaps invalidate an attempt and start a fresh average sequence',async()=>{
 const s=setup();s.network.arm(3);s.network.start();await s.network.queue;const sequence=s.network.sequence;
 s.setOnline(false);s.network.invalidate();s.setOnline(true);await s.network.finish(replay);
 assert.equal(s.calls[1].args.replay,null);assert.notEqual(s.network.sequence,sequence);
 s.network.arm(3);s.network.start();await s.network.finish(replay);assert.notEqual(s.calls[0].args.session,s.calls[2].args.session);
});
test('sign-out invalidates the old account without submitting as another solver',async()=>{
 const s=setup();s.network.arm(3);s.network.start();await s.network.queue;s.setProfile({id:'other',username:'Other'});s.network.accountChanged();await s.network.finish(replay);assert.equal(s.calls.length,1);
});
test('token refresh for the same account does not break eligibility',async()=>{
 const s=setup();s.network.arm(3);s.network.start();s.setProfile({id:'user',username:'Abid'});s.network.accountChanged();await s.network.finish(replay);assert.ok(s.calls[1].args.replay);
});
test('rapid solves preserve server ordering and retain their own recording snapshots',async()=>{
 const s=setup();s.network.arm(3);s.network.start();const first=s.network.finish({...replay,solveMs:2000});s.network.arm(3);s.network.start();const second=s.network.finish({...replay,solveMs:3000});await Promise.all([first,second]);assert.deepEqual(s.calls.map(c=>c.name),['begin_attempt','finish_attempt','begin_attempt','finish_attempt']);assert.deepEqual(s.calls.filter(c=>c.name==='finish_attempt').map(c=>c.args.replay.solveMs),[2000,3000]);
});
test('offline results are never replayed on reconnect',async()=>{
 const s=setup();s.network.arm(3);s.network.start();await s.network.queue;s.setOnline(false);await s.network.finish(replay);s.setOnline(true);await s.network.queue;assert.equal(s.calls.length,1);
});
test('a failed request breaks the sequence and does not cause an unhandled rejection',async()=>{
 let next=0;const s=new OnlineAttempts({rpc:async()=>{throw Error('offline');},getProfile:()=>({id:'u'}),online:()=>true,id:()=>String(++next)});s.arm(3);s.start();await s.finish(replay);assert.ok(next>1);
});

test('signing in during inspection qualifies when the actual solve starts online',async()=>{
 const s=setup();s.setProfile(null);s.network.arm(3);s.setProfile({id:'user',username:'Abid'});s.network.accountChanged();s.network.start();await s.network.finish(replay);assert.equal(s.calls.length,2);assert.equal(s.calls[1].args.replay.solver.username,'Abid');
});
