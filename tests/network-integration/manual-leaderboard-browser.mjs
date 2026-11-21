import { browserLaunchOptions } from '../browser-options.js';
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';
import { HOME_POSITION, DEFAULT_CIF_FRAME, snappedViewRotation } from '../../src/orientation.js';
const root = path.resolve(process.env.FTOERS_PUBLIC_ROOT),
  dist = path.resolve('dist'),
  src = path.resolve('src');
const user = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'test@example.com',
  user_metadata: {},
  aud: 'authenticated',
};
const token =
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
  '.' +
  Buffer.from(
    JSON.stringify({
      sub: user.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
      aud: 'authenticated',
    }),
  ).toString('base64url') +
  '.c2ln';
function recording(ms) {
  let now = 0;
  const r = new SolveRecorder({}, () => now),
    view = {
      rotation: snappedViewRotation(DEFAULT_CIF_FRAME).toArray(),
      radius: HOME_POSITION.length(),
    },
    U = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' };
  r.arm({ size: 3, scramble: [U], view, keyboard: defaultConfig(3), colors: {} });
  r.begin(view, defaultConfig(3));
  now = ms;
  r.event('turn', { id: 1, move: { ...U, dir: -1 } });
  return r.finish(ms, true);
}
const single = recording(900),
  average = [1200, 1100, 1000, 900, 800].map((ms) => ({
    ms,
    dnf: false,
    recording: recording(ms),
  }));
let queue = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'Solver',
      metric: 'single',
      ms: 900,
      evidence_complete: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      username: 'Matt',
      metric: 'ao5',
      ms: 1000,
      evidence_complete: true,
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      username: 'BadEvidence',
      metric: 'single',
      ms: 650,
      evidence_complete: true,
    },
  ],
  candidates = [
    {
      id: 'pb-single',
      metric: 'single',
      ms: 900,
      evidence_complete: true,
      leaderboard_ms: 950,
      pending_ms: 850,
    },
    { id: 'pb-five', metric: 'ao5', ms: 1000, evidence_complete: true },
    { id: 'pb-twelve', metric: 'ao12', ms: 1100, evidence_complete: true },
  ];
const calls = [],
  decisions = [];
let notifications = [
  {
    id: 2,
    metric: 'ao5',
    ms: 1000,
    decision: 'rejected',
    note: 'Please show the ending <img src=x>',
    created_at: new Date().toISOString(),
    read_at: null,
  },
  {
    id: 1,
    metric: 'single',
    ms: 900,
    decision: 'approved',
    note: 'Verified recording',
    created_at: new Date(Date.now() - 60000).toISOString(),
    read_at: null,
  },
];
const browser = await chromium.launch(browserLaunchOptions),
  context = await browser.newContext({ viewport: { width: 1360, height: 1000 } }),
  page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(15000);
