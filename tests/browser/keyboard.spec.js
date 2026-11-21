import {
  waitForApp,
  createKeyboardMode,
  openBindings,
  freezeClock,
  selectSize,
  openSettings,
  withSettings,
  scramble,
  assignBinding,
} from './helpers.js';

import { installKeyboard, regressionKeyboard } from './keyboard-fixture.js';
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await installKeyboard(page);
});
const ready = waitForApp;
const snapshot = (page) => page.evaluate(() => window.fto.snapshot());
async function setup(page, size = '4') {
  await page.clock.install();
  await page.goto('/');
  await ready(page);
  await selectSize(page, size);
  await withSettings(page, async () => {
    await page.locator('#animate').uncheck();
    await page.locator('#animate-scrambling').uncheck();
    await page.locator('#show-keyboard').check();
  });
  // A tap must not become a hold because protocol commands run slowly.
  await freezeClock(page);
}
async function editor(page) {
  await openSettings(page);
  await page.locator('#edit-keyboard').click();
}
async function closeEditor(page) {
  for (const id of ['close-bind-key', 'close-bindings', 'close-keyboard-import']) {
    const button = page.locator('#' + id);
    if (await button.isVisible()) await button.click();
  }
  await page.locator('#close-keyboard').click();
  await page.locator('#close-settings').click();
}
async function bind(
  page,
  trigger,
  { type = 'move', face = 'U', dir = '-1', kind = 'outer', depth = '1', mode } = {},
) {
  const action =
    type === 'move'
      ? `move:${face}:${Number(dir)}:${kind}:${Number(depth)}:false`
      : type === 'depth'
        ? `depth:${Number(depth)}::`
        : type === 'hold-mode'
          ? `hold-mode::${mode}:`
          : type === 'suffix-slice'
            ? 'suffix-slice:::'
            : `${type}:::`;
  await assignBinding(page, action, trigger);
}
test('physical keyboard shows resolved actions, lights real input, and persists its display', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#keyboard-overlay')).toBeVisible();
  await expect(page.locator('#keyboard-svg [data-code="KeyF"] text')).toHaveText('F');
  await expect(page.locator('#keyboard-svg [data-code="KeyQ"] text')).toHaveText('');
  await page.keyboard.down('KeyF');
  await expect(page.locator('#keyboard-svg [data-code="KeyF"]')).toHaveClass(/pressed/);
  await expect(page.locator('#keyboard-svg [data-code="KeyR"]')).not.toHaveClass(/pressed/);
  await page.keyboard.up('KeyF');
  expect((await snapshot(page)).history).toHaveLength(1);
  expect((await snapshot(page)).keyboard.stats.total).toBe(1);
  await page.reload();
  await ready(page);
  await expect(page.locator('#keyboard-overlay')).toBeVisible();
  await editor(page);
  await page.locator('#keyboard-layout').selectOption('iso');
  await page.locator('#keyboard-numpad').check();
  await closeEditor(page);
  await expect(page.locator('#keyboard-svg [data-code="IntlBackslash"]')).toBeVisible();
  await expect(page.locator('#keyboard-svg [data-code="NumpadEnter"]')).toBeVisible();
  await page.locator('#keyboard-overlay').screenshot({ path: 'test-results/keyboard-iso.png' });
});
test('optional one-shot depths, Shift slices, and suffix TPS exclusion', async ({ page }) => {
  await setup(page, '20');
  await page.keyboard.press('Digit8');
  expect((await snapshot(page)).keyboard.pending).toBe(8);
  expect((await snapshot(page)).keyboard.stats.total).toBe(0);
  await expect(page.locator('#keyboard-svg [data-code="KeyF"] text')).toHaveText('8Fw');
  await page.keyboard.press('Shift+KeyF');
  let s = await snapshot(page);
  expect(s.history.at(-1)).toMatchObject({ depth: 8, count: 1, dir: 1 });
  expect(s.keyboard.pending).toBe(null);
  expect(s.keyboard.stats.total).toBe(1);
  await page.keyboard.press('Shift+Digit8');
  await page.keyboard.down('KeyR');
  await expect(page.locator('#keyboard-svg [data-code="KeyR"] text')).toHaveText('18Rw');
  await page.keyboard.up('KeyR');
  s = await snapshot(page);
  expect(s.history.at(-1)).toMatchObject({ depth: 1, count: 18 });
  expect(s.keyboard.stats.total).toBe(2);
  await page.keyboard.press('KeyR');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ depth: 1, count: 1 });
  await page.keyboard.press('Control+z');
  expect((await snapshot(page)).keyboard.stats.total).toBe(3);
  await page.clock.runFor(1100);
  expect((await snapshot(page)).keyboard.stats.tps).toBe(0);
});
test('editable chords and tap sequences execute exact actions with move labels instead of letters', async ({
  page,
}) => {
  await setup(page);
  await editor(page);
  await bind(page, 'A+F');
  await bind(page, 'S F', { face: 'R', dir: '1' });
  await closeEditor(page);
  await page.keyboard.down('KeyA');
  await expect(page.locator('#keyboard-svg [data-code="KeyF"] text')).toHaveText('U′');
  await page.keyboard.press('KeyF');
  await page.keyboard.up('KeyA');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ name: 'U', dir: -1 });
  await page.keyboard.press('KeyS');
  await page.keyboard.press('KeyF');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ name: 'R', dir: 1 });
  await page.reload();
  await ready(page);
  await page.keyboard.down('KeyA');
  await page.keyboard.press('KeyF');
  await page.keyboard.up('KeyA');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ name: 'U', dir: -1 });
});
test('mode cycle and held modes reuse a key without duplicate actions in one mode', async ({
  page,
}) => {
  await setup(page);
  await editor(page);
  await createKeyboardMode(page, 'EIF');
  const mode = (await snapshot(page)).keyboard.config.modes.find((mode) => mode.name === 'EIF').id;
  await bind(page, 'F', { face: 'U', dir: '-1' });
  await bind(page, 'F', { face: 'R' });
  await expect(page.locator('#bind-key-message')).toContainText('assigned');
  await page.locator('#close-bind-key').click();
  await bind(page, 'M', { type: 'next-mode' });
  await page.locator('#catalog-mode-choice').click();
  await page.getByRole('option', { name: 'CIF (Default)', exact: true }).click();
  await bind(page, 'Space', { type: 'hold-mode', mode });
  await closeEditor(page);
  await page.keyboard.press('KeyM');
  expect((await snapshot(page)).keyboard.modeName).toBe('EIF');
  await page.keyboard.press('KeyF');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ name: 'U', dir: -1 });
  await page.keyboard.press('KeyM');
  await page.keyboard.down('Space');
  expect((await snapshot(page)).keyboard.modeName).toBe('EIF');
  await page.keyboard.press('KeyF');
  await page.keyboard.up('Space');
  expect((await snapshot(page)).keyboard.modeName).toBe('CIF');
  expect((await snapshot(page)).keyboard.stats.total).toBe(2);
});
test('recording a binding never turns the puzzle; repeated keys and focus loss leave no stuck input', async ({
  page,
}) => {
  await setup(page);
  await editor(page);
  await openBindings(page);
  await page.locator('tr[data-action="move:U:-1:outer:1:false"] .add-key').click();
  await page.locator('#bind-key-listen').click();
  await page.keyboard.press('Control+KeyA');
  await expect(page.locator('#bind-key-trigger')).toHaveValue(/Ctrl.*A|A.*Ctrl/);
  expect((await snapshot(page)).history).toHaveLength(0);
  await closeEditor(page);
  await page.keyboard.down('KeyF');
  await page.keyboard.down('KeyF');
  expect((await snapshot(page)).history).toHaveLength(1);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await snapshot(page)).keyboard.pressed).toHaveLength(0);
  await page.keyboard.up('KeyF');
  await expect(page.locator('#keyboard-svg [data-code="KeyF"]')).not.toHaveClass(/pressed/);
});

