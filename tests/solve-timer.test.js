import test from 'node:test';
import assert from 'node:assert/strict';
import {SolveTimer,formatTime} from '../src/solve-timer.js';
test('free play is dormant; only a completed computer scramble arms timing',()=>{
 let now=0;const timer=new SolveTimer({},()=>now);assert.equal(timer.start(),false);now=5000;assert.equal(timer.elapsed(),0);assert.equal(timer.finish(),false);
 timer.scramble();now=10000;assert.equal(timer.start(),false);timer.arm();now=20000;assert.equal(timer.elapsed(),0);assert.equal(timer.status,'ready');assert.equal(timer.start(),true);
 now=21234;assert.equal(timer.elapsed(),1234);assert.equal(timer.finish(),true);assert.equal(timer.bestMs,1234);assert.equal(timer.completed,1);assert.equal(timer.finish(),false);
});
test('leaving and reloading excludes away time and resumes the same attempt',()=>{
 let now=0;const timer=new SolveTimer({},()=>now);timer.scramble();timer.arm();timer.start();now=1500;timer.pause();now=90000;assert.equal(timer.elapsed(),1500);
 const loaded=new SolveTimer(timer.serialize(),()=>now);assert.equal(loaded.status,'paused');loaded.resume();now=91000;loaded.finish();assert.equal(loaded.lastMs,2500);assert.equal(loaded.bestMs,2500);
});
test('running checkpoints restore paused and do not include time spent offline',()=>{
 let now=100;const timer=new SolveTimer({},()=>now);timer.scramble();timer.arm();timer.start();now=900;
 const saved=timer.serialize();assert.equal(saved.status,'paused');now=100000;const loaded=new SolveTimer(saved,()=>now);loaded.resume();now=100100;assert.equal(loaded.elapsed(),900);
});
test('PBs survive reset and new attempts, and only improve on a faster finish',()=>{
 let now=0;const timer=new SolveTimer({},()=>now);
 for(const duration of [3000,4000,2000]){timer.scramble();timer.arm();timer.start();now+=duration;timer.finish();}
 assert.equal(timer.bestMs,2000);assert.equal(timer.completed,3);timer.reset();assert.equal(timer.status,'idle');assert.equal(timer.bestMs,2000);
 const anotherSize=new SolveTimer();assert.equal(anotherSize.bestMs,null);
});
test('timer formatting uses centiseconds, minutes, and dormant records',()=>{
 assert.equal(formatTime(null),'—');assert.equal(formatTime(0),'0.00');assert.equal(formatTime(12345),'12.34');assert.equal(formatTime(61230),'1:01.23');
});

test('a final accepted turn may complete while away without resuming or adding away time',()=>{
 let now=0;const timer=new SolveTimer({},()=>now);timer.scramble();timer.arm();timer.start();now=1200;timer.pause();now=50000;
 assert.equal(timer.finish(),true);assert.equal(timer.bestMs,1200);assert.equal(timer.resume(),false);assert.equal(timer.elapsed(),1200);
});
