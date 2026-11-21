import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReplayPointerTimeline } from '../src/replay-pointer.js';
import { SolveRecorder, validateRecording } from '../src/solve-recording.js';
const pointer = (at, edge, x, y, pointerId = 1) => ({
  at,
  type: 'pointer',
  edge,
  x,
  y,
  pointerId,
  pointerType: 'touch',
});
test('replays exact sampled strokes, simultaneous contacts, release and backward seeking', () => {
  const timeline = new ReplayPointerTimeline({
    duration: 2000,
    events: [
      pointer(10, 'pointerdown', 0.1, 0.2),
      pointer(20, 'pointermove', 0.3, 0.5),
      pointer(30, 'pointerdown', 0.8, 0.7, 2),
      pointer(40, 'pointermove', 0.4, 0.2),
      pointer(50, 'pointerup', 0.4, 0.2),
    ],
  });
  assert.equal(timeline.frame(-1).length, 0);
  const contacts = timeline.frame(45);
  assert.equal(contacts.length, 2);
  assert.deepEqual(
    contacts[0].points.map(({ x, y }) => [x, y]),
    [
      [0.1, 0.2],
      [0.3, 0.5],
      [0.4, 0.2],
    ],
  );
  assert.equal(timeline.frame(200)[0].opacity, 0.5);
  assert.equal(timeline.frame(351).length, 1);
  assert.equal(timeline.frame(15)[0].points[0].x, 0.1);
  assert.equal(timeline.frame(2000).length, 0);
});
test('reset clears held fingers and legacy samples never invent a missing contact', () => {
  const timeline = new ReplayPointerTimeline({
    duration: 1000,
    events: [
      pointer(0, 'pointermove', 0.1, 0.2),
      pointer(10, 'pointerdown', 0.3, 0.4),
      { at: 20, type: 'reset-input' },
    ],
  });
  assert.equal(timeline.frame(5).length, 0);
  assert.equal(timeline.frame(15).length, 1);
  assert.equal(timeline.frame(20).length, 0);
});
test('preserves the gesture that starts the timer and coalesced sample offsets', () => {
  const input = (...args) => {
    const { at: _at, type: _type, ...data } = pointer(0, ...args);
    return data;
  };
  let now = 1000;
  const recorder = new SolveRecorder({}, () => now);
  recorder.arm({ size: 3, scramble: [], view: { rotation: [0, 0, 0, 1], radius: 10 } });
  recorder.event('pointer', input('pointerdown', 0.2, 0.3));
  recorder.event('pointer', input('pointermove', 0.4, 0.5));
  recorder.event('start');
  now = 1100;
  recorder.event('pointer', input('pointermove', 0.5, 0.6), -20);
  now = 1200;
  const data = recorder.finish(200, true);
  assert.equal(data.events.filter((e) => e.type === 'pointer').at(-1).at, 80);
  assert.equal(data.events.filter((e) => e.type === 'pointer').length, 3);
  assert.doesNotThrow(() => validateRecording(data));
});
test('keeps a timer-starting legacy tap but discards completed inspection gestures', async () => {
  const recorder = new SolveRecorder({}, () => 1000),
    options = { size: 3, scramble: [], view: { rotation: [0, 0, 0, 1], radius: 10 } };
  const input = (edge) => ({ edge, x: 0.2, y: 0.3, pointerId: 1, pointerType: 'mouse' });
  recorder.arm(options);
  recorder.event('pointer', input('pointerdown'));
  recorder.event('pointer', input('pointerup'));
  recorder.event('start');
  await Promise.resolve();
  assert.equal(recorder.attempt.events.filter((e) => e.type === 'pointer').length, 2);
  recorder.arm(options);
  recorder.event('pointer', input('pointerdown'));
  recorder.event('pointer', input('pointerup'));
  await Promise.resolve();
  recorder.event('start');
  assert.equal(recorder.attempt.events.filter((e) => e.type === 'pointer').length, 0);
});
