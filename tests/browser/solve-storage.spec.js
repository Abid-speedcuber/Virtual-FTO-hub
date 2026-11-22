import { test, expect } from './fixtures.js';
test.beforeEach(async ({ page }) => {
  await page.route('**/storage-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Storage regression</title>',
    }),
  );
  await page.goto('/storage-test');
});
test('legacy migration preserves healthy puzzle histories and original damaged data, then reloads from the new store', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SolveStorage, LEGACY_KEY } = await import('/src/solve-storage.js');
    const times = [
      { ms: 1234, comment: 'legacy comment', scramble: 'U', splitData: { custom: 'unchanged' } },
    ];
    const raw = JSON.stringify({
      size: 3,
      solves: {
        3: { history: [], redo: [], timer: { times, completed: 1 } },
        4: { history: 'damaged', redo: [] },
      },
    });
    localStorage.setItem(LEGACY_KEY, raw);
    const store = new SolveStorage(),
      data = await store.load();
    const next = new SolveStorage(),
      reloaded = await next.load();
    return {
      data,
      reloaded,
      oldKey: localStorage.getItem(LEGACY_KEY),
      recoveries: await next.recoveries(),
      raw,
    };
  });
  expect(result.data.solves['3'].timer.times).toEqual([
    { ms: 1234, comment: 'legacy comment', scramble: 'U', splitData: { custom: 'unchanged' } },
  ]);
  expect(result.data.solves['4']).toBeUndefined();
  expect(result.data.errors).toHaveLength(1);
  expect(result.reloaded.solves['3']).toEqual(result.data.solves['3']);
  expect(result.oldKey).toBeNull();
  expect(result.recoveries.some((r) => r.source === result.raw)).toBe(true);
});
test('two stale tabs cannot overwrite the same puzzle; different puzzle writes merge and conflict data is recoverable', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SolveStorage } = await import('/src/solve-storage.js');
    const a = new SolveStorage(),
      b = new SolveStorage();
    await a.load();
    await b.load();
    const hot = { history: [], redo: [], timer: { status: 'idle' }, recordings: { attempt: null } };
    const first = { times: [{ ms: 1000 }], last: null, pb: null };
    a.save(3, hot, first, 'swipe');
    await a.flush();
    b.save(4, hot, { times: [{ ms: 4000 }], last: null, pb: null }, 'swipe');
    await b.flush();
    // b's 3x3 baseline is still revision 0.
    b.save(3, hot, { times: [{ ms: 2000 }], last: null, pb: null }, 'swipe');
    await b.flush();
    return { saved: await a.document(), frozen: b.frozen, recoveries: await b.recoveries() };
  });
  expect(result.saved.solves['3'].timer.times).toEqual([{ ms: 1000 }]);
  expect(result.saved.solves['4'].timer.times).toEqual([{ ms: 4000 }]);
  expect(result.frozen).toBe(true);
  expect(result.recoveries.some((r) => r.journal?.entries.some((e) => e.entry.ms === 2000))).toBe(
    true,
  );
});
test('rapid own journals replay after an interrupted commit without rewriting old histories on each checkpoint', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SolveStorage } = await import('/src/solve-storage.js');
    const store = new SolveStorage();
    await store.load();
    const times = Array.from({ length: 10000 }, (_, i) => ({ ms: 1000 + i, comment: 'preserved' }));
    const hot = {
      history: [],
      redo: [],
      timer: { status: 'paused', elapsedMs: 100 },
      recordings: { attempt: null },
    };
    store.save(3, hot, { times, last: null, pb: null }, 'swipe');
    await store.flush();
    let largest = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('master-fto-journal-v2:')) largest = Math.max(largest, value.length);
      return original.call(this, key, value);
    };
    for (let i = 0; i < 3; i++)
      store.save(
        3,
        { ...hot, timer: { ...hot.timer, elapsedMs: 101 + i } },
        { times, last: null, pb: null },
        'swipe',
      );
    await store.flush();
    Storage.prototype.setItem = original;
    const reader = new SolveStorage(),
      data = await reader.load();
    return {
      largest,
      count: data.solves[3].timer.times.length,
      last: data.solves[3].timer.times.at(-1),
      elapsed: data.solves[3].timer.elapsedMs,
      recoveries: await reader.recoveries(),
    };
  });
  expect(result.largest).toBeLessThan(2000);
  expect(result.count).toBe(10000);
  expect(result.last).toEqual({ ms: 10999, comment: 'preserved' });
  expect(result.elapsed).toBe(103);
  expect(result.recoveries).toHaveLength(0);
});

