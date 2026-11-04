import test from 'node:test';
import assert from 'node:assert/strict';
import {FtoScrambler} from '../src/fto-scramble.js';
function setup(){
 const workers=[];
 const pool=new FtoScrambler(()=>{
  const worker={requests:0,terminated:false,postMessage(){this.requests++;},terminate(){this.terminated=true;},reply(scramble){this.onmessage({data:{scramble}});},fail(){this.onerror();}};
  workers.push(worker);return worker;
 });
 return {pool,workers};
}

test('prepares one scramble, serves it immediately, and refills using the same worker',async()=>{
 const {pool,workers}=setup();pool.warm();pool.warm();
 assert.equal(workers.length,1);const worker=workers[0];assert.equal(worker.requests,1);
 assert.deepEqual(pool.status(),{ready:false,generating:true});worker.reply('U F');
 assert.deepEqual(pool.status(),{ready:true,generating:false});pool.warm();assert.equal(worker.requests,1);
 // No reply to the refill is needed to complete this request.
 const first=await pool.take();assert.equal(first[0].name,'U');assert.equal(worker.requests,2);
 assert.deepEqual(pool.status(),{ready:false,generating:true});worker.reply("R U'");
 const second=await pool.take();assert.notDeepEqual(second,first);assert.equal(workers.length,1);assert.equal(worker.requests,3);
 worker.reply('L F');assert.deepEqual(pool.status(),{ready:true,generating:false});
});

test('cancelled waits leave generation running and preserve its result for the next request',async()=>{
 const {pool,workers}=setup(),abort=new AbortController();pool.warm();
 const waiting=pool.take(abort.signal);abort.abort();await assert.rejects(waiting,{name:'AbortError'});
 assert.equal(workers[0].terminated,false);assert.equal(workers[0].requests,1);
 workers[0].reply('U R');const cached=pool.next;
 await assert.rejects(pool.take(abort.signal),{name:'AbortError'});assert.equal(pool.next,cached);
 assert.equal(await pool.take(),cached);assert.equal(workers[0].requests,2);
 workers[0].reply('F L');
});

test('concurrent consumers get distinct scrambles without overlapping worker jobs',async()=>{
 const {pool,workers}=setup(),one=pool.take(),two=pool.take();assert.equal(workers[0].requests,1);
 workers[0].reply('U F');const first=await one;assert.equal(workers[0].requests,2);
 workers[0].reply('R L');const second=await two;assert.notDeepEqual(first,second);assert.equal(workers[0].requests,3);
 workers[0].reply('B D');
});

test('background failures are recoverable and foreground failures reject without a random-move fallback',async()=>{
 const {pool,workers}=setup();pool.warm();workers[0].fail();await Promise.resolve();
 assert.equal(workers[0].terminated,true);assert.deepEqual(pool.status(),{ready:false,generating:false});
 const retry=pool.take();assert.equal(workers.length,2);workers[1].reply('invalid');await assert.rejects(retry,/Invalid FTO/);
 const success=pool.take();workers[2].reply('U F');assert.equal((await success).length,2);assert.equal(workers[2].requests,2);
 workers[2].reply('R L');
});

test('a synchronous worker startup/send failure can be retried',async()=>{
 let attempts=0;
 const pool=new FtoScrambler(()=>{attempts++;if(attempts===1)throw Error('Cannot create');return {postMessage(){throw Error('Cannot send');},terminate(){}};});
 await assert.rejects(pool.take(),/Cannot create/);await assert.rejects(pool.take(),/Cannot send/);
 assert.deepEqual(pool.status(),{ready:false,generating:false});
});
