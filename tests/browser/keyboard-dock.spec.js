import { test, expect } from './fixtures.js';
import { waitForApp, freezeClock } from './helpers.js';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';

function recording(keyboard = true) {
  let now = 0;
  const recorder = new SolveRecorder({}, () => now),
    move = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' };
  recorder.arm({
    size: 3,
    scramble: [move],
    keyboard: defaultConfig(3),
    view: { rotation: [0, 0, 0, 1], radius: 10 },
    colors: {},
  });
  recorder.event('start');
  now = 100;
  if (keyboard) recorder.event('key', { edge: 'down', code: 'KeyF' });
  recorder.event('accept', { id: 1, action: 'move', source: keyboard ? 'keyboard' : 'pointer' });
  now = 300;
  if (keyboard) recorder.event('key', { edge: 'up', code: 'KeyF' });
  now = 1000;
  recorder.event('turn', { id: 1, move: { ...move, dir: -1 } });
  return recorder.finish(1000, true);
}
async function loadRecording(page, keyboard = true) {
  await page.locator('#album').click();
  await page.locator('#album-import-recording').click();
  await page.locator('#recording-paste').fill(JSON.stringify(recording(keyboard)));
  await page.locator('#recording-paste-load').click();
  await expect(page.locator('html')).toHaveClass(/replaying/);
}

test('normal phone solving retains its original layout without a keyboard dock', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForApp(page);
  await expect(page.locator('#keyboard-dock')).toBeHidden();
  await expect(page.locator('#keyboard-overlay')).toBeHidden();
  await expect(page.locator('#solve-panel > #keyboard-overlay')).toHaveCount(1);
  const height = (await page.locator('#viewport').boundingBox()).height;
  expect(height).toBeGreaterThan(700);
});

test('keyboard recording on a phone shows a full-width keyboard above playback controls and restores on exit', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForApp(page);
  const original = await page.locator('#viewport').boundingBox();
  await loadRecording(page);
  await expect(page.locator('#keyboard-dock > #replay-keyboard')).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const board = document.getElementById('keyboard-dock').getBoundingClientRect(),
          puzzle = document.getElementById('viewport').getBoundingClientRect(),
          controls = document.getElementById('home-replay-dock').getBoundingClientRect();
        return (
          board.x === 0 &&
          board.width === innerWidth &&
          Math.abs(board.bottom - controls.top) < 2 &&
          puzzle.bottom <= board.top + 1 &&
          controls.bottom <= innerHeight + 1
        );
      }),
    )
    .toBe(true);
  await page.locator('#home-replay-start-marker').click();
  const intro = Number(await page.locator('#home-replay-progress').inputValue());
  await page.locator('#home-replay-progress').evaluate((el, at) => {
    el.value = String(at);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, intro + 120);
  await expect(page.locator('#replay-keyboard [data-code="KeyF"]')).toHaveClass(/pressed/);
  await page.locator('#home-replay-exit').click();
  await expect(page.locator('#keyboard-dock')).toBeHidden();
  await expect(page.locator('#keyboard-overlay')).toBeHidden();
  await expect
    .poll(async () => (await page.locator('#viewport').boundingBox()).height)
    .toBe(original.height);
});

test('pointer-only phone recordings keep the original layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForApp(page);
  await loadRecording(page, false);
  await expect(page.locator('#keyboard-dock')).toBeHidden();
  await expect(page.locator('#replay-keyboard')).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/docked-replay-keyboard/);
});

test('desktop keyboard recordings keep the original sidebar layout', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await waitForApp(page);
  await loadRecording(page);
  await expect(page.locator('#keyboard-dock')).toBeHidden();
  await expect(page.locator('#solve-panel > #replay-keyboard')).toBeVisible();
});

test('resizing a keyboard recording switches between phone dock and desktop sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForApp(page);
  await loadRecording(page);
  await expect(page.locator('#keyboard-dock > #replay-keyboard')).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(page.locator('#solve-panel > #replay-keyboard')).toBeVisible();
  await expect(page.locator('#keyboard-dock')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#keyboard-dock > #replay-keyboard')).toBeVisible();
});

for (const viewport of [
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 900, height: 900 },
]) {
  test(`recording keyboard docks when the sidebar cannot show it at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await waitForApp(page);
    await loadRecording(page);
    await expect(page.locator('#keyboard-dock > #replay-keyboard')).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const board = document.getElementById('keyboard-dock').getBoundingClientRect(),
            puzzle = document.getElementById('viewport').getBoundingClientRect(),
            controls = document.getElementById('home-replay-dock').getBoundingClientRect();
          return (
            board.width === innerWidth &&
            Math.abs(board.bottom - controls.top) < 2 &&
            puzzle.bottom <= board.top + 1 &&
            controls.bottom <= innerHeight + 1
          );
        }),
      )
      .toBe(true);
    if (viewport.width === 1024)
      await page.screenshot({ path: 'test-results/tablet-replay-keyboard.png' });
  });
}

test('move flashes never change the puzzle, keyboard, progress, or transport geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForApp(page);
  await loadRecording(page);
  await page.clock.install();
  await freezeClock(page);
  const measurements = await page.evaluate(() => {
    const flash = document.getElementById('home-replay-keys');
    const measure = () =>
      [
        'viewport',
        'keyboard-dock',
        'home-replay-dock',
        'home-replay-progress',
        'home-replay-keys',
      ].map((id) => {
        const rect = document.getElementById(id).getBoundingClientRect();
        return { id, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
    const frames = [];
    for (const text of ['', 'U′', '20BRw′', 'R', '']) {
      flash.textContent = text;
      flash.dataset.active = String(!!text);
      frames.push(measure());
    }
    return { frames, parent: flash.parentElement.id, position: getComputedStyle(flash).position };
  });
  expect(measurements.parent).toBe('viewport');
  expect(measurements.position).toBe('absolute');
  for (const frame of measurements.frames) expect(frame).toEqual(measurements.frames[0]);
  await page.locator('#home-replay-start-marker').click();
  const intro = Number(await page.locator('#home-replay-progress').inputValue());
  const flash = await page.locator('#home-replay-progress').evaluate((el, at) => {
    el.value = String(at);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const output = document.getElementById('home-replay-keys');
    return { active: output.dataset.active, text: output.textContent };
  }, intro + 120);
  expect(flash.active).toBe('true');
  expect(flash.text.length).toBeGreaterThan(0);
  await page.locator('#home-replay-keys').evaluate((el) => {
    el.textContent = '20BRw′';
    el.dataset.active = 'true';
  });
  await page.screenshot({ path: 'test-results/replay-move-badge.png' });
});
