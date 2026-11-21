import { installKeyboard } from './keyboard-fixture.js';
import { test, expect } from './fixtures.js';
import { freezeClock, selectSize, withSettings } from './helpers.js';
const snapshot = (page) => page.evaluate(() => window.fto.snapshot());
const idle = (page) =>
  page.waitForFunction(
    () => window.fto && !window.fto.snapshot().busy && !window.fto.snapshot().queued,
  );
const signature = (state) =>
  state
    .map(
      (s) =>
        `${s.color}:${s.vertices
          .map((v) => v.join(','))
          .sort()
          .join(';')}`,
    )
    .sort()
    .join('|');
test.beforeEach(async ({ page }) => {
  await installKeyboard(page);
  await page.goto('/');
  await idle(page);
  await withSettings(page, () => page.locator('#animate').uncheck());
});
async function facePoint(page) {
  const box = await page
    .locator('.face-label:not([hidden])')
    .filter({ hasText: /^F$/ })
    .boundingBox();
  return { x: box.x + box.width / 2 + 13, y: box.y + box.height / 2 + 8 };
}
test('every size renders, turns its deepest slice and undoes', async ({ page }) => {
  // Exhaustive coverage of all 19 supported puzzle sizes, including 20×20 geometry.
  test.setTimeout(180000);
  await page.clock.install();
  await freezeClock(page);
  // Compare complete geometry in the browser. Returning 3 full 20×20 snapshots
  // per iteration needlessly serializes megabytes into the protocol and trace.
  const geometry = (capture = false) =>
    page.evaluate((capture) => {
      const s = window.fto.snapshot();
      const signature = s.state
        .map(
          (sticker) =>
            `${sticker.color}:${sticker.vertices
              .map((vertex) => vertex.join(','))
              .sort()
              .join(';')}`,
        )
        .sort()
        .join('|');
      const unchanged = signature === window.sizeTestBaseline;
      if (capture) window.sizeTestBaseline = signature;
      return { size: s.size, stickers: s.state.length, last: s.history.at(-1), unchanged };
    }, capture);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (let size = 2; size <= 20; size++) {
    await selectSize(page, size);
    await idle(page);
    const before = await geometry(true);
    expect(before.size).toBe(size);
    expect(before.stickers).toBe(8 * size * size);
    await page.keyboard.press(size <= 10 ? `Digit${size % 10}` : `Shift+Digit${(size - 10) % 10}`);
    await page.keyboard.press('Shift+KeyF');
    await idle(page);
    const after = await geometry();
    expect(after.last).toMatchObject({ depth: size, count: 1 });
    expect(after.unchanged).toBe(false);
    await page.locator('#mobile-undo').click();
    await idle(page);
    expect((await geometry()).unchanged).toBe(true);
  }
  expect(errors).toEqual([]);
});
test('sizes preserve independent histories and restore the selected size on reload', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.clock.install();
  await freezeClock(page);
  await selectSize(page, 4);
  await page.keyboard.press('KeyU');
  await idle(page);
  const four = signature((await snapshot(page)).state);
  await selectSize(page, 20);
  await page.keyboard.press('Shift+Digit2');
  await page.keyboard.press('Shift+KeyR');
  await idle(page);
  const twenty = signature((await snapshot(page)).state);
  await page.reload();
  await idle(page);
  expect((await snapshot(page)).size).toBe(20);
  expect(signature((await snapshot(page)).state)).toBe(twenty);
  await selectSize(page, 4);
  expect(signature((await snapshot(page)).state)).toBe(four);
  await selectSize(page, 20);
  expect(signature((await snapshot(page)).state)).toBe(twenty);
});
test('mouse swipe turns one slice without orbit; background drag orbits without a move', async ({
  page,
}) => {
  expect((await snapshot(page)).pointerMode).toBe('swipe');
  const before = await snapshot(page),
    point = await facePoint(page);
  await page.mouse.click(point.x, point.y);
  expect((await snapshot(page)).history).toHaveLength(0);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 65, point.y + 10, { steps: 12 });
  await page.mouse.up();
  await idle(page);
  const after = await snapshot(page);
  expect(after.history).toHaveLength(1);
  expect(after.history[0].count).toBe(1);
  expect(after.orbit).toEqual(before.orbit);
  await page.locator('#mobile-undo').click();
  await idle(page);
  expect(signature((await snapshot(page)).state)).toBe(signature(before.state));
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 15, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + box.height * 0.5 + 30, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await snapshot(page)).orbit).not.toEqual(before.orbit);
  expect((await snapshot(page)).history).toHaveLength(0);
});
test('old 4×4 storage migrates without losing the solve', async ({ page }) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('legacy-seeded')) {
      localStorage.setItem(
        'master-fto-v1',
        JSON.stringify({
          history: [{ normal: [1, 1, 1], layer: 'inner', dir: 1, name: 'U' }],
          redo: [],
        }),
      );
      sessionStorage.setItem('legacy-seeded', 'yes');
    }
  });
  await page.reload();
  await idle(page);
  expect((await snapshot(page)).history).toHaveLength(1);
  expect((await snapshot(page)).solved).toBe(false);
  await selectSize(page, 2);
  await page.reload();
  await idle(page);
  await selectSize(page, 4);
  expect((await snapshot(page)).history).toHaveLength(1);
});
test('real touch swipe turns and pinch cancels the pending slice gesture', async ({
  page,
  context,
}) => {
  const client = await context.newCDPSession(page);
  const point = await facePoint(page);
  const send = (type, points) =>
    client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y, id]) => ({ x, y, id })),
    });
  const before = await snapshot(page);
  await send('touchStart', [[point.x, point.y, 1]]);
  await send('touchMove', [[point.x + 65, point.y + 10, 1]]);
  await send('touchEnd', []);
  await idle(page);
  const after = await snapshot(page);
  expect(after.history).toHaveLength(1);
  expect(after.orbit).toEqual(before.orbit);
  const p = await facePoint(page);
  await send('touchStart', [[p.x, p.y, 1]]);
  await send('touchStart', [
    [p.x, p.y, 1],
    [p.x + 55, p.y + 20, 2],
  ]);
  await send('touchMove', [
    [p.x - 10, p.y - 10, 1],
    [p.x + 85, p.y + 40, 2],
  ]);
  await send('touchEnd', []);
  await idle(page);
  expect((await snapshot(page)).history).toHaveLength(1);
  expect((await snapshot(page)).camera).not.toEqual(after.camera);
  await client.detach();
});
