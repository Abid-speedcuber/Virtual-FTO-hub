import { waitForApp, selectSize, openSettings, withSettings } from './helpers.js';
import { test, expect } from './fixtures.js';

const ready = waitForApp;
const snap = (page) => page.evaluate(() => window.fto.snapshot());
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await ready(page);
});
test('default solve screen keeps puzzle controls and account actions in their intended locations', async ({
  page,
}) => {
  await expect(
    page.getByRole('navigation', { name: 'Application', exact: true }).getByRole('button'),
  ).toHaveCount(5);
  await expect(page.locator('#mobile-undo')).toBeVisible();
  await expect(page.locator('#mobile-redo')).toBeVisible();
  await expect(page.locator('#mobile-reset')).toBeVisible();
  await expect(page.locator('#mobile-scramble')).toBeVisible();
  await expect(page.locator('#settings')).toBeHidden();
  await expect(page.locator('canvas')).toBeVisible();
  await withSettings(page, async () => {
    await expect(page.locator('#edit-keyboard')).toBeVisible();
    await page.keyboard.press('f');
    expect((await snap(page)).history).toHaveLength(0);
  });
  await openSettings(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-dialog')).not.toBeVisible();
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.fto.snapshot().history.length === 1);
});
test('all preferences and the camera view survive reload', async ({ page }) => {
  test.setTimeout(60000);
  await selectSize(page, 9);
  await withSettings(page, async () => {
    await page.getByLabel('Pointer controls', { exact: true }).selectOption('legacy');
    await page.getByRole('switch', { name: 'Follow the view', exact: true }).uncheck();
    await page.getByRole('switch', { name: 'Animate turns', exact: true }).uncheck();
    await page.getByRole('switch', { name: 'Show face labels', exact: true }).uncheck();
    await page.getByRole('switch', { name: 'Disable sounds', exact: true }).check();
  });
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 60, box.y + box.height * 0.5 + 30, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  const before = await snap(page);
  await page.reload();
  await ready(page);
  const after = await snap(page);
  expect(after.size).toBe(9);
  expect(after.pointerMode).toBe('legacy');
  after.orbit.forEach((v, i) => expect(v).toBeCloseTo(before.orbit[i], 10));
  after.camera.forEach((v, i) => expect(v).toBeCloseTo(before.camera[i], 10));
  await expect(page.locator('#labels')).toBeHidden();

  await withSettings(page, async () => {
    await expect(
      page.getByRole('switch', { name: 'Follow the view', exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('switch', { name: 'Animate turns', exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('switch', { name: 'Show face labels', exact: true }),
    ).not.toBeChecked();
    await expect(page.getByRole('switch', { name: 'Disable sounds', exact: true })).toBeChecked();
  });
});
test('mobile canvas and settings fit without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/minimal-mobile.png' });
  await openSettings(page);
  const box = await page.locator('#settings-dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.locator('#settings-dialog').screenshot({ path: 'test-results/settings-mobile.png' });
});