test('on-screen keys and manual moves count, automatic scramble and undo do not', async ({
  page,
}) => {
  await setup(page, '4');
  await page.locator('#keyboard-svg [data-code="KeyF"]').click();
  expect((await snapshot(page)).keyboard.stats.total).toBe(1);
  await withSettings(page, () => page.locator('#pointer-mode').selectOption('legacy'));
  const face = await page
    .locator('.face-label:not([hidden])')
    .filter({ hasText: /^F$/ })
    .boundingBox();
  await page.mouse.click(face.x + face.width / 2, face.y + face.height / 2);
  expect((await snapshot(page)).keyboard.stats.total).toBe(2);
  await page.locator('#mobile-undo').click();
  expect((await snapshot(page)).keyboard.stats.total).toBe(2);
  await scramble(page);
  await page.waitForFunction(() => !window.fto.snapshot().busy && !window.fto.snapshot().queued);
  expect((await snapshot(page)).keyboard.stats.total).toBe(2);
  await page.keyboard.press('Digit8');
  await expect(page.locator('#keyboard-svg [data-code="Digit8"] text')).toHaveText('');
  expect((await snapshot(page)).keyboard.pending).toBe(null);
  expect((await snapshot(page)).keyboard.stats.total).toBe(2);
});
test('import is atomic, exported bindings round trip, and recording preferences persist', async ({
  page,
}) => {
  await setup(page);
  await editor(page);
  const initial = (await snapshot(page)).keyboard.config;
  const bad = structuredClone(initial);
  bad.modes[0].bindings.push({ ...bad.modes[0].bindings[0], id: 'duplicate' });
  if (!(await page.locator('#keyboard-import-dialog').isVisible()))
    await page.locator('#catalog-choose-import').click();
  await page.locator('#catalog-import').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.locator('#keyboard-import-message')).toContainText('already has an action');
  expect((await snapshot(page)).keyboard.config.modes[0].bindings).toHaveLength(
    initial.modes[0].bindings.length,
  );
  const valid = structuredClone(initial);
  valid.display = {
    ...valid.display,
    layout: 'iso',
    numpad: true,
    width: 360,
    opacity: 70,
    window: 3,
  };
  valid.sequenceTimeout = 2100;
  if (!(await page.locator('#keyboard-import-dialog').isVisible()))
    await page.locator('#catalog-choose-import').click();
  await page.locator('#catalog-import').setInputFiles({
    name: 'keyboard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(valid)),
  });
  await page.locator('#confirm-accept').click();
  await expect(page.locator('#catalog-message')).toHaveText('Keyboard imported.');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#catalog-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`fto-${(await snapshot(page)).size}-keyboard.json`);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported.display).toMatchObject(valid.display);
  expect(exported.modes[0].bindings).toEqual(valid.modes[0].bindings);
  await closeEditor(page);
  await page.reload();
  await ready(page);
  expect((await snapshot(page)).keyboard.config.display).toMatchObject(valid.display);
  expect((await snapshot(page)).keyboard.config.sequenceTimeout).toBe(2100);
  await expect(page.locator('#keyboard-svg [data-code="IntlBackslash"]')).toBeVisible();
  await expect(page.locator('#keyboard-svg [data-code="Numpad0"]')).toBeVisible();
});

