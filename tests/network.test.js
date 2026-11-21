import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineAttempts } from '../src/network.js';
function setup() {
  let online = true,
    profile = { id: 'user', username: 'Abid' },
    next = 0;
  const calls = [],
    messages = [];
  const network = new OnlineAttempts({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return name === 'begin_attempt'
        ? 'ticket-' + calls.length
        : { dnf: !args.replay || args.replay.usedUndo, submitted: [] };
    },
    getProfile: () => profile,
    online: () => online,
    id: () => `session-${++next}`,
    status: (text) => messages.push(text),
  });
  return {
    network,
    calls,
    messages,
    setOnline: (value) => (online = value),
    setProfile: (value) => (profile = value),
  };
}
const replay = { size: 3, solveMs: 1000, events: [] };
test('only signed-in online 3x3 attempts are submitted, never local historical PBs', async () => {
  for (const size of [2, 3, 4]) {
    const s = setup();
    s.network.arm(size);
    s.network.start();
    await s.network.finish({ ...replay, size });
    assert.equal(s.calls.length, size === 3 ? 2 : 0);
  }
  const s = setup();
  s.setProfile(null);
  s.network.arm(3);
  s.network.start();
  await s.network.finish(replay);
  assert.equal(s.calls.length, 0);
  await s.network.finish(replay);
  assert.equal(s.calls.length, 0);
});
test('undo is permanent eligibility evidence even if followed by redo', async () => {
  const s = setup();
  s.network.arm(3);
  s.network.start();
  s.network.markUndo();
  await s.network.finish(replay);
  assert.equal(s.calls[1].args.replay.usedUndo, true);
  assert.equal(s.calls[1].args.replay.solver.username, 'Abid');
  assert.equal(replay.usedUndo, undefined);
});
test('abandoned online attempts submit DNF rather than disappearing from average windows', async () => {
  for (const recording of [null, { ...replay, dnf: true }]) {
    const s = setup();
    s.network.arm(3);
    s.network.start();
    await s.network.finish(recording);
    assert.equal(s.calls[1].args.replay, null);
  }
});
test('offline gaps invalidate an attempt and start a fresh average sequence', async () => {
  const s = setup();
  s.network.arm(3);
  s.network.start();
  await s.network.queue;
  const sequence = s.network.sequence;
  s.setOnline(false);
  s.network.invalidate();
  s.setOnline(true);
  await s.network.finish(replay);
  assert.equal(s.calls[1].args.replay, null);
  assert.notEqual(s.network.sequence, sequence);
  s.network.arm(3);
  s.network.start();
  await s.network.finish(replay);
  assert.notEqual(s.calls[0].args.session, s.calls[2].args.session);
});
test('sign-out invalidates the old account without submitting as another solver', async () => {
  const s = setup();
  s.network.arm(3);
  s.network.start();
  await s.network.queue;
  s.setProfile({ id: 'other', username: 'Other' });
  s.network.accountChanged();
  await s.network.finish(replay);
  assert.equal(s.calls.length, 1);
});
test('token refresh for the same account does not break eligibility', async () => {
  const s = setup();
  s.network.arm(3);
  s.network.start();
  s.setProfile({ id: 'user', username: 'Abid' });
  s.network.accountChanged();
  await s.network.finish(replay);
  assert.ok(s.calls[1].args.replay);
});
test('rapid solves preserve server ordering and retain their own recording snapshots', async () => {
  const s = setup();
  s.network.arm(3);
  s.network.start();
  const first = s.network.finish({ ...replay, solveMs: 2000 });
  s.network.arm(3);
  s.network.start();
  const second = s.network.finish({ ...replay, solveMs: 3000 });
  await Promise.all([first, second]);
  assert.deepEqual(
    s.calls.map((c) => c.name),
    ['begin_attempt', 'record_online_attempt', 'begin_attempt', 'record_online_attempt'],
  );
  assert.deepEqual(
    s.calls.filter((c) => c.name === 'record_online_attempt').map((c) => c.args.replay.solveMs),
    [2000, 3000],
  );
});
test('offline results are never replayed on reconnect', async () => {
  const s = setup();
  s.network.arm(3);
  s.network.start();
  await s.network.queue;
  s.setOnline(false);
  await s.network.finish(replay);
  s.setOnline(true);
  await s.network.queue;
  assert.equal(s.calls.length, 1);
});
test('a failed request breaks the sequence and does not cause an unhandled rejection', async () => {
  let next = 0;
  const s = new OnlineAttempts({
    rpc: async () => {
      throw Error('offline');
    },
    getProfile: () => ({ id: 'u' }),
    online: () => true,
    id: () => String(++next),
  });
  s.arm(3);
  s.start();
  await s.finish(replay);
  assert.ok(next > 1);
});