test('the real app migrates legacy data, checkpoints new moves, and exports a complete portable backup', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('storage-app-seeded')) return;
    sessionStorage.setItem('storage-app-seeded', 'yes');
    localStorage.setItem(
      'master-fto-v1',
      JSON.stringify({
        size: 3,
        solves: {
          3: {
            history: [],
            redo: [],
            timer: { times: [{ ms: 1234, comment: 'old comment' }], completed: 1 },
          },
          4: { history: [], redo: [], timer: { times: [{ ms: 4567 }], completed: 1 } },
        },
      }),
    );
    localStorage.setItem(
      'master-fto-settings-v1',
      JSON.stringify({ animate: false, animateScrambling: false }),
    );
  });
  await page.goto('/');
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  expect(await page.evaluate(() => window.fto.snapshot().timer.times)).toEqual([
    { ms: 1234, at: null, comment: 'old comment' },
  ]);
  await page.keyboard.press('KeyF');
  await page.evaluate(() => window.fto.flush());
  await page.reload();
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  expect(await page.evaluate(() => window.fto.snapshot().history.length)).toBe(1);
  const backup = await page.evaluate(() => window.fto.exportData());
  expect(JSON.parse(backup.entries['master-fto-v1']).solves['4'].timer.times).toEqual([
    { ms: 4567 },
  ]);
  expect(backup.recovery.some((row) => row.source?.includes('old comment'))).toBe(true);
});

test('album v4 recordings migrate losslessly; historical keyboards deduplicate and portable exports contain no internal references', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { RecordingAlbum, ALBUM_FORMAT } = await import('/src/recording-album.js');
    const { SolveRecorder } = await import('/src/solve-recording.js');
    const { defaultConfig } = await import('/src/keyboard-engine.js');
    const { recordingID, encodeRecording, decodeRecording } =
      await import('/src/recording-codec.js');
    const make = (ms) => {
      let now = 0;
      const recorder = new SolveRecorder({}, () => now);
      const view = { rotation: [0, 0, 0, 1], radius: 10 };
      recorder.arm({ size: 3, scramble: [], view, keyboard: defaultConfig(3), colors: {} });
      recorder.begin(view, defaultConfig(3));
      now = ms;
      recorder.event('turn', {
        id: 1,
        move: { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' },
      });
      return recorder.finish(ms, true);
    };
    const old = make(1000),
      another = make(2000),
      changed = make(3000);
    changed.initial.keyboard.modes[0].bindings[0].code = 'KeyZ';
    const id = await recordingID(old),
      payload = await encodeRecording(old);
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('master-fto-album-v1', 4);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('recordings', { keyPath: 'id' });
        r.result.createObjectStore('deleted-recordings', { keyPath: 'id' });
      };
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction('recordings', 'readwrite');
        tx.objectStore('recordings').put({
          id,
          payload,
          size: 3,
          solveMs: 1000,
          pb: true,
          savedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    });
    const album = new RecordingAlbum();
    await album.open();
    await album.add(another);
    await album.add(changed);
    await album.add(another);
    const originals = await album.get(id);
    const summaryReads = [];
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      summaryReads.push(this.name);
      return getAll.apply(this, args);
    };
    let summaries;
    try {
      summaries = await album.list();
    } finally {
      IDBObjectStore.prototype.getAll = getAll;
    }
    const rows = await album.rows(),
      nodes = await album.rows('keyboard-snapshots');
    const backup = await album.export();
    const restored = new RecordingAlbum();
    await restored.restoreValidated(backup);
    const roundtrip = await restored.get(id),
      portable = await decodeRecording(backup.entries.find((e) => e.id === id).payload);
    return {
      originals,
      old,
      roundtrip,
      portable,
      count: summaries.length,
      summaryReads,
      allInterned: rows.every(
        (r) => r.payloadFormat === 'keyboard-v1' && r.payload instanceof ArrayBuffer,
      ),
      configs: nodes.filter((r) => r.kind === 'config').length,
      format: backup.format,
      expectedFormat: ALBUM_FORMAT,
    };
  });
  expect(result.originals).toEqual(result.old);
  expect(result.roundtrip).toEqual(result.old);
  expect(result.portable).toEqual(result.old);
  expect(result.count).toBe(3);
  expect(result.summaryReads).toEqual(['recording-metadata']);
  expect(result.allInterned).toBe(true);
  expect(result.configs).toBe(2);
  expect(result.format).toBe(result.expectedFormat);
});

