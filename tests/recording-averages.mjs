import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SolveRecorder } from '../src/solve-recording.js';
import { defaultConfig } from '../src/keyboard-engine.js';
function fixture(i) {
  let now = 0;
  const view = { rotation: [0, 0, 0, 1], radius: 10 },
    r = new SolveRecorder({}, () => now);
  r.arm({
    size: 3,
    scramble: [{ normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' }],
    view,
    keyboard: defaultConfig(3),
    colors: {},
  });
  r.begin(view, defaultConfig(3));
  now = 1000;
  const recording = r.finish(1000 + i, true),
    at = new Date(Date.UTC(2026, 10, 20, 0, 0, i)).toISOString();
  return { recording, entry: { ms: 1000 + i, dnf: false, at, scramble: 'U' } };
}
const fixtures = Array.from({ length: 36 }, (_, i) => fixture(i)),
  browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
  }),
  page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(15000);
const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
await context.route('https://averages.test/**', async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/shared/config.js'))
    return route.fulfill({
      contentType: 'text/javascript',
      body: 'export const backendConfig={};',
    });
  let target = url.pathname.startsWith('/__src/')
    ? path.resolve('src', url.pathname.slice(7))
    : path.resolve('dist', '.' + url.pathname);
  if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
  try {
    await route.fulfill({
      body: await readFile(target),
      contentType: mime[path.extname(target)] ?? 'application/octet-stream',
    });
  } catch {
    await route.fulfill({ status: 404 });
  }
});
try {
  await page.goto('https://averages.test/');
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  const result = await page.evaluate(async (fixtures) => {
    const { RecordingAlbum, validateAlbumBackup } = await import('/__src/recording-album.js'),
      { averageWindow } = await import('/__src/solve-statistics.js');
    const album = new RecordingAlbum(),
      times = [];
    const check = (ok, msg) => {
        if (!ok) throw Error(msg);
      },
      reject = async (task, msg) => {
        let rejected = false;
        try {
          await task();
        } catch {
          rejected = true;
        }
        check(rejected, msg);
      };
    for (const { recording, entry } of fixtures.slice(0, 12)) {
      times.push(entry);
      await album.remember(recording, { entry });
    }
    const five = await album.prepareAverage(3, times, averageWindow(times, 5)),
      twelve = await album.prepareAverage(3, times, averageWindow(times, 12));
    await Promise.all([album.saveGroup(five), album.saveGroup(five)]);
    await album.saveGroup(twelve);
    check((await album.listGroups()).length === 2, 'duplicate saved group');
    check((await album.list()).length === 12, 'duplicate recording payloads');
    const pack = await album.exportGroup(twelve),
      backup = await album.export();
    await validateAlbumBackup(backup);
    await album.restoreValidated(backup);
    check((await album.listGroups()).length === 2, 'restore lost averages');
    await reject(() => album.remove(twelve.members[0].id), 'deleted referenced recording');
    for (const { recording, entry } of fixtures.slice(12, 36)) {
      times.push(entry);
      await album.remember(recording, { entry });
    }
    check(
      (await album.list()).length === 24,
      'rolling retention lost pinned average or did not evict',
    );
    await album.removeGroup(five.id);
    check((await album.list()).length === 24, 'overlap deleted recording');
    await album.removeGroup(twelve.id);
    check((await album.list()).length === 12, 'group-only recordings not pruned');
    await album.restoreValidated({ format: 'fto-recording-album-v1', entries: [] });
    await album.importGroup(pack);
    await album.importGroup(pack);
    check(
      (await album.list()).length === 12 && (await album.listGroups()).length === 1,
      'import not deduplicated',
    );
    const broken = structuredClone(pack);
    broken.entries.pop();
    await reject(() => album.importGroup(broken), 'accepted missing recording');
    const extra = structuredClone(pack);
    extra.entries.push(pack.entries[0]);
    await reject(() => album.importGroup(extra), 'accepted extra payload');
    const wrong = structuredClone(pack);
    wrong.group.members[0].ms++;
    await reject(() => album.importGroup(wrong), 'accepted changed member time');
    check((await album.listGroups()).length === 1, 'invalid import mutated album');
    await album.restoreValidated({ format: 'fto-recording-album-v1', entries: [] });
    const dnfTimes = fixtures.slice(0, 5).map((f) => ({ ...f.entry }));
    dnfTimes[0].dnf = true;
    for (let i = 0; i < 5; i++)
      await album.remember(i === 0 ? null : fixtures[i].recording, { size: 3, entry: dnfTimes[i] });
    const dnf = await album.prepareAverage(3, dnfTimes, averageWindow(dnfTimes, 5));
    check(dnf.members[0].id === null && dnf.averageMs !== null, 'DNF trimming failed');
    await album.saveGroup(dnf);
    await album.restoreValidated({ format: 'fto-recording-album-v1', entries: [] });
    for (const { recording, entry } of fixtures.slice(0, 12))
      await album.remember(recording, { entry });
    const rows = await album.list();
    await album.remove(rows[0].id);
    await reject(
      () =>
        album.prepareAverage(
          3,
          fixtures.slice(0, 12).map((f) => f.entry),
          { start: 0, end: 12 },
        ),
      'accepted unavailable recording',
    );
    await album.restoreValidated(backup);
    await album.removeGroup(twelve.id);
    return { times: fixtures.slice(0, 12).map((f) => f.entry), pack, backup };
  }, fixtures);

  // Seed a real timer session, then use production statistics and album UI.
  await page.addInitScript(({ times }) => {
    if (window.name === 'average-seeded') return;
    window.name = 'average-seeded';
    localStorage.setItem(
      'master-fto-v1',
      JSON.stringify({
        size: 3,
        solves: {
          3: {
            history: [],
            redo: [],
            undoFloor: 0,
            timer: { times, bestMs: 1000, status: 'idle', elapsedMs: 0, completed: 12 },
          },
        },
      }),
    );
  }, result);
  await page.reload();
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  await page
    .locator('#solve-times li:first-child')
    .getByRole('button', { name: 'ao5 ending at solve 12', exact: true })
    .click();
  await page.locator('#statistics-share').click();
  await page.locator('#average-share-save').filter({ hasText: 'Saved to album' }).waitFor();
  assert.equal(await page.locator('#average-share-solves li').count(), 5);
  await page.locator('#close-average-share').click();
  await page.locator('#close-statistics').click();
  await page
    .locator('#solve-times li:first-child')
    .getByRole('button', { name: 'ao12 ending at solve 12', exact: true })
    .click();
  await page.locator('#statistics-share').click();
  await page.locator('#average-share-save:not(:disabled)').waitFor();
  assert.equal(await page.locator('#average-share-save').textContent(), 'Save ao12 to album');
  await page.locator('#average-share-save').click();
  await page.locator('#average-share-save').filter({ hasText: 'Saved to album' }).waitFor();
  assert.equal(await page.locator('#average-share-solves li').count(), 12);
  await page.locator('#average-share-copy').click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /avg of 12/);
  const downloaded = page.waitForEvent('download');
  await page.locator('#average-share-json').click();
  const exported = JSON.parse(await readFile(await (await downloaded).path(), 'utf8'));
  assert.equal(exported.format, 'fto-recording-average-v1');
  assert.equal(exported.entries.length, 12);
  await mkdir('/tmp/ftoers-averages', { recursive: true });
  await page.screenshot({ path: '/tmp/ftoers-averages/share.png' });
  await page.locator('#close-average-share').click();
  await page.locator('#close-statistics').click();
  await page.getByRole('button', { name: 'Current Single', exact: true }).click();
  assert.equal(await page.locator('#statistics-share').isVisible(), false);
  await page.locator('#close-statistics').click();
  await page.getByRole('button', { name: 'PB ao5', exact: true }).click();
  assert.equal(await page.locator('#statistics-share').isVisible(), false);
  await page.locator('#close-statistics').click();
  await page.locator('#album').click();
  await page.waitForFunction(() => document.querySelectorAll('.album-average').length === 2);
  assert.equal(await page.locator('.album-average').count(), 2);
  await page
    .locator('.album-average')
    .first()
    .getByRole('button', { name: /Open ao/ })
    .click();
  assert.equal(await page.locator('#average-share-details').evaluate((e) => e.open), true);
  await page.getByRole('button', { name: 'Play solve 1', exact: true }).click();
  await page.waitForFunction(() => window.fto.snapshot().replay?.size === 3);
  await page.locator('#home-replay-exit').click();
  await page.locator('#album').click();
  await page.locator('#album-import-recording').click();
  await page.locator('#recording-paste').fill(JSON.stringify(exported));
  await page.locator('#recording-paste-load').click();
  await page.locator('#average-share-dialog[open]').waitFor();
  await page.locator('#average-share-save').filter({ hasText: 'Saved to album' }).waitFor();
  assert.equal(await page.locator('#average-share-save').textContent(), 'Saved to album');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const box = await page.locator('#average-share-dialog').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    assert.equal(
      await page.locator('#average-share-dialog').evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
    );
    await page.screenshot({ path: `/tmp/ftoers-averages/mobile-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Average recording checks passed: deduplication, retention, deletion, backup/import validation, DNF slots, statistics Share, album replay and mobile layout.',
  );
} finally {
  await browser.close();
}