test('keyboard and timer use the space beside the square puzzle', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const before = await page.locator('canvas').boundingBox();
  await withSettings(page, () => page.locator('#show-keyboard').check());
  const canvas = await page.locator('canvas').boundingBox(),
    keyboard = await page.locator('#keyboard-overlay').boundingBox();
  expect(canvas).toEqual(before);
  expect(canvas.width).toBe(canvas.height);
  expect(canvas.x).toBe(0);
  expect(keyboard.x).toBeGreaterThanOrEqual(canvas.x + canvas.width);
  await page.screenshot({ path: 'test-results/keyboard-corner.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#keyboard-overlay')).toBeHidden();
  await expect(page.locator('#mobile-controls')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(844);
  await page.screenshot({ path: 'test-results/keyboard-corner-mobile.png' });
});
test('all press highlights release immediately; the next turn is not sliced', async ({ page }) => {
  await setup(page, '20');
  const immediate = await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'ShiftLeft',
        key: 'Shift',
        shiftKey: true,
        bubbles: true,
      }),
    );
    const held = document.querySelector('[data-code="ShiftLeft"]').classList.contains('pressed');
    window.dispatchEvent(
      new KeyboardEvent('keyup', {
        code: 'ShiftLeft',
        key: 'Shift',
        shiftKey: false,
        bubbles: true,
      }),
    );
    const released = !document
      .querySelector('[data-code="ShiftLeft"]')
      .classList.contains('pressed');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', shiftKey: false, bubbles: true }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'KeyF', key: 'f', shiftKey: false, bubbles: true }),
    );
    return {
      held,
      released,
      moveReleased: !document.querySelector('[data-code="KeyF"]').classList.contains('pressed'),
      state: window.fto.snapshot().keyboard.pressed,
    };
  });
  expect(immediate).toEqual({ held: true, released: true, moveReleased: true, state: [] });
  await page.keyboard.press('Shift+Digit8');
  await page.keyboard.press('KeyF');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ depth: 1, count: 18 });
  await expect(page.locator('#keyboard-svg [data-code="ShiftLeft"]')).not.toHaveClass(/pressed/);
});
test('missed Shift key-up is repaired from the next physical key event', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'ShiftLeft',
        key: 'Shift',
        shiftKey: true,
        bubbles: true,
      }),
    );
    if (!window.fto.snapshot().keyboard.pressed.includes('ShiftLeft'))
      throw Error('Test must start with Shift held');
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', shiftKey: false, bubbles: true }),
    );
  });
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ depth: 1, count: 1 });
  expect((await snapshot(page)).keyboard.pressed).not.toContain('ShiftLeft');
  await expect(page.locator('#keyboard-svg [data-code="ShiftLeft"]')).not.toHaveClass(/pressed/);
});

