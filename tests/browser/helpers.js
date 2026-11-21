import { expect } from '@playwright/test';
// Exercise the public puzzle selector rather than a removed settings control.
export async function selectSize(page, size) {
  await expect(page.locator('#puzzles')).toBeVisible();
  await page.locator('#puzzles').evaluate((el) => el.click());
  const choice = page.locator(`#puzzle-choices [data-size="${size}"]`);
  await expect(choice).toBeVisible();
  await choice.evaluate((el) => el.click());
  await page.waitForFunction((size) => window.fto?.snapshot().size === size, Number(size));
}
export async function openSettings(page) {
  await page.locator('#ft-account-trigger').evaluate((el) => el.click());
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#settings').evaluate((el) => el.click());
}
export async function openAbout(page) {
  await page.locator('#ft-account-trigger').evaluate((el) => el.click());
  await expect(page.locator('#about')).toBeVisible();
  await page.locator('#about').evaluate((el) => el.click());
}
export async function withSettings(page, action) {
  await openSettings(page);
  // On failure, Playwright disposes this context. Closing a parent dialog in
  // finally can block behind a child modal and hide the original assertion.
  const result = await action();
  await page.locator('#close-settings').click();
  return result;
}
export async function confirmAction(page, action, accept = true) {
  await action();
  await page.locator('#confirm-dialog').waitFor({ state: 'visible' });
  await page.locator(accept ? '#confirm-accept' : '#confirm-cancel').click();
  await page.locator('#confirm-dialog[data-pending]').waitFor({ state: 'detached' });
}
export async function scramble(page) {
  await confirmAction(page, () => requestScramble(page));
  // Setup callers need a usable inspection; animation tests use requestScramble.
  await page.waitForFunction(() => {
    const state = window.fto.snapshot();
    return !state.generatingScramble && state.timer.status === 'ready';
  });
}
export async function assignBinding(page, action, trigger) {
  await openBindings(page);
  await page.locator('#catalog-category').selectOption('all');
  const row = page.locator(`tr[data-action="${action}"]`);
  await row.locator('.add-key').click();
  if (trigger) await page.locator('#bind-key-trigger').fill(trigger);
  await page.locator('#bind-key-save').click();
}

// Date.now()+100 can already be in the past when a slow machine receives pauseAt.
// Pin wall time first, pause the timers, then restore an advancing wall clock.
export async function freezeClock(page, advance = 100) {
  const wallTime = await page.evaluate(() => Date.now());
  const target = new Date(wallTime + advance);
  await page.clock.setFixedTime(new Date(wallTime));
  await page.clock.pauseAt(target);
  await page.clock.setSystemTime(target);
}

export async function openBindings(page) {
  if (!(await page.locator('#bindings-dialog').isVisible()))
    await page.locator('#customize-bindings').click();
}
export async function resetKeyboardPreset(page, preset) {
  await confirmAction(page, () => page.locator(`#catalog-reset-${preset}`).click());
}
export async function createKeyboardMode(page, name, { keepOpen = true } = {}) {
  await openBindings(page);
  await page.locator('#catalog-mode-choice').click();
  await page.getByRole('button', { name: '+ New mode', exact: true }).click();
  await page.locator('#new-mode-name').fill(name);
  await page.locator('#save-mode-name').click();
  if (!keepOpen) await page.locator('#close-bindings').click();
}

async function pauseRunningSolve(page) {
  if (await page.evaluate(() => window.fto?.snapshot().timer.status === 'running'))
    await page.locator('#mobile-pause').click();
}
export async function requestScramble(page) {
  await pauseRunningSolve(page);
  await page.locator('#mobile-scramble').click();
}
export async function requestReset(page) {
  await pauseRunningSolve(page);
  await page.locator('#mobile-reset').click();
}

export async function waitForApp(page) {
  // This marker is set after the first scene draw. Avoid cloning the entire
  // puzzle/history just to poll whether initialization has completed.
  await page.waitForFunction(
    () => document.documentElement.hasAttribute('data-app-ready') && !!window.fto,
  );
}
