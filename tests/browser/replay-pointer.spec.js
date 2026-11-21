import { waitForApp } from './helpers.js';
import { test, expect } from './fixtures.js';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';
test('recorded touch strokes appear at exact sampled positions and reconstruct when seeking', async ({
  page,
}) => {
  let now = 0;
  const recorder = new SolveRecorder({}, () => now);
  recorder.arm({
    size: 3,
    scramble: [],
    view: { rotation: [0, 0, 0, 1], radius: 10 },
    keyboard: defaultConfig(3),
    colors: {},
  });
  recorder.event('start');
  const pointer = (at, edge, x, y, id = 1, pointerType = 'touch') => {
    now = at;
    recorder.event('pointer', { edge, x, y, pointerId: id, pointerType });
  };
  pointer(100, 'pointerdown', 0.2, 0.3);
  pointer(150, 'pointermove', 0.4, 0.5);
  pointer(180, 'pointerdown', 0.7, 0.6, 2);
  pointer(200, 'pointermove', 0.5, 0.4);
  pointer(250, 'pointerup', 0.5, 0.4);
  pointer(300, 'pointercancel', 0.7, 0.6, 2);
  pointer(700, 'pointerdown', 0.3, 0.2, 3, 'mouse');
  pointer(800, 'pointerup', 0.3, 0.2, 3, 'mouse');
  now = 1500;
  const data = recorder.finish(1500, true);
  await page.goto('/');
  await waitForApp(page);
  await page.locator('#album').click();
  await page.locator('#album-import-recording').click();
  await page.locator('#recording-paste').fill(JSON.stringify(data));
  await page.locator('#recording-paste-load').click();
  await page.locator('#home-replay-start-marker').click();
  const intro = Number(await page.locator('#home-replay-progress').inputValue());
  const seek = (at) =>
    page.locator('#home-replay-progress').evaluate((el, at) => {
      el.value = String(at);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, intro + at);
  const contacts = page.locator('.replay-pointer-overlay g');
  await seek(210);
  await expect(contacts).toHaveCount(2);
  const geometry = await page.locator('.replay-pointer-overlay').evaluate((svg) => ({
    width: svg.clientWidth,
    height: svg.clientHeight,
    path: svg.querySelector('path').getAttribute('d'),
    x: Number(svg.querySelector('circle').getAttribute('cx')),
    y: Number(svg.querySelector('circle').getAttribute('cy')),
  }));
  expect(geometry.x).toBeCloseTo(geometry.width * 0.5);
  expect(geometry.y).toBeCloseTo(geometry.height * 0.4);
  expect(geometry.path).toContain(`L${geometry.width * 0.4} ${geometry.height * 0.5}`);
  await page.locator('#home-replay-view').screenshot({ path: 'test-results/replay-pointer.png' });
  await seek(650);
  await expect(contacts).toHaveCount(0);
  await seek(175);
  await expect(contacts).toHaveCount(1);
  await expect(contacts).toHaveAttribute('data-pressed', 'true');
  await seek(750);
  await expect(contacts).toHaveAttribute('data-pointer-type', 'mouse');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(contacts).toHaveCount(1);
  await seek(1500);
  await expect(contacts).toHaveCount(0);
  await page.locator('#home-replay-exit').click();
  await expect(page.locator('.replay-pointer-overlay')).toHaveCount(0);
});
