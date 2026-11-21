import { waitForApp, freezeClock, selectSize, openSettings, scramble } from './helpers.js';

import { test, expect } from './fixtures.js';

const ready = waitForApp;
const snap = (page) => page.evaluate(() => window.fto.snapshot());
async function setup(page, size = 3) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('master-fto-settings-v1'))
      localStorage.setItem(
        'master-fto-settings-v1',
        JSON.stringify({ animate: false, animateScrambling: false }),
      );
  });
  await page.goto('/');
  await ready(page);
  await selectSize(page, String(size));
  await expect(page.locator('#keyboard-overlay')).toBeVisible();
}
test('mode keys show target names on one or two lines; shortcut prefix keys stay blank', async ({
  page,
}) => {
  test.setTimeout(90000);
  await setup(page);
  await expect(page.locator('#keyboard-svg [data-code="Tab"] text')).toHaveText('EIF-R');
  await expect(page.locator('#keyboard-svg [data-code="KeyC"] text')).toHaveText('EIF-L');
  await expect(page.locator('#keyboard-svg [data-code="KeyM"] text')).toHaveText('E– cntr');
  await expect(page.locator('#keyboard-svg [data-code="KeyM"] tspan')).toHaveCount(2);
  for (const code of ['ControlLeft', 'MetaLeft', 'AltLeft', 'KeyX'])
    await expect(page.locator(`#keyboard-svg [data-code="${code}"] text`)).toBeEmpty();
  await expect(page.locator('#keyboard-svg [data-code="ShiftLeft"] text')).toHaveText('Slice');
  await openSettings(page);
  await page.locator('#edit-keyboard').click();
  await page.locator('#customize-bindings').click();
  await page.locator('#catalog-mode-choice').click();
  await page.getByRole('option', { name: 'E– cntr', exact: true }).click();
  await page.locator('#catalog-mode-choice').click({ button: 'right' });
  await page.locator('#mode-context-rename').click();
  await page.locator('#new-mode-name').fill('Seven7');
  await page.locator('#save-mode-name').click();
  await expect(page.locator('#catalog-mode-choice')).toHaveText('Seven7');
  await page.locator('#catalog-mode-choice').click({ button: 'right' });
  await page.locator('#mode-context-rename').click();
  await page.locator('#new-mode-name').fill('Two  Words');
  await page.locator('#save-mode-name').click();
  await expect(page.locator('#mode-name-message')).toContainText('6 characters');
  await page.locator('#new-mode-name').fill('Ctr Mode');
  await page.locator('#save-mode-name').click();
  await page.locator('#close-bindings').click();
  await page.locator('#close-keyboard').click();
  await page.locator('#close-settings').click();
  await expect(page.locator('#keyboard-svg [data-code="KeyM"] text')).toHaveText('Ctr Mode');
  await page.reload();
  await ready(page);
  await expect(page.locator('#keyboard-svg [data-code="KeyM"] text')).toHaveText('Ctr Mode');
});
test('60 percent board omits function row, navigation, and numpad; hidden keys do not flash other positions', async ({
  page,
}) => {
  test.setTimeout(60000);
  await setup(page);
  await openSettings(page);
  await page.locator('#edit-keyboard').click();
  await page.locator('#keyboard-layout').selectOption('ansi');
  await page.locator('#keyboard-numpad').check();
  await page.locator('#keyboard-layout').selectOption('60');
  await expect(page.locator('#keyboard-numpad')).not.toBeVisible();
  await page.locator('#close-keyboard').click();
  await page.locator('#close-settings').click();
  await expect(page.locator('#keyboard-svg .keycap')).toHaveCount(61);
  for (const code of ['F1', 'Home', 'ArrowUp', 'Numpad0']) {
    await expect(page.locator(`#keyboard-svg [data-code="${code}"]`)).toHaveCount(0);
    await page.keyboard.down(code);
    await expect(page.locator('#keyboard-svg .keycap.pressed')).toHaveCount(0);
    await page.keyboard.up(code);
  }
  await page.keyboard.down('KeyF');
  await expect(page.locator('#keyboard-svg [data-code="KeyF"]')).toHaveClass(/pressed/);
  await page.keyboard.up('KeyF');
  await page.reload();
  await ready(page);
  await expect(page.locator('#keyboard-svg .keycap')).toHaveCount(61);
  await page.locator('#keyboard-overlay').screenshot({ path: 'test-results/keyboard-60.png' });
});
test('free play and ready inspection stay colored; settings pause only a running timed solve', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.clock.install();
  await setup(page);
  await expect(page.locator('#timer-value')).toHaveText('00:00');
  const colors = (await snap(page)).stickerColors;
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await snap(page)).stickerColors).toEqual(colors);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await openSettings(page);
  expect((await snap(page)).stickerColors).toEqual(colors);
  await page.locator('#close-settings').click();
  await scramble(page);
  await openSettings(page);
  expect((await snap(page)).timer.status).toBe('ready');
  expect((await snap(page)).stickerColors).toEqual(colors);
  await page.locator('#close-settings').click();
  await freezeClock(page);
  await page.keyboard.press('KeyF');
  await page.clock.runFor(500);
  await openSettings(page);
  const paused = await snap(page);
  expect(paused.timer.status).toBe('paused');
  expect(paused.stickerColors).toEqual(Array(8).fill('888888'));
  await page.clock.runFor(10000);
  expect((await snap(page)).timer.elapsedMs).toBe(paused.timer.elapsedMs);
  await page.locator('#edit-keyboard').click();
  await page.locator('#close-keyboard').click();
  expect((await snap(page)).timer.status).toBe('paused');
  await page.mouse.click(2, 2);
  expect((await snap(page)).timer.status).toBe('paused');
  await page.locator('#mobile-pause').evaluate((el) => el.click());
  await expect.poll(async () => (await snap(page)).timer.status).toBe('running');
  expect((await snap(page)).stickerColors).toEqual(colors);
});
test('puzzle selector stays in the topbar and saved times scroll in desktop and compact history', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1360, height: 720 });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('times-seeded')) return;
    sessionStorage.setItem('times-seeded', 'yes');
    localStorage.setItem(
      'master-fto-v1',
      JSON.stringify({
        size: 4,
        solves: {
          4: {
            history: [],
            redo: [],
            timer: {
              status: 'idle',
              bestMs: 10000,
              lastMs: 109000,
              completed: 100,
              times: Array.from({ length: 100 }, (_, i) => ({
                ms: 10000 + i * 1000,
                at: '2026-11-02T00:00:00.000Z',
              })),
            },
          },
        },
      }),
    );
  });
  await setup(page, 4);
  await expect(page.locator('#solve-times li')).toHaveCount(100);
  await expect(page.locator('#solve-times li').first()).toContainText('1:49.00');
  await expect(page.locator('#timer-value')).toHaveText('00:00');
  const board = await page.locator('#keyboard-overlay').boundingBox();
  const list = await page.locator('#solve-times').boundingBox();
  const header = await page.locator('.topbar').boundingBox();
  const picker = await page.locator('#puzzles').boundingBox();
  expect(picker.y).toBeGreaterThanOrEqual(header.y);
  expect(picker.y + picker.height).toBeLessThanOrEqual(header.y + header.height);
  expect(list.y + list.height).toBeLessThanOrEqual(board.y);
  expect(
    await page.locator('#solve-times').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#mobile-history').click();
  await expect(page.locator('#history-times li')).toHaveCount(100);
  expect(
    await page.locator('#history-times').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('#close-history').click();
  await selectSize(page, '3');
  await expect(page.locator('#solve-times li')).toHaveCount(0);
  await selectSize(page, '4');
  await expect(page.locator('#solve-times li')).toHaveCount(100);
  await page.reload();
  await ready(page);
  await expect(page.locator('#solve-times li')).toHaveCount(100);
});
