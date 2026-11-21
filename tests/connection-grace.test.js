import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionGrace, isConnectionError } from '../src/connection-grace.js';
function fakeClock() {
  let time = 0,
    next = 0;
  const tasks = new Map();
  return {
    now: () => time,
    schedule: (fn, delay) => {
      const id = ++next;
      tasks.set(id, { fn, at: time + delay });
      return id;
    },
    cancel: (id) => tasks.delete(id),
    advance: (ms) => {
      time += ms;
      for (const [id, t] of [...tasks]) if (t.at <= time && tasks.delete(id)) t.fn();
    },
    jump: (ms) => (time += ms),
  };
}
test('a 400ms interruption preserves the sequence and releases waiting results', async () => {
  const clock = fakeClock();
  let online = false,
    expired = 0;
  const c = new ConnectionGrace({ ...clock, online: () => online, onExpired: () => expired++ });
  c.offline();
  const waiting = c.wait();
  clock.advance(400);
  online = true;
  c.online();
  assert.equal(await waiting, true);
  clock.advance(6000);
  assert.equal(expired, 0);
});
test('exactly five seconds expires once; repeated offline events cannot extend the deadline', async () => {
  const clock = fakeClock();
  let expired = 0;
  const c = new ConnectionGrace({ ...clock, online: () => false, onExpired: () => expired++ });
  c.offline();
  const waiting = c.wait();
  clock.advance(4000);
  c.offline();
  clock.advance(999);
  assert.equal(expired, 0);
  clock.advance(1);
  assert.equal(await waiting, false);
  assert.equal(expired, 1);
  clock.advance(6000);
  c.offline();
  assert.equal(expired, 1);
});
test('a throttled timeout cannot hide a long disconnect when the online event arrives', () => {
  const clock = fakeClock();
  let expired = 0;
  const c = new ConnectionGrace({ ...clock, online: () => true, onExpired: () => expired++ });
  c.offline();
  clock.jump(6000);
  assert.equal(c.online(), false);
  assert.equal(expired, 1);
});
test('connection retries exclude permission, validation and quota errors', () => {
  for (const message of [
    'TypeError: Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'fetch failed',
    'Load failed',
  ])
    assert.ok(isConnectionError(Error(message)));
  for (const message of [
    'Recording storage is temporarily full',
    'Too many attempts',
    'Invalid solve time',
    'Administrator access required',
  ])
    assert.equal(isConnectionError(Error(message)), false);
});