test('old large keyboard preferences shrink without losing a saved keymap', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const config = window.fto.snapshot().keyboard.config;
    config.display.width = 900;
    delete config.display.cornerVersion;
    config.modes[0].name = 'Saved keymap';
    config.modes[0].bindings.push({
      id: 'saved-action',
      trigger: 'A+F',
      action: { type: 'move', face: 'U', dir: -1, kind: 'outer', depth: 1 },
    });
    localStorage.removeItem('master-fto-keyboard-v2');
    localStorage.setItem('master-fto-keyboard-v1', JSON.stringify(config));
  });
  await page.reload();
  await ready(page);
  const config = (await snapshot(page)).keyboard.config;
  expect(config.display.width).toBe(900);
  expect(config.modes[0].name).toBe('Saved keymap');
  expect(config.modes[0].bindings.some((b) => b.id === 'saved-action')).toBe(true);
  await page.keyboard.down('KeyA');
  await page.keyboard.press('KeyF');
  await page.keyboard.up('KeyA');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ name: 'U', dir: -1 });
});

test('suffix glows until the next accepted turn; unbound keys do not consume it', async ({
  page,
}) => {
  await setup(page, '7');
  await expect(page.locator('#keyboard-svg [data-code="Digit8"] text')).toHaveText('');
  await page.keyboard.press('Digit6');
  await page.keyboard.press('KeyQ');
  expect((await snapshot(page)).keyboard.pending).toBe(6);
  await expect(page.locator('#keyboard-svg [data-code="Digit6"]')).toHaveClass(/selected/);
  await expect(page.locator('#keyboard-svg [data-code="KeyF"]')).toHaveClass(/affected/);
  await page.keyboard.press('KeyF');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ depth: 1, count: 6 });
  expect((await snapshot(page)).keyboard.pending).toBe(null);
  await expect(page.locator('#keyboard-svg [data-code="Digit6"]')).not.toHaveClass(/selected/);
  await expect(page.locator('#keyboard-svg [data-code="KeyF"]')).not.toHaveClass(/affected/);
  await page.keyboard.press('KeyF');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ depth: 1, count: 1 });
  expect((await snapshot(page)).keyboard.stats.total).toBe(2);
});
test('unrelated suffix keys stay blank, including shifted and custom bindings', async ({
  page,
}) => {
  // Legacy files can contain unsupported suffixes; the current catalog does not offer them.
  const legacy = regressionKeyboard();
  legacy.modes[0].bindings.push({
    id: 'legacy-custom-depth',
    trigger: 'A',
    action: { type: 'depth', depth: 8 },
  });
  await page.addInitScript((config) => {
    const saved = JSON.parse(localStorage.getItem('master-fto-keyboard-v2') || '{"profiles":{}}');
    saved.profiles[7] = config;
    saved.display = config.display;
    localStorage.setItem('master-fto-keyboard-v2', JSON.stringify(saved));
  }, legacy);
  await setup(page, '7');
  await expect(page.locator('#keyboard-svg [data-code="KeyA"] text')).toHaveText('');
  await page.keyboard.press('Digit6');
  await page.keyboard.press('Digit8');
  expect((await snapshot(page)).keyboard.pending).toBe(6);
  await page.keyboard.press('KeyA');
  expect((await snapshot(page)).keyboard.pending).toBe(6);
  await page.keyboard.down('Shift');
  await expect(page.locator('#keyboard-svg [data-code="Digit1"] text')).toHaveText('');
  await page.keyboard.press('Digit1');
  await page.keyboard.up('Shift');
  expect((await snapshot(page)).keyboard.pending).toBe(6);
  await page.keyboard.press('Digit6');
  expect((await snapshot(page)).keyboard.pending).toBe(null);
  expect((await snapshot(page)).keyboard.stats.total).toBe(0);
});
test('shifted suffix keeps its selected label after modifier release and cancels on the same chord', async ({
  page,
}) => {
  await setup(page, '20');
  await page.keyboard.press('Shift+Digit8');
  await page.clock.runFor(200);
  await expect(page.locator('#keyboard-svg [data-code="Digit8"] text')).toHaveText('18w');
  await expect(page.locator('#keyboard-svg [data-code="Digit8"]')).toHaveClass(/selected/);
  await expect(page.locator('#keyboard-svg [data-code="ShiftLeft"]')).not.toHaveClass(/pressed/);
  await page.keyboard.press('KeyF');
  expect((await snapshot(page)).history.at(-1)).toMatchObject({ depth: 1, count: 18 });
  expect((await snapshot(page)).keyboard.pending).toBe(null);
  await page.keyboard.press('Shift+Digit8');
  await page.keyboard.press('Shift+Digit8');
  expect((await snapshot(page)).keyboard.pending).toBe(null);
  await expect(page.locator('#keyboard-svg [data-code="Digit8"]')).not.toHaveClass(/selected/);
});

