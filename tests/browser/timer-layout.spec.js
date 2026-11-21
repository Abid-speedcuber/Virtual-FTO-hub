import {
  waitForApp,
  requestReset,
  requestScramble,
  freezeClock,
  openSettings,
  selectSize,
  withSettings,
  scramble,
  confirmAction,
} from './helpers.js';

import { installKeyboard } from './keyboard-fixture.js';
import { test, expect } from './fixtures.js';

const ready = waitForApp;
const snap = (page) => page.evaluate(() => window.fto.snapshot());
const freeze = async (page) => freezeClock(page);
const click = async (page, id) => {
  if (id === '#mobile-scramble') return requestScramble(page);
  if (id === '#mobile-reset') return requestReset(page);
  await expect(page.locator(id)).toBeVisible();
  return page.locator(id).evaluate((el) => el.click());
};
async function manualInstant(page) {
  await withSettings(page, async () => {
    await page.locator('#animate').uncheck();
    await page.locator('#animate-scrambling').uncheck();
  });
}
const setSize = selectSize;
test.beforeEach(async ({ page }) => {
  await installKeyboard(page);
  await page.clock.install();
  await page.goto('/');
  await ready(page);
  await selectSize(page, 4);
});
test('viewport, topbar and controls fit desktop and compact layouts', async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 720 });
  const header = await page.locator('.topbar').boundingBox();
  const square = await page.locator('#viewport').boundingBox();
  const panel = await page.locator('#solve-panel').boundingBox();
  const account = await page.locator('#ft-account-trigger').boundingBox();
  expect(square.y).toBeCloseTo(header.y + header.height, 0);
  expect(square.width).toBeCloseTo(square.height, 0);
  expect(panel.x).toBeGreaterThanOrEqual(square.x + square.width);
  expect(account.x + account.width).toBeLessThanOrEqual(1360);
  await expect(page.locator('#mobile-scramble')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeader = await page.locator('.topbar').boundingBox();
  const viewport = await page.locator('#viewport').boundingBox();
  expect(viewport.y).toBeCloseTo(mobileHeader.y + mobileHeader.height, 0);
  expect(viewport.width).toBe(390);
  await expect(page.locator('#mobile-controls')).toBeVisible();
  await expect(page.locator('#mobile-history')).toBeVisible();
  await expect(page.locator('#solve-panel')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
test(
  'scramble confirmation protects progress and free play never starts the timer',
  { tag: '@smoke' },
  async ({ page }) => {
    await manualInstant(page);
    await page.keyboard.press('KeyF');
    const before = await snap(page);
    expect(before.timer.status).toBe('idle');
    await confirmAction(page, () => requestScramble(page), false);
    const after = await snap(page);
    expect(after.state).toEqual(before.state);
    expect(after.history).toEqual(before.history);
    expect(after.timer.status).toBe('idle');
    await scramble(page);
    const prepared = await snap(page);
    expect(prepared.timer.status).toBe('ready');
    expect(prepared.timer.elapsedMs).toBe(0);
    expect(prepared.busy).toBe(false);
    expect(prepared.history).toHaveLength(50);
    expect(prepared.solved).toBe(false);
  },
);
test('timer starts only on an accepted turn and stays paused after reload until explicitly resumed', async ({
  page,
}) => {
  test.setTimeout(60000);
  await manualInstant(page);
  await scramble(page);
  await freeze(page);
  await page.clock.runFor(2000);
  expect((await snap(page)).timer).toMatchObject({ status: 'ready', elapsedMs: 0 });
  await page.keyboard.press('Digit3');
  await page.keyboard.press('KeyQ');
  expect((await snap(page)).keyboard.pending).toBe(3);
  expect((await snap(page)).timer.status).toBe('ready');
  await page.keyboard.press('KeyF');
  expect((await snap(page)).keyboard.pending).toBe(null);
  await page.clock.runFor(1250);
  expect((await snap(page)).timer).toMatchObject({ status: 'running', elapsedMs: 1250 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.clock.runFor(10000);
  expect((await snap(page)).timer).toMatchObject({ status: 'paused', elapsedMs: 1250 });
  await page.reload();
  await ready(page);
  expect((await snap(page)).timer).toMatchObject({ status: 'paused', elapsedMs: 1250 });
  await click(page, '#mobile-pause');
  await page.clock.runFor(500);
  expect((await snap(page)).timer.elapsedMs).toBe(1750);
});
test('finishing records a per-size PB; reset preserves it and a faster attempt improves it', async ({
  page,
}) => {
  // The worker fixture gives two real moves on 3×3; 50-turn recording flow is covered separately.
  test.setTimeout(60000);
  await selectSize(page, 3);
  await manualInstant(page);
  await scramble(page);
  await freeze(page);
  const finishWithMoves = async (duration) => {
    await openSettings(page);
    await page.locator('#follow').evaluate((el) => {
      el.checked = false;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(page, '#close-settings');
    await page.clock.runFor(20);
    const sequence = (await snap(page)).history.slice().reverse();
    const send = async (moves) =>
      page.evaluate((moves) => {
        const frame = window.fto.snapshot().frame,
          faces = Array.from({ length: 8 }, (_, i) => frame.slice(i * 3, i * 3 + 3)),
          keys = ['U', 'R', 'F', 'J', 'L', 'B', 'K', 'D'];
        const event = (type, code, shiftKey = false, altKey = false) =>
          document.body.dispatchEvent(
            new KeyboardEvent(type, { code, bubbles: true, cancelable: true, shiftKey, altKey }),
          );
        for (const move of moves) {
          const inner = (move.depth ?? 1) > 1,
            digit = `Digit${move.depth ?? 1}`,
            code = `Key${keys[faces.findIndex((n) => n.every((v, i) => v === move.normal[i]))]}`,
            reverse = move.dir === 1;
          // Depth 1 is an outer move. Shift without a selected depth means layer 2.
          if (inner) {
            event('keydown', digit);
            event('keyup', digit);
            event('keydown', 'ShiftLeft', true);
          }
          if (reverse) event('keydown', 'AltLeft', inner, true);
          event('keydown', code, inner, reverse);
          event('keyup', code, inner, reverse);
          if (reverse) event('keyup', 'AltLeft', inner, false);
          if (inner) event('keyup', 'ShiftLeft');
        }
      }, moves);
    await send(sequence.slice(0, 1));
    await page.clock.runFor(duration);
    await send(sequence.slice(1));
  };
  await finishWithMoves(2500);
  expect((await snap(page)).timer).toMatchObject({
    status: 'finished',
    bestMs: 2500,
    completed: 1,
  });
  await expect(page.locator('#solve-times li')).toHaveCount(1);
  await expect(page.locator('#solve-times li time')).toHaveText('2.50');
  await page.reload();
  await ready(page);
  expect((await snap(page)).timer.bestMs).toBe(2500);
  await setSize(page, 4);
  expect((await snap(page)).timer.bestMs).toBe(null);
  await setSize(page, 3);
  expect((await snap(page)).timer.bestMs).toBe(2500);
  await confirmAction(page, () => click(page, '#mobile-reset'));
  expect((await snap(page)).timer).toMatchObject({ status: 'idle', bestMs: 2500 });
  await confirmAction(page, () => click(page, '#mobile-scramble'));
  await finishWithMoves(2000);
  expect((await snap(page)).timer).toMatchObject({
    status: 'finished',
    bestMs: 2000,
    completed: 2,
    newBest: true,
  });
  await expect(page.locator('#solve-times li')).toHaveCount(2);
  await expect(page.locator('#solve-times li time').first()).toHaveText('2.00');
});
test('animated scrambling is independent, blocks turns, and restores an interrupted sequence', async ({
  page,
}) => {
  test.setTimeout(60000);
  await withSettings(page, async () => {
    await page.locator('#animate').uncheck();
    await page.locator('#animate-scrambling').check();
  });
  await freeze(page);
  await confirmAction(page, () => click(page, '#mobile-scramble'));
  let state = await snap(page);
  expect(state.timer.status).toBe('scrambling');
  expect(state.busy).toBe(true);
  expect(state.queued).toBeGreaterThan(0);
  await page.keyboard.press('KeyF');
  expect((await snap(page)).keyboard.stats.total).toBe(0);
  await page.clock.runFor(90);
  expect((await snap(page)).history.length).toBeGreaterThan(0);
  await page.reload();
  await ready(page);
  expect((await snap(page)).timer.status).toBe('scrambling');
  await page.clock.runFor(5000);
  state = await snap(page);
  expect(state.history).toHaveLength(50);
  expect(state.queued).toBe(0);
  expect(state.busy).toBe(false);
  expect(state.timer).toMatchObject({ status: 'ready', elapsedMs: 0 });
  await openSettings(page);
  expect(await page.locator('#animate-scrambling').isChecked()).toBe(true);
  await click(page, '#close-settings');
});
test('reload preserves a manual turn interrupted in mid-animation', async ({ page }) => {
  await freeze(page);
  await page.keyboard.press('KeyF');
  expect((await snap(page)).busy).toBe(true);
  await page.reload();
  await ready(page);
  await page.clock.runFor(300);
  expect((await snap(page)).history).toHaveLength(1);
  expect((await snap(page)).timer.status).toBe('idle');
});

test('redo can be queued while its preceding undo is still animating', async ({ page }) => {
  await manualInstant(page);
  await page.keyboard.press('KeyF');
  await withSettings(page, () => page.locator('#animate').check());
  await freeze(page);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await page.clock.runFor(400);
  expect((await snap(page)).history).toHaveLength(1);
  expect((await snap(page)).redo).toHaveLength(0);
  expect((await snap(page)).solved).toBe(false);
});

test('Reset beside Scramble clears a timed solve and pending turns into saved free play', async ({
  page,
}) => {
  test.setTimeout(60000);
  // Scramble animation is covered separately; this scenario exercises turn animation.
  await withSettings(page, () => page.locator('#animate-scrambling').uncheck());
  await scramble(page);
  await freeze(page);
  await page.keyboard.press('KeyF');
  await page.keyboard.press('KeyR');
  expect((await snap(page)).timer.status).toBe('running');
  await click(page, '#mobile-pause');
  const scrambleBox = await page.locator('#mobile-scramble').boundingBox(),
    resetBox = await page.locator('#mobile-reset').boundingBox();
  expect(resetBox.x).toBeGreaterThan(scrambleBox.x + scrambleBox.width);
  await confirmAction(page, () => requestReset(page));
  await page.clock.runFor(500);
  expect(await snap(page)).toMatchObject({
    solved: true,
    history: [],
    redo: [],
    undoFloor: 0,
    queued: 0,
    busy: false,
    timer: { status: 'idle', elapsedMs: 0 },
  });
  await page.reload();
  await ready(page);
  expect((await snap(page)).timer.status).toBe('idle');
  expect((await snap(page)).solved).toBe(true);
  await page.keyboard.press('KeyF');
  await page.clock.runFor(300);
  expect((await snap(page)).timer.status).toBe('idle');
});

test('paused timer immediately hides every sticker color, including during animation, and resume restores them', async ({
  page,
}) => {
  test.setTimeout(60000);
  // Scramble animation is covered separately; this scenario exercises turn animation.
  await withSettings(page, () => page.locator('#animate-scrambling').uncheck());
  await scramble(page);
  await freeze(page);
  const colors = (await snap(page)).stickerColors;
  expect(new Set(colors).size).toBe(8);
  await page.keyboard.press('KeyF');
  await page.clock.runFor(32);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  let paused = await snap(page);
  expect(paused.timer.status).toBe('paused');
  expect(paused.stickerColors).toEqual(Array(8).fill('888888'));
  const elapsed = paused.timer.elapsedMs;
  await page.clock.runFor(2000);
  paused = await snap(page);
  expect(paused.timer.elapsedMs).toBe(elapsed);
  expect(paused.stickerColors).toEqual(Array(8).fill('888888'));
  await page.screenshot({ path: 'test-results/paused-gray.png' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await snap(page)).timer.status).toBe('paused');
  await click(page, '#mobile-pause');
  expect((await snap(page)).timer.status).toBe('running');
  expect((await snap(page)).stickerColors).toEqual(colors);
  await page.clock.runFor(500);
  expect((await snap(page)).timer.elapsedMs).toBe(elapsed + 500);
});