test('a failed storage migration leaves the original save intact and usable', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { SolveStorage, LEGACY_KEY } = await import('/src/solve-storage.js');
    const raw = JSON.stringify({
      size: 3,
      solves: {
        3: { history: [], redo: [], timer: { times: [{ ms: 1234, comment: 'keep me' }] } },
      },
    });
    localStorage.setItem(LEGACY_KEY, raw);
    const errors = [];
    const database = {
      open() {
        throw Error('Storage quota exceeded');
      },
    };
    const storage = new SolveStorage({ database, onError: (e) => errors.push(e.message) }),
      data = await storage.load();
    return {
      raw,
      source: localStorage.getItem(LEGACY_KEY),
      data,
      available: storage.available,
      errors,
    };
  });
  expect(result.source).toBe(result.raw);
  expect(result.data.solves[3].timer.times).toEqual([{ ms: 1234, comment: 'keep me' }]);
  expect(result.available).toBe(false);
  expect(result.errors).toContain('Storage quota exceeded');
});
test('live journals are left to their writer; after a crash their checkpoint and new times recover', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { SolveStorage } = await import('/src/solve-storage.js');
    const writer = new SolveStorage();
    await writer.load();
    // Hold the transaction queue, emulating closing the page before IDB begins.
    writer.chain = new Promise(() => {});
    writer.save(
      3,
      { history: [], redo: [], timer: { status: 'paused', elapsedMs: 456 }, recordings: {} },
      { times: [{ ms: 2345, comment: 'crash journal' }], last: null, pb: null },
      'swipe',
    );
    const reader = new SolveStorage(),
      live = await reader.load();
    const journalPresent = Object.keys(localStorage).some((key) => key.endsWith(writer.writer));
    writer.releaseLocks();
    await navigator.locks.request(`fto-solves-writer:${writer.writer}`, () => {});
    const recovery = new SolveStorage(),
      afterCrash = await recovery.load();
    return { live: live.solves[3] ?? null, journalPresent, afterCrash: afterCrash.solves[3] };
  });
  expect(result.live).toBeNull();
  expect(result.journalPresent).toBe(true);
  expect(result.afterCrash.timer.times).toEqual([{ ms: 2345, comment: 'crash journal' }]);
  expect(result.afterCrash.timer.elapsedMs).toBe(456);
});

test('the real app can export live work even when its IndexedDB writes fail', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-app-ready'));
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.fto.snapshot().history.length > 0);
  const result = await page.evaluate(async () => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (names, mode, ...args) {
      if (this.name === 'master-fto-solves-v2' && mode === 'readwrite')
        throw Error('Simulated disk failure');
      return original.call(this, names, mode, ...args);
    };
    try {
      const data = await window.fto.exportData();
      return {
        data,
        live: window.fto.snapshot().history.length,
        banner: document.querySelector('#storage-recovery-message').textContent,
      };
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  });
  expect(JSON.parse(result.data.entries['master-fto-v1']).solves[3].history).toHaveLength(
    result.live,
  );
  expect(result.banner).toContain('Simulated disk failure');
  expect(result.data.recovery.every((row) => typeof row.id === 'string')).toBe(true);
  expect(
    result.data.recovery.some((row) => row.reason === 'Last durable data before a failed write'),
  ).toBe(true);
});
