import {
  waitForApp,
  freezeClock,
  selectSize,
  openSettings,
  withSettings,
  scramble,
  assignBinding,
} from './helpers.js';

import { test, expect } from './fixtures.js';

const snap = (page) => page.evaluate(() => window.fto.snapshot());
const ready = waitForApp;
async function setup(page) {
  await page.clock.install();
  await page.goto('/');
  await ready(page);
  await selectSize(page, '3');
  await withSettings(page, async () => {
    await page.locator('#animate').uncheck();
    await page.locator('#animate-scrambling').uncheck();
    await page.locator('#show-keyboard').check();
  });
  await freezeClock(page);
}
test('Escape pauses only an active solve, excludes break time, and consumes its resume key', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#mobile-pause')).toBeHidden();
  await expect(page.locator('#keyboard-svg [data-code="Escape"] text')).toBeEmpty();
  await page.keyboard.press('Escape');
  expect((await snap(page)).timer.status).toBe('idle');
  await scramble(page);
  await expect(page.locator('#mobile-pause')).toBeHidden();
  await page.keyboard.press('KeyF');
  await freezeClock(page);
  await page.clock.runFor(1000);
  await expect(page.locator('#keyboard-svg [data-code="Escape"] text')).toHaveText('Pause');
  await page.keyboard.press('Escape');
  const parked = await snap(page);
  expect(parked.manualPaused).toBe(true);
  expect(parked.timer.status).toBe('paused');
  expect(parked.stickerColors).toEqual(Array(8).fill('888888'));
  await expect(page.locator('#mobile-undo')).toBeDisabled();
  await expect(page.locator('#mobile-redo')).toBeDisabled();
  await expect(page.locator('#pause-message')).toHaveText('Press any key to resume');
  await page.screenshot({ path: 'test-results/manual-paused.png' });
  await page.clock.runFor(30000);
  expect((await snap(page)).timer.elapsedMs).toBe(parked.timer.elapsedMs);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await snap(page)).manualPaused).toBe(true);
  await page.keyboard.press('KeyF');
  let resumed = await snap(page);
  expect(resumed.manualPaused).toBe(false);
  expect(resumed.timer.status).toBe('running');
  expect(resumed.history).toEqual(parked.history);
  expect(resumed.keyboard.stats.total).toBe(parked.keyboard.stats.total);
  await expect(page.locator('#pause-message')).toBeHidden();
  await page.keyboard.press('KeyI');
  expect((await snap(page)).history).toHaveLength(parked.history.length + 1);
});
test('manual pauses survive reloads and size switches; settings cannot reveal the paused puzzle', async ({
  page,
}) => {
  // Per-puzzle manual pause persistence includes multiple size changes and a reload.
  test.setTimeout(60000);
  await setup(page);
  await scramble(page);
  await page.keyboard.press('KeyF');
  await page.locator('#mobile-pause').click();
  const before = await snap(page);
  await page.reload();
  await ready(page);
  expect((await snap(page)).manualPaused).toBe(true);
  expect((await snap(page)).timer.elapsedMs).toBe(before.timer.elapsedMs);
  await expect(page.locator('#mobile-pause')).toBeVisible();
  await expect(page.locator('#mobile-pause')).toHaveAttribute('aria-label', 'Resume');
  await openSettings(page);
  await page.locator('#close-settings').click();
  expect((await snap(page)).manualPaused).toBe(true);
  await selectSize(page, '4');
  expect((await snap(page)).manualPaused).toBe(false);
  await expect(page.locator('#mobile-pause')).toBeHidden();
  await selectSize(page, '3');
  expect((await snap(page)).manualPaused).toBe(true);
  await expect(page.locator('#mobile-pause')).toBeVisible();
  await expect(page.locator('#mobile-pause')).toHaveAttribute('aria-label', 'Resume');
  await page.keyboard.press('KeyQ');
  expect((await snap(page)).manualPaused).toBe(false);
  expect((await snap(page)).history).toEqual(before.history);
});
test('Wide, Rot, E– cntr, and Shift+Backspace work with current and persisted defaults', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#keyboard-svg [data-code="Digit2"] text')).toHaveText('Wide');
  await expect(page.locator('#keyboard-svg [data-code="Space"] text')).toHaveText('Wide');
  await expect(page.locator('#keyboard-svg [data-code="Digit3"] text')).toHaveText('Rot');
  await expect(page.locator('#keyboard-svg [data-code="KeyM"] text')).toHaveText('E– cntr');
  await page.keyboard.press('KeyF');
  const turned = await snap(page);
  await page.keyboard.press('Backspace');
  expect((await snap(page)).history).toHaveLength(0);
  await page.keyboard.press('Shift+Backspace');
  expect((await snap(page)).state).toEqual(turned.state);
  await page.reload();
  await ready(page);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Shift+Backspace');
  expect((await snap(page)).state).toEqual(turned.state);
});
test('legacy mouse clicks stack a custom slice suffix and width, then consume both', async ({
  page,
}) => {
  await setup(page);
  await selectSize(page, '10');
  await withSettings(page, () => page.locator('#pointer-mode').selectOption('legacy'));
  await openSettings(page);
  await page.locator('#edit-keyboard').click();
  await assignBinding(page, 'suffix-slice:::', "'");
  await page.locator('#close-bindings').click();
  await page.locator('#close-keyboard').click();
  await page.locator('#close-settings').click();
  await page.keyboard.press('Digit8');
  await page.keyboard.press('Quote');
  const label = await page
    .locator('.face-label:not([hidden])')
    .filter({ hasText: /^F$/ })
    .boundingBox();
  await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2, {
    button: 'right',
  });
  expect((await snap(page)).history.at(-1)).toMatchObject({
    name: 'F',
    depth: 8,
    count: 1,
    dir: -1,
  });
  expect((await snap(page)).keyboard).toMatchObject({ pending: null, slicePending: false });
  await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2);
  expect((await snap(page)).history.at(-1)).toMatchObject({ depth: 1, count: 1, dir: 1 });
});
test('downloaded mechanical recordings decode and play locally while suffix tone remains separate', async ({
  page,
}) => {
  const requested = [];
  page.on('request', (r) => {
    if (r.url().includes('/audio/black-ink/')) requested.push(r.url());
  });
  await setup(page);
  await expect.poll(() => requested.length).toBe(3);
  expect(requested.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await page.evaluate(() => {
    const Audio = window.AudioContext;
    window.played = [];
    window.AudioContext = class extends Audio {
      createBufferSource() {
        const s = super.createBufferSource(),
          original = s.start.bind(s);
        s.start = (...args) => {
          window.played.push({
            duration: s.buffer.duration,
            peak: Math.max(...s.buffer.getChannelData(0).map(Math.abs)),
          });
          original(...args);
        };
        return s;
      }
    };
  });
  await page.keyboard.press('KeyF');
  await expect.poll(async () => page.evaluate(() => window.played.length)).toBe(1);
  const samples = await page.evaluate(() => window.played);
  expect(samples[0].duration).toBeGreaterThan(0.02);
  expect(samples[0].peak).toBeGreaterThan(0.01);
  await withSettings(page, () => page.locator('#disable-sounds').check());
  await page.keyboard.press('KeyI');
  expect(await page.evaluate(() => window.played.length)).toBe(1);
});

test('removing new default commands stays manual after reload', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const config = window.fto.snapshot().keyboard.config;
    const saved = JSON.parse(localStorage.getItem('master-fto-keyboard-v2')) ?? {
      version: 2,
      profiles: { 3: config },
      display: config.display,
    };
    saved.profiles[3].modes[0].bindings = saved.profiles[3].modes[0].bindings.filter(
      (b) => !['Escape', 'Shift+Backspace'].includes(b.trigger),
    );
    localStorage.setItem('master-fto-keyboard-v2', JSON.stringify(saved));
  });
  await page.reload();
  await ready(page);
  const bindings = (await snap(page)).keyboard.config.modes[0].bindings;
  expect(bindings.some((b) => b.trigger === 'Escape')).toBe(false);
  expect(bindings.some((b) => b.trigger === 'Shift+Backspace')).toBe(false);
});
