import { test, expect } from './fixtures.js';
import { parseFtoScramble } from '../../src/fto-scramble.js';
import { applyMove, solvedState, signature } from '../../src/puzzle.js';
const old = parseFtoScramble('U F');
const sig = (moves) => signature(moves.reduce(applyMove, solvedState(3)));
async function seed(page, status = 'ready', pending = []) {
  await page.addInitScript(
    ({ old, status, pending }) => {
      if (window.name === 'reload-seeded') return;
      window.name = 'reload-seeded';
      window.refreshWrites = [];
      const put = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('master-fto-journal-v2:'))
          window.refreshWrites.push(JSON.parse(value).checkpoint);
        return put.call(this, key, value);
      };
      localStorage.setItem(
        'master-fto-settings-v1',
        JSON.stringify({
          animate: true,
          animateScrambling: true,
          follow: false,
          disableSounds: true,
        }),
      );
      localStorage.setItem(
        'master-fto-v1',
        JSON.stringify({
          size: 3,
          solves: {
            3: {
              history: old,
              redo: [],
              undoFloor: old.length,
              pending,
              timer: {
                status,
                elapsedMs: status === 'paused' ? 1234 : 0,
                scrambleText: 'U F',
                completed: 1,
                lastMs: 8000,
                bestMs: 8000,
                times: [{ ms: 8000, comment: 'keep this' }],
              },
            },
          },
        }),
      );
    },
    { old, status, pending },
  );
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-app-ready'));
}
async function ready(page) {
  await page.waitForFunction(() => {
    const s = window.fto?.snapshot();
    return !!s && !s.generatingScramble && s.timer.status === 'ready';
  });
  return page.evaluate(() => window.fto.snapshot());
}
test('restored inspections get a different scramble immediately without animation; reload and duplicate cannot reuse it', async ({
  page,
  context,
}) => {
  await seed(page);
  const first = await ready(page);
  // The worker's first output matches the saved scramble and must be skipped.
  expect(sig(first.history)).not.toBe(sig(old));
  expect(first.timer.times).toEqual([{ ms: 8000, at: null, comment: 'keep this' }]);
  expect(first.timer.lastMs).toBe(8000);
  expect(first.timer.bestMs).toBe(8000);
  expect(first.queued).toBe(0);
  expect(first.busy).toBe(false);
  const checkpoints = await page.evaluate(() => window.refreshWrites);
  expect(checkpoints.some((c) => c.timer.status === 'scrambling' && c.pending.length)).toBe(false);
  await page.evaluate(() => window.fto.flush());
  const duplicate = await context.newPage();
  await duplicate.goto('/');
  const copied = await ready(duplicate);
  expect(sig(copied.history)).not.toBe(sig(first.history));
  await duplicate.evaluate(() => window.fto.flush());
  await duplicate.reload();
  const reloaded = await ready(duplicate);
  expect(sig(reloaded.history)).not.toBe(sig(copied.history));
  expect(reloaded.timer.times).toHaveLength(1);
});
test('a partially animated scramble is replaced rather than replaying its remaining turns', async ({
  page,
}) => {
  await seed(page, 'scrambling', [
    { type: 'move', source: 'scramble', move: parseFtoScramble('R')[0] },
  ]);
  const state = await ready(page);
  expect(sig(state.history)).not.toBe(sig([...old, ...parseFtoScramble('R')]));
  expect(state.queued).toBe(0);
  expect(state.timer.times).toHaveLength(1);
});
for (const status of ['paused', 'finished'])
  test(`reloading a ${status} solve preserves its puzzle and saved results`, async ({ page }) => {
    await seed(page, status);
    const state = await page.evaluate(() => window.fto.snapshot());
    expect(state.timer.status).toBe(status);
    expect(sig(state.history)).toBe(sig(old));
    expect(state.timer.times).toHaveLength(1);
    expect(state.generatingScramble).toBe(false);
  });
