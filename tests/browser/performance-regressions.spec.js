import { waitForApp } from './helpers.js';
import { test, expect } from './fixtures.js';
const ready = waitForApp;
test('replay submits one draw and reuses geometry while only animation progress changes', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const result = await page.evaluate(async () => {
    const { PuzzleViewer } = await import('/src/puzzle-viewer.js'),
      { solvedState } = await import('/src/puzzle.js');
    const host = document.createElement('div');
    host.style.cssText = 'width:400px;height:400px';
    document.body.append(host);
    const viewer = new PuzzleViewer(host),
      state = solvedState(4),
      move = { normal: [1, 1, 1], layer: 'outer', dir: 1 },
      view = { rotation: [0, 0, 0, 1], radius: 10 };
    viewer.resize();
    viewer.setFrame(4, state, null, [{ move, progress: 0.1 }], view);
    const versions = viewer.geometry.pool.map((m) => m.geometry.attributes.position.version);
    let draws = 0;
    const draw = viewer.renderer.render.bind(viewer.renderer);
    viewer.renderer.render = (...args) => {
      draws++;
      draw(...args);
    };
    viewer.setFrame(4, state, null, [{ move, progress: 0.5 }], view);
    const result = {
      draws,
      versions,
      after: viewer.geometry.pool.map((m) => m.geometry.attributes.position.version),
      calls: viewer.renderer.info.render.calls,
    };
    viewer.dispose();
    host.remove();
    return result;
  });
  expect(result.draws).toBe(1);
  expect(result.after).toEqual(result.versions);
  expect(result.calls).toBeLessThan(25);
});
test('rapid input coalesces saves and reload flushes the latest moves', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'master-fto-settings-v1',
      JSON.stringify({ animate: false, follow: false, disableSounds: true }),
    ),
  );
  await page.goto('/');
  await ready(page);
  await page.clock.install();
  const result = await page.evaluate(() => {
    let writes = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'master-fto-v1') writes++;
      return original.call(this, key, value);
    };
    for (let i = 0; i < 10; i++)
      for (const type of ['keydown', 'keyup'])
        window.dispatchEvent(
          new KeyboardEvent(type, {
            code: i % 2 ? 'KeyI' : 'KeyF',
            key: i % 2 ? 'i' : 'f',
            bubbles: true,
          }),
        );
    Storage.prototype.setItem = original;
    return { writes, state: window.fto.snapshot().state, history: window.fto.snapshot().history };
  });
  expect(result.writes).toBeLessThanOrEqual(1);
  expect(result.history).toHaveLength(10);
  await page.reload();
  await ready(page);
  const after = await page.evaluate(() => window.fto.snapshot());
  expect(after.history).toEqual(result.history);
  expect(after.state).toEqual(result.state);
});
test('split timer updates preserve existing rows and cells', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const result = await page.evaluate(async () => {
    const { PhaseUI } = await import('/src/phase-ui.js');
    const ui = Object.create(PhaseUI.prototype);
    ui.getSize = () => 3;
    ui.getConfig = () => ({ method: 'off' });
    const tracker = {
      enabled: true,
      profile: {
        method: 'custom',
        phases: [
          { name: 'First', type: 'manual' },
          { name: 'Last', type: 'finish' },
        ],
      },
      groups: [],
      reference: null,
      complete: false,
    };
    ui.render(tracker, 100, 'running', true);
    const row = document.querySelector('#split-rows tr'),
      cell = row.children[1],
      before = cell.textContent;
    ui.render(tracker, 500, 'running', true);
    return {
      sameRow: row === document.querySelector('#split-rows tr'),
      sameCell: cell === document.querySelector('#split-rows tr').children[1],
      before,
      after: cell.textContent,
    };
  });
  expect(result.sameRow).toBe(true);
  expect(result.sameCell).toBe(true);
  expect(result.after).not.toBe(result.before);
});
test('unchanged keyboard frames reuse labels while input and seeking invalidate them', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const result = await page.evaluate(async () => {
    const { ReplayKeyboard } = await import('/src/replay-keyboard.js'),
      { defaultConfig } = await import('/src/keyboard-engine.js');
    const host = document.createElement('div');
    document.body.append(host);
    const data = {
        size: 3,
        duration: 3000,
        initial: { keyboard: defaultConfig(3) },
        events: [
          { at: 0, type: 'start' },
          { at: 500, type: 'key', edge: 'down', code: 'ShiftLeft' },
          { at: 1000, type: 'key', edge: 'up', code: 'ShiftLeft' },
        ],
      },
      keyboard = new ReplayKeyboard(host, data);
    let calls = 0;
    const keyState = keyboard.engine.keyState.bind(keyboard.engine);
    keyboard.engine.keyState = (...args) => {
      calls++;
      return keyState(...args);
    };
    keyboard.render(0);
    const initial = calls;
    keyboard.render(200);
    const idle = calls;
    keyboard.render(600);
    const changed = calls;
    keyboard.render(1100);
    keyboard.render(200);
    const pressed = host.querySelector('[data-code="ShiftLeft"]').classList.contains('pressed');
    host.remove();
    return { initial, idle, changed, pressed };
  });
  expect(result.initial).toBeGreaterThan(0);
  expect(result.idle).toBe(result.initial);
  expect(result.changed).toBeGreaterThan(result.idle);
  expect(result.pressed).toBe(false);
});
test('overlapping animated turns and pending turns retain exact state across reload on 4x4', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('performance-4x4-seeded')) return;
    sessionStorage.setItem('performance-4x4-seeded', 'yes');
    localStorage.setItem(
      'master-fto-v1',
      JSON.stringify({ size: 4, solves: { 4: { history: [], redo: [] } } }),
    );
    localStorage.setItem(
      'master-fto-settings-v1',
      JSON.stringify({ animate: true, follow: false, disableSounds: true }),
    );
  });
  const epoch = new Date('2026-11-17T00:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(new Date(epoch.getTime() + 10000));
  await page.goto('/');
  await ready(page);
  await page.keyboard.press('KeyF');
  await page.clock.runFor(40);
  await page.keyboard.press('Shift+KeyF');
  let current = await page.evaluate(() => window.fto.snapshot());
  expect(current.size).toBe(4);
  expect(current.animating).toHaveLength(2);
  expect(current.history).toHaveLength(0);
  await page.clock.runFor(40);
  await page.keyboard.press('KeyI');
  current = await page.evaluate(() => window.fto.snapshot());
  expect(current.history).toHaveLength(2);
  expect(current.animating).toHaveLength(1);
  const expected = await page.evaluate(async () => {
    const { solvedState, applyMove } = await import('/src/puzzle.js');
    return [
      { normal: [1, 1, 1], layer: 'slice', depth: 1, count: 1, dir: -1 },
      { normal: [1, 1, 1], layer: 'slice', depth: 2, count: 1, dir: -1 },
      { normal: [1, 1, -1], layer: 'slice', depth: 1, count: 1, dir: 1 },
    ].reduce(applyMove, solvedState(4));
  });
  // Navigate with the R turn still pending: pagehide must flush it immediately.
  await page.reload();
  await ready(page);
  await page.clock.runFor(300);
  current = await page.evaluate(() => window.fto.snapshot());
  expect(current.busy).toBe(false);
  expect(current.history).toHaveLength(3);
  expect(current.state).toEqual(expected);
});