test('signing in during inspection qualifies when the actual solve starts online', async () => {
  const s = setup();
  s.setProfile(null);
  s.network.arm(3);
  s.setProfile({ id: 'user', username: 'Abid' });
  s.network.accountChanged();
  s.network.start();
  await s.network.finish(replay);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[1].args.replay.solver.username, 'Abid');
});

test('PB recording prepares candidates; only the explicit submit call enters the review queue', async () => {
  const calls = [],
    rows = [],
    messages = [],
    profile = { id: 'user' };
  let resolveSubmit;
  const network = new OnlineAttempts({
    getProfile: () => profile,
    status: (m) => messages.push(m),
    onCandidates: (c) => rows.push(c),
    online: () => true,
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'begin_attempt') return 'attempt';
      if (name === 'record_online_attempt')
        return {
          dnf: false,
          candidates: [{ id: 'pb', metric: 'single', ms: 1000, evidence_complete: true }],
        };
      if (name === 'submit_leaderboard')
        return new Promise((resolve) => {
          resolveSubmit = resolve;
        });
    },
  });
  network.arm(3);
  network.start();
  await network.finish(replay);
  assert.deepEqual(
    calls.map((c) => c.name),
    ['begin_attempt', 'record_online_attempt'],
  );
  assert.equal(rows.at(-1)[0].id, 'pb');
  assert.equal(rows.at(-1)[0].busy, false);
  const a = network.submit('pb'),
    b = network.submit('pb');
  assert.equal(a, b);
  await Promise.resolve();
  assert.equal(calls.filter((c) => c.name === 'submit_leaderboard').length, 1);
  assert.equal(rows.at(-1)[0].busy, true);
  resolveSubmit({ status: 'pending' });
  await a;
  assert.deepEqual(rows.at(-1), []);
  assert.match(messages.at(-1), /administrator approval/);
});
test('undo PBs show the invalid result without sending a submission', async () => {
  const messages = [],
    calls = [];
  const network = new OnlineAttempts({
    getProfile: () => ({ id: 'u' }),
    online: () => true,
    status: (m) => messages.push(m),
    rpc: async (name, args) => {
      calls.push(name);
      return name === 'begin_attempt' ? 'ticket' : { dnf: true, invalid_pb: true, candidates: [] };
    },
  });
  network.arm(3);
  network.start();
  network.markUndo();
  await network.finish(replay, { localPB: true });
  assert.match(messages.at(-1), /PB solve is invalid.*undo/);
  assert.equal(calls.includes('submit_leaderboard'), false);
});
test('old backend failures never fall back to an auto-submitting RPC', async () => {
  const calls = [],
    messages = [];
  const network = new OnlineAttempts({
    getProfile: () => ({ id: 'u' }),
    online: () => true,
    status: (m) => messages.push(m),
    rpc: async (name) => {
      calls.push(name);
      if (name === 'begin_attempt') return 'ticket';
      throw Error('Could not find public.record_online_attempt');
    },
  });
  network.arm(3);
  network.start();
  await network.finish(replay);
  assert.deepEqual(calls, ['begin_attempt', 'record_online_attempt']);
  assert.match(messages.at(-1), /unavailable.*backend update.*saved on this device/);
});
test('account changes clear PB actions and ignore a stale candidate response', async () => {
  let profile = { id: 'first' },
    resolve;
  const rows = [];
  const network = new OnlineAttempts({
    getProfile: () => profile,
    online: () => true,
    onCandidates: (r) => rows.push(r),
    rpc: async () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const load = network.loadCandidates();
  profile = { id: 'second' };
  network.accountChanged();
  resolve([{ id: 'private', metric: 'single', ms: 100, evidence_complete: true }]);
  await load;
  assert.deepEqual(rows.at(-1), []);
});

test('a local undo PB still explains its ineligibility without an online ticket', async () => {
  const messages = [];
  const network = new OnlineAttempts({
    getProfile: () => null,
    online: () => true,
    rpc: async () => {
      throw Error('No network request should be sent');
    },
    status: (m) => messages.push(m),
  });
  network.arm(3);
  network.markUndo();
  await network.finish({ ...replay, usedUndo: true }, { localPB: true });
  assert.match(messages.at(-1), /PB solve is invalid.*undo/);
});

test('timer-only legacy averages never expose a submit action', async () => {
  const calls = [],
    snapshots = [];
  const network = new OnlineAttempts({
    getProfile: () => ({ id: 'u' }),
    online: () => true,
    onCandidates: (rows) => snapshots.push(rows),
    rpc: async (name, args) => {
      calls.push(name);
      if (name === 'begin_attempt') return 'ticket';
      if (name === 'record_online_attempt')
        return {
          candidates: [
            { id: 'legacy', metric: 'ao5', ms: 1000 },
            { id: 'complete', metric: 'single', ms: 1200, evidence_complete: true },
          ],
        };
      if (name === 'my_leaderboard_candidates')
        return [{ id: 'legacy', metric: 'ao12', ms: 1000, evidence_complete: false }];
    },
  });
  network.arm(3);
  network.start();
  await network.finish(replay);
  assert.deepEqual(
    snapshots.at(-1).map((row) => row.id),
    ['complete'],
  );
  await network.submit('legacy');
  assert.equal(calls.includes('submit_leaderboard'), false);
  await network.loadCandidates();
  assert.deepEqual(snapshots.at(-1), []);
});

test('skipped inspections add one hidden online DNF and preserve request ordering', async () => {
  const s = setup();
  s.network.arm(3);
  s.network.start();
  const first = s.network.finish(replay);
  s.network.arm(3);
  const skipped = s.network.skip();
  s.network.arm(3);
  s.network.start();
  const last = s.network.finish(replay);
  await Promise.all([first, skipped, last]);
  assert.deepEqual(
    s.calls.map((c) => c.name),
    [
      'begin_attempt',
      'record_online_attempt',
      'skip_online_scramble',
      'begin_attempt',
      'record_online_attempt',
    ],
  );
  assert.equal(s.calls[0].args.session, s.calls[2].args.session);
  assert.equal(s.calls[2].args.session, s.calls[3].args.session);
  await s.network.skip();
  assert.equal(s.calls.length, 5, 'Reset then rescramble does not count the same skip twice');
});
test('only a signed-in online 3x3 inspection creates a hidden DNF', async () => {
  for (const mode of ['offline', 'anonymous', 'other-size', 'started']) {
    const s = setup();
    if (mode === 'offline') s.setOnline(false);
    if (mode === 'anonymous') s.setProfile(null);
    s.network.arm(mode === 'other-size' ? 4 : 3);
    if (mode === 'started') {
      s.network.start();
      await s.network.queue;
    }
    const before = s.calls.length;
    await s.network.skip();
    assert.equal(s.calls.length, before, mode);
  }
});
test('failed skip reporting breaks averages instead of silently ignoring the skipped scramble', async () => {
  let n = 0;
  const messages = [];
  const network = new OnlineAttempts({
    getProfile: () => ({ id: 'u' }),
    online: () => true,
    id: () => String(++n),
    status: (m) => messages.push(m),
    rpc: async () => {
      throw Error('Disconnected');
    },
  });
  const sequence = network.sequence;
  network.arm(3);
  await network.skip();
  assert.notEqual(network.sequence, sequence);
  assert.match(messages.at(-1), /new sequence/);
});
test('new eligible solves replace stale candidates even when deliberately slower than pending', async () => {
  let result = {
    id: 'old',
    metric: 'single',
    ms: 40330,
    evidence_complete: true,
    pending_ms: 32980,
  };
  const rows = [];
  const network = new OnlineAttempts({
    getProfile: () => ({ id: 'u' }),
    online: () => true,
    onCandidates: (r) => rows.push(r),
    rpc: async (name) =>
      name === 'begin_attempt'
        ? 'ticket'
        : name === 'my_leaderboard_candidates'
          ? [result]
          : { candidates: [result] },
  });
  await network.loadCandidates();
  result = { ...result, id: 'new', ms: 32750 };
  network.arm(3);
  network.start();
  await network.finish({ ...replay, solveMs: 32750 });
  assert.equal(rows.at(-1)[0].ms, 32750);
  result = { ...result, id: 'proud', ms: 40000 };
  network.arm(3);
  network.start();
  await network.finish({ ...replay, solveMs: 40000 });
  assert.equal(rows.at(-1)[0].ms, 40000);
});
test('missing online tickets explain ineligibility instead of silently leaving an old result', async () => {
  const s = setup();
  await s.network.finish(replay);
  assert.match(s.messages.at(-1), /no online start record/);
  assert.equal(s.calls.length, 0);
});
test('a solve queued behind a failed skip uses the new sequence, never the gap before the skip', async () => {
  let failSkip,
    next = 0;
  const calls = [];
  const network = new OnlineAttempts({
    getProfile: () => ({ id: 'u' }),
    online: () => true,
    id: () => String(++next),
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'skip_online_scramble')
        return new Promise((resolve, reject) => {
          failSkip = reject;
        });
      return name === 'begin_attempt' ? 'ticket' : { candidates: [] };
    },
  });
  const before = network.sequence;
  network.arm(3);
  const skip = network.skip();
  for (let i = 0; i < 10 && !failSkip; i++) await Promise.resolve();
  assert.equal(typeof failSkip, 'function');
  network.arm(3);
  network.start();
  const finish = network.finish(replay);
  failSkip(Error('Network failed'));
  await Promise.all([skip, finish]);
  assert.notEqual(calls.find((c) => c.name === 'begin_attempt').args.session, before);
});