page.on('pageerror', (e) => errors.push(e.message));
await context.addInitScript(
  ({ user, token }) => {
    if (window.name === 'seeded') return;
    window.name = 'seeded';
    localStorage.setItem(
      'ftoers.auth.v1',
      JSON.stringify({
        access_token: token,
        refresh_token: 'test-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: 'bearer',
        user,
      }),
    );
  },
  { user, token },
);
await context.route('https://backend.test/**', async (route) => {
  const name = new URL(route.request().url()).pathname.split('/').at(-1),
    args = route.request().postDataJSON();
  calls.push(name);
  let data = null;
  if (name === 'my_submission_notifications') data = notifications;
  if (name === 'mark_submission_notifications_read') {
    notifications = notifications.map((n) =>
      args.ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n,
    );
  }
  if (name === 'my_profile') data = { id: user.id, username: 'Owner', admin: true };
  if (name === 'user') data = user;
  if (name === 'leaderboard') data = [];
  if (name === 'my_leaderboard_candidates') data = candidates;
  if (name === 'submit_leaderboard') {
    await new Promise((r) => setTimeout(r, 50));
    candidates = candidates.filter((row) => row.id !== args.submission);
    data = { status: 'pending' };
  }
  if (name === 'review_queue') data = queue;
  if (name === 'review_evidence')
    data = args.submission.startsWith('111')
      ? [{ ms: 900, dnf: false, recording: single }]
      : args.submission.startsWith('222')
        ? average
        : [{ ms: 650, dnf: false, recording: { format: 'invalid' } }];
  if (name === 'review_submission') {
    decisions.push(args);
    queue = queue.filter((row) => row.id !== args.submission);
  }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
});
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
};
await context.route('https://manual.test/**', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.endsWith('/shared/config.js'))
    return route.fulfill({
      contentType: 'text/javascript',
      body: "export const backendConfig={url:'https://backend.test',key:'test-public-key'};",
    });
  let file = u.pathname.startsWith('/__src/')
    ? path.join(src, u.pathname.slice(7))
    : u.pathname.startsWith('/virtual/')
      ? path.join(dist, u.pathname.slice(9))
      : path.join(root, u.pathname);
  if (u.pathname.endsWith('/')) file = path.join(file, 'index.html');
  try {
    await route.fulfill({
      body: await readFile(file),
      contentType: mime[path.extname(file)] ?? 'application/octet-stream',
    });
  } catch {
    await route.fulfill({ status: 404 });
  }
});
try {
  await page.goto('https://manual.test/virtual/');
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  await page.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
  await page
    .locator('#online-pb-list li')
    .filter({ hasText: 'Faster than your leaderboard result' })
    .waitFor();
  assert.equal(await page.locator('#online-pb-list li').count(), 1);
  assert.equal(await page.getByLabel('Result 1 of 3', { exact: true }).count(), 1);
  assert.equal(calls.includes('submit_leaderboard'), false);
  assert.match(
    await page.locator('#online-pb-list li').first().textContent(),
    /Faster than your leaderboard result.*0.95.*Replaces your pending 0.85/,
  );
  const notice = await page.locator('#online-pb-notices').boundingBox(),
    summary = await page.locator('#solve-summary').boundingBox();
  assert.ok(Math.abs(notice.x - summary.x) < 1 && Math.abs(notice.width - summary.width) < 1);
  assert.equal(
    await page.locator('#leaderboard-status').evaluate((e) => getComputedStyle(e).textAlign),
    'center',
  );
  await page
    .locator('#online-pb-list li')
    .filter({ hasText: 'Single · 0.90' })
    .getByRole('button', { name: 'Submit to leaderboard', exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await page.getByLabel('Result 1 of 2', { exact: true }).waitFor();
  assert.equal(await page.locator('#online-pb-list li').count(), 1);
  assert.equal(calls.filter((name) => name === 'submit_leaderboard').length, 1);
  assert.match(await page.locator('#leaderboard-status').textContent(), /administrator approval/);
  await mkdir('/tmp/ftoers-manual-review', { recursive: true });
  await page.screenshot({ path: '/tmp/ftoers-manual-review/comparison.png' });
  await page.locator('#ft-account-trigger').click();
  await page.getByRole('menuitem', { name: 'Review solves', exact: true }).click();
  await page.locator('#solve-review-panel [data-count]').filter({ hasText: '3 pending' }).waitFor();
  await page
    .locator('#solve-review-panel [data-check]')
    .filter({ hasText: 'Single time matches' })
    .waitFor();
  await page.getByRole('button', { name: 'ao5', exact: true }).click();
  await page
    .locator('#solve-review-panel [data-check]')
    .filter({ hasText: 'ao5 verified' })
    .waitFor();
  assert.equal(await page.locator('#solve-review-panel [data-queue-list] li').count(), 1);
  assert.equal(await page.locator('#solve-review-panel [data-trimmed=true]').count(), 2);
  await page.locator('#solve-review-panel [data-watch-next]').click();
  await page.waitForFunction(() => window.fto.snapshot().replay?.size === 3);
  await page.locator('#solve-review-panel [data-watch-next]').click();
  assert.equal(await page.locator('#home-replay-view canvas').count(), 1);
  assert.equal(
    await page.locator('#solve-review-panel [data-progress]').textContent(),
    '2/5 opened',
  );
  // A home-oriented recording has just 500 ms of waits after its 160 ms scramble.
  const duration = await page.evaluate(() => window.fto.snapshot().replay.duration);
  assert.equal(duration, 660 + 1100);
  await page.locator('#home-replay-progress').evaluate((e) => {
    e.value = '400';
    e.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('#home-replay-stage').textContent(), 'Ready');
  await mkdir('/tmp/ftoers-manual-review', { recursive: true });
  await page.screenshot({ path: '/tmp/ftoers-manual-review/desktop.png' });
  await page.locator('#solve-review-panel [data-note]').fill('All times match');
  await page.locator('#solve-review-panel [data-approve]').click();
  await page
    .locator('#solve-review-panel [data-message]')
    .filter({ hasText: 'No pending submissions in this filter' })
    .waitFor();
  assert.equal(decisions[0].approve, true);
  assert.equal(decisions[0].note, 'All times match');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('button', { name: 'Review BadEvidence single 0.65', exact: true }).click();
  await page
    .locator('#solve-review-panel [data-message]')
    .filter({ hasText: 'invalid or missing' })
    .waitFor();
  assert.equal(await page.locator('[data-approve]').isDisabled(), true);
  await page.locator('[data-note]').fill('Recording is invalid or missing.');
  await page.locator('[data-reject]').click();
  await page.locator('[data-count]').filter({ hasText: '1 pending' }).waitFor();
  assert.equal(decisions[1].approve, false);
  await page.locator('[data-check]').filter({ hasText: 'Single time matches' }).waitFor();
  await page.locator('#solve-review-panel [data-collapse]').click();
  assert.equal(await page.locator('#solve-review-panel .review-decision').isVisible(), false);
  assert.equal(await page.locator('#solve-review-panel [data-body]').isVisible(), false);
  await page.locator('#solve-review-panel [data-collapse]').click();
  assert.equal(await page.locator('#solve-review-panel .review-decision').isVisible(), true);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `/tmp/ftoers-manual-review/mobile-${width}.png` });
    assert.equal(
      await page.locator('#solve-review-panel').evaluate((e) => e.scrollWidth > e.clientWidth),
      false,
    );
    const box = await page.locator('#solve-review-panel').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
  }

  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.locator('#solve-review-panel [data-close]').click();
  await page.locator('#home-replay-exit').click();
  assert.equal(await page.locator('#notifications').getAttribute('data-unread'), '2');
  await page.locator('#notifications').click();
  await page.locator('#submission-notifications-list li').filter({ hasText: 'Verified' }).waitFor();
  assert.equal(await page.locator('#submission-notifications-list li').count(), 2);
  assert.match(
    await page.locator('#submission-notifications-list li').first().textContent(),
    /Your 1.00 ao5 submission has been rejected.*Please show the ending <img src=x>/,
  );
  assert.equal(await page.locator('#submission-notifications-list img').count(), 0);
  await page.locator('#submission-notifications-read').click();
  await page.waitForFunction(
    () => !document.getElementById('notifications').hasAttribute('data-unread'),
  );
  await page.locator('#close-notifications').click();
  await page.reload();
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  await page.locator('#notifications').click();
  await page.locator('#submission-notifications-list li').first().waitFor();
  assert.equal(await page.locator('#submission-notifications-list [data-unread=true]').count(), 0);
  await page.locator('#close-notifications').click();
  const fixtures = Array.from({ length: 12 }, (_, i) => ({
      recording: recording(1000 + i),
      entry: {
        ms: 1000 + i,
        dnf: false,
        at: new Date(Date.UTC(2026, 10, 20, 0, 0, i)).toISOString(),
        scramble: 'U',
      },
    })),
    extras = [recording(2000), recording(2100), recording(2200)];
  const seeded = await page.evaluate(
    async ({ fixtures, extras }) => {
      const { RecordingAlbum, validateAlbumBackup } = await import('/__src/recording-album.js'),
        { averageWindow } = await import('/__src/solve-statistics.js'),
        album = new RecordingAlbum();
      await album.restoreValidated({ format: 'fto-recording-album-v1', entries: [] });
      const times = [];
      for (const { recording, entry } of fixtures) {
        times.push(entry);
        await album.remember(recording, { entry });
      }
      const five = await album.prepareAverage(3, times, averageWindow(times, 5)),
        twelve = await album.prepareAverage(3, times, averageWindow(times, 12));
      await album.saveGroup(five);
      await album.saveGroup(twelve);
      const extraIDs = [];
      for (let i = 0; i < extras.length; i++)
        extraIDs.push((await album.add(extras[i], { pb: i === 0 })).id);
      const backup = await album.export(),
        protectedID = five.members[0].id;
      let rejected = false;
      try {
        await album.removeMany({ recordingIDs: [extraIDs[0], protectedID], groupIDs: [five.id] });
      } catch {
        rejected = true;
      }
      if (
        !rejected ||
        (await album.list()).length !== 15 ||
        (await album.listGroups()).length !== 2
      )
        throw Error(
          'Bulk deletion must abort atomically when an unselected average uses a recording',
        );
      const removed = await album.removeMany({
        recordingIDs: [extraIDs[0], protectedID],
        groupIDs: [five.id, twelve.id],
      });
      if (removed.recordings !== 2 || removed.groups !== 2 || (await album.list()).length !== 13)
        throw Error('Combined group/recording deletion failed');
      await album.restoreValidated(backup);
      await validateAlbumBackup(await album.export());
      return { extraIDs, protectedID };
    },
    { fixtures, extras },
  );
  await page.locator('#album').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#album-list .album-entry').length === 17,
  );
  assert.equal(await page.locator('#album-list .album-entry').count(), 17);
  await page.locator('#album-select').click();
  assert.equal(
    await page
      .locator(`#album-list .album-entry[data-id="${seeded.protectedID}"] .album-selection`)
      .isDisabled(),
    true,
  );
  for (const id of seeded.extraIDs.slice(0, 2))
    await page.locator(`#album-list .album-entry[data-id="${id}"] .album-selection`).check();
  assert.equal(await page.locator('#album-selected-count').textContent(), '2 selected');
  await page.locator('#album-delete-selected').click();
  await page.locator('#confirm-cancel').click();
  assert.equal(await page.locator('#album-list .album-entry').count(), 17);
  assert.equal(await page.locator('#album-selected-count').textContent(), '2 selected');
  await page.locator('#album-delete-selected').click();
  await page.locator('#confirm-accept').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#album-list .album-entry').length === 15,
  );
  await page.locator('#album-select-all').check();
  assert.equal(await page.locator('#album-selected-count').textContent(), '15 selected');
  assert.equal(await page.locator('#album-list .album-selection:disabled').count(), 0);
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(
    await page.locator('#album-dialog').evaluate((e) => e.scrollWidth > e.clientWidth),
    false,
  );
  await page.locator('#album-delete-selected').click();
  await page.locator('#confirm-accept').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#album-list .album-entry').length === 0,
  );
  assert.equal(await page.evaluate(() => window.fto.snapshot().timer.times.length), 0);
  await page.evaluate(async (recording) => {
    const { RecordingAlbum, validateAlbumBackup } = await import('/__src/recording-album.js'),
      album = new RecordingAlbum();
    if ((await album.add(recording, { pb: true, automatic: true })) !== null)
      throw Error('Deleted PB recording was restored automatically');
    const backup = await album.export();
    await validateAlbumBackup(backup);
    if (backup.entries.length || backup.groups.length || backup.deleted.length !== 15)
      throw Error('Bulk-deleted album backup is inconsistent');
  }, extras[0]);
  assert.deepEqual(errors, []);
  console.log(
    'Manual leaderboard browser checks passed: explicit/deduplicated submit, queue filters, validated averages, trimmed rows, shared replay/short home intro, next-evidence control, decisions/auto-advance mobile layouts, private decision notifications/read state, and atomic bulk album deletion.',
  );
} catch (error) {
  await page.screenshot({ path: '/tmp/ftoers-manual-review/failure.png' }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
