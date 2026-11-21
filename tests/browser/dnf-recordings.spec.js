import { test, expect } from '@playwright/test';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';
const U = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' },
  view = { rotation: [0, 0, 0, 1], radius: 10 };
test('abandoned attempts retain replayable DNF recordings in the recent album and saved averages', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.route('**/worker.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "self.onmessage=()=>self.postMessage({scramble:'U F'});",
    }),
  );
  const recorder = new SolveRecorder();
  recorder.arm({ size: 3, scramble: [U], view, keyboard: defaultConfig(3), colors: {} });
  await page.addInitScript((recordings) => {
    if (window.name === 'dnf-seeded') return;
    window.name = 'dnf-seeded';
    localStorage.setItem(
      'master-fto-settings-v1',
      JSON.stringify({ animate: false, animateScrambling: false, follow: false }),
    );
    localStorage.setItem(
      'master-fto-v1',
      JSON.stringify({
        size: 3,
        solves: {
          3: {
            history: [{ normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' }],
            redo: [],
            undoFloor: 1,
            recordings,
            timer: { status: 'ready' },
          },
        },
      }),
    );
  }, recorder.serialize());
  await page.goto('/');
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(
      () => window.fto.snapshot().timer.status === 'running' && !window.fto.snapshot().busy,
    );
    if (i < 4) {
      await page.evaluate(() => {
        for (let i = 0; i < 3; i++)
          for (const type of ['keydown', 'keyup'])
            window.dispatchEvent(new KeyboardEvent(type, { code: 'Escape', bubbles: true }));
      });
      await page.waitForFunction(() => window.fto.snapshot().timer.status === 'ready');
    } else {
      await page.locator('#mobile-pause').click();
      await page.locator('#mobile-reset').click();
      await page.locator('#confirm-accept').click();
      await page.waitForFunction(() => window.fto.snapshot().timer.status === 'idle');
    }
  }
  expect(await page.evaluate(() => window.fto.snapshot().timer.times.every((t) => t.dnf))).toBe(
    true,
  );
  expect(await page.evaluate(() => window.fto.snapshot().timer.bestMs)).toBeNull();
  await page.locator('#album').click();
  await expect(page.locator('#album-list .album-entry')).toHaveCount(5);
  await expect(page.locator('.album-info strong').first()).toContainText('DNF (');
  await page.locator('.album-play').first().click();
  await page.waitForFunction(() => window.fto.snapshot().replay?.size === 3);
  await page.locator('#home-replay-progress').evaluate((e) => {
    e.value = e.max;
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#home-replay-stage')).toHaveText('DNF');
  await expect(page.locator('#replay-display-time')).toContainText('DNF (');
  expect(await page.evaluate(() => window.fto.snapshot().replay.solved)).toBe(false);
  await page.locator('#home-replay-exit').click();
  await page.locator('#solve-times li').first().locator('.time-average button').first().click();
  await page.locator('#statistics-share').click();
  await expect(page.locator('#average-share-save')).toBeEnabled();
  await page.locator('#average-share-save').click();
  await expect(page.locator('#average-share-save')).toHaveText('Saved to album');
  await page.locator('#average-share-summary').click();
  await expect(page.locator('#average-share-solves button')).toHaveCount(5);
  await expect(page.locator('#average-share-solves li').first()).toContainText('DNF');
  await page.getByRole('button', { name: 'Play solve 1', exact: true }).click();
  await page.waitForFunction(() => window.fto.snapshot().replay?.size === 3);
  await page.locator('#home-replay-exit').click();
  const archived = await page.evaluate(async () => {
    const { RecordingAlbum, validateAlbumBackup } = await import('/src/recording-album.js'),
      album = new RecordingAlbum(),
      backup = await album.export();
    await validateAlbumBackup(backup);
    const group = backup.groups[0],
      pack = await album.exportGroup(group);
    await album.importGroup(pack);
    return {
      dnfs: backup.entries.filter((e) => e.dnf).length,
      playable: group.members.every((m) => m.id && m.dnf),
      count: (await album.list()).length,
    };
  });
  expect(archived).toEqual({ dnfs: 5, playable: true, count: 5 });
  await page.reload();
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  await page.locator('#album').click();
  await expect(page.locator('.album-average')).toHaveCount(1);
  await expect(page.locator('.album-entry:not(.album-average)')).toHaveCount(5);
});