function graceSetup(rpcOverride) {
  let time = 0,
    next = 0,
    online = true;
  const tasks = new Map(),
    calls = [],
    messages = [];
  const advance = (ms) => {
    time += ms;
    for (const [id, t] of [...tasks]) if (t.at <= time && tasks.delete(id)) t.fn();
  };
  const network = new OnlineAttempts({
    getProfile: () => ({ id: 'u', username: 'Tester' }),
    online: () => online,
    now: () => time,
    schedule: (fn, delay) => {
      const id = ++next;
      tasks.set(id, { fn, at: time + delay });
      return id;
    },
    cancel: (id) => tasks.delete(id),
    sleep: async (ms) => advance(ms),
    status: (m) => messages.push(m),
    rpc: async (name, args) => {
      calls.push({ name, args: structuredClone(args) });
      if (rpcOverride) return rpcOverride(name, args, calls);
      return name === 'begin_attempt' ? 'ticket' : { candidates: [], dnf: !args.replay };
    },
  });
  return { network, calls, messages, advance, setOnline: (v) => (online = v) };
}
test('pausing is permanent leaderboard evidence even after resuming', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.network.start();
  s.network.markPause();
  await s.network.finish(replay);
  assert.equal(s.calls.at(-1).args.replay.usedPause, true);
  assert.match(s.messages.at(-1), /Paused solves count as DNF/);
});
test('inspection and post-solve pauses cannot invalidate an unrelated result', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.network.markPause();
  s.network.start();
  await s.network.finish(replay);
  s.network.markPause();
  assert.equal(s.calls.at(-1).args.replay.usedPause, false);
});
test('400ms disconnects preserve eligibility and the same average sequence', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.network.start();
  await s.network.queue;
  const sequence = s.network.sequence;
  s.setOnline(false);
  s.network.offline();
  s.advance(400);
  s.setOnline(true);
  s.network.onlineAgain();
  await s.network.finish(replay);
  assert.equal(s.network.sequence, sequence);
  assert.ok(s.calls.at(-1).args.replay);
});
test('finishing during a short disconnect waits for reconnection and uploads the original result', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.network.start();
  await s.network.queue;
  s.setOnline(false);
  s.network.offline();
  const finish = s.network.finish(replay);
  await Promise.resolve();
  assert.equal(s.calls.length, 1);
  s.advance(400);
  s.setOnline(true);
  s.network.onlineAgain();
  await finish;
  assert.equal(s.calls.at(-1).args.replay.solveMs, 1000);
});
test('five-second disconnections invalidate the solve and break average continuity', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.network.start();
  await s.network.queue;
  const sequence = s.network.sequence;
  s.setOnline(false);
  s.network.offline();
  s.advance(5000);
  assert.notEqual(s.network.sequence, sequence);
  s.setOnline(true);
  s.network.onlineAgain();
  await s.network.finish(replay);
  assert.equal(s.calls.at(-1).args.replay, null);
});
test('an outage that expires while a finished result is waiting never uploads it as valid', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.network.start();
  await s.network.queue;
  s.setOnline(false);
  s.network.offline();
  const finish = s.network.finish(replay);
  await Promise.resolve();
  await Promise.resolve();
  s.advance(5000);
  await finish;
  s.setOnline(true);
  s.network.onlineAgain();
  assert.equal(s.calls.length, 1);
});
test('lost start responses retry the same request ID instead of creating extra attempts', async () => {
  let tries = 0;
  const s = graceSetup(async (name, args) => {
    if (name === 'begin_attempt' && ++tries === 1) throw TypeError('Failed to fetch');
    return name === 'begin_attempt' ? 'ticket' : { candidates: [] };
  });
  s.network.arm(3);
  s.network.start();
  await s.network.finish(replay);
  const begin = s.calls.filter((c) => c.name === 'begin_attempt');
  assert.equal(begin.length, 2);
  assert.equal(begin[0].args.request_id, begin[1].args.request_id);
  assert.equal(begin[1].args.start_delay_ms, 250);
});
test('lost finish responses retry identical evidence without duplicating the solve', async () => {
  let tries = 0;
  const s = graceSetup(async (name, args) => {
    if (name === 'record_online_attempt' && ++tries === 1) throw TypeError('Failed to fetch');
    return name === 'begin_attempt' ? 'ticket' : { candidates: [] };
  });
  s.network.arm(3);
  s.network.start();
  await s.network.finish(replay);
  const finish = s.calls.filter((c) => c.name === 'record_online_attempt');
  assert.equal(finish.length, 2);
  assert.deepEqual(finish[0].args, finish[1].args);
});
test('an in-flight request settles at the grace deadline even if the transport never responds', async () => {
  let began;
  const s = graceSetup(async (name) => {
    if (name === 'begin_attempt') {
      began = true;
      return new Promise(() => {});
    }
    return { candidates: [] };
  });
  s.network.arm(3);
  s.network.start();
  for (let i = 0; i < 20 && !began; i++) await Promise.resolve();
  assert.ok(began);
  s.setOnline(false);
  s.network.offline();
  s.advance(5000);
  await s.network.finish(replay);
  assert.equal(s.calls.length, 1);
});
test('starting the next solve during a known short interruption waits for its online ticket', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.network.start();
  await s.network.finish(replay);
  s.setOnline(false);
  s.network.offline();
  s.network.arm(3);
  s.network.start();
  s.advance(400);
  s.setOnline(true);
  s.network.onlineAgain();
  await s.network.finish(replay);
  assert.equal(s.calls.filter((c) => c.name === 'record_online_attempt').length, 2);
  assert.ok(s.calls.at(-1).args.replay);
});
test('skipping a scramble during the grace period still records its hidden DNF', async () => {
  const s = graceSetup();
  s.network.arm(3);
  s.setOnline(false);
  s.network.offline();
  const skipped = s.network.skip();
  for (let i = 0; i < 6; i++) await Promise.resolve();
  s.advance(400);
  s.setOnline(true);
  s.network.onlineAgain();
  await skipped;
  assert.equal(s.calls.at(-1).name, 'skip_online_scramble');
});