test('a 10ms key press has exactly a 10ms press-state lifetime, ignoring old glow preferences', async ({
  page,
}) => {
  await setup(page, '4');
  await page.evaluate(() => {
    const config = window.fto.snapshot().keyboard.config;
    config.display.highlight = 600;
    localStorage.removeItem('master-fto-keyboard-v2');
    localStorage.setItem('master-fto-keyboard-v1', JSON.stringify(config));
  });
  await page.reload();
  await ready(page);
  expect((await snapshot(page)).keyboard.config.display).not.toHaveProperty('highlight');
  await freezeClock(page);
  await page.evaluate(() => {
    window.pressTrace = [];
    for (const type of ['keydown', 'keyup'])
      window.addEventListener(type, (event) => {
        if (event.code === 'KeyF')
          window.pressTrace.push({
            type,
            time: performance.now(),
            lit: document.querySelector('[data-code="KeyF"]').classList.contains('pressed'),
          });
      });
  });
  await page.keyboard.down('KeyF');
  expect(
    await page
      .locator('#keyboard-svg [data-code="KeyF"]')
      .evaluate((el) => el.classList.contains('pressed')),
  ).toBe(true);
  await page.clock.runFor(10);
  await page.keyboard.up('KeyF');
  const trace = await page.evaluate(() => window.pressTrace);
  expect(trace.map((e) => e.lit)).toEqual([true, false]);
  expect(trace[1].time - trace[0].time).toBe(10);
  expect(
    await page
      .locator('#keyboard-svg [data-code="KeyF"]')
      .evaluate((el) => el.classList.contains('pressed')),
  ).toBe(false);
  await page.clock.runFor(1);
  expect(
    await page
      .locator('#keyboard-svg [data-code="KeyF"]')
      .evaluate((el) => el.classList.contains('pressed')),
  ).toBe(false);
});
