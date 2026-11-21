import { browserLaunchOptions } from '../browser-options.js';
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';
const root = path.resolve(process.env.FTOERS_PUBLIC_ROOT),
  src = path.resolve('src'),
  dist = path.resolve('dist');
const user = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'test@example.com',
  user_metadata: {},
  aud: 'authenticated',
};
const jwt = () =>
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
function fixture(index) {
  let now = index * 2000;
  const view = { rotation: [0, 0, 0, 1], radius: 10 },
    recorder = new SolveRecorder({}, () => now);
  recorder.arm({
    size: 3,
    scramble: [{ normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' }],
    view,
    keyboard: defaultConfig(3),
    colors: {},
  });
  recorder.begin(view, defaultConfig(3));
  now += 1000;
  recorder.attempt.solver = { username: 'Solver' };
  return recorder.finish(1000 - index, true);
}
const evidence = Array.from({ length: 5 }, (_, i) => ({
  ms: 1000 - i,
  dnf: false,
  recording: fixture(i),
}));
const browser = await chromium.launch(browserLaunchOptions);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};
await mkdir('/tmp/ftoers-polish', { recursive: true });
async function context(admin = false, broken = false) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  context.on('page', (page) => page.on('pageerror', (e) => errors.push(e.message)));
  let decided = false;
  const decisions = [];
  if (admin)
    await context.addInitScript(
      ({ user, token }) => {
        if (location.hostname !== 'ftoers.test') return;
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
      { user, token: jwt() },
    );
  await context.route('https://fto-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1);
    let data = null;
    if (name === 'my_profile') data = admin ? { id: user.id, username: 'Abid', admin: true } : null;
    if (name === 'user') data = user;
    if (name === 'leaderboard') data = [];
    if (name === 'review_queue')
      data = decided
        ? []
        : [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              username: 'Solver',
              metric: 'ao5',
              ms: 998,
            },
          ];
    if (name === 'review_evidence')
      data = broken ? [{ ms: 1, dnf: false, recording: { format: 'invalid' } }] : evidence;
    if (name === 'review_submission') {
      decisions.push(route.request().postDataJSON());
      decided = true;
    }
    if (name === 'logout') {
      admin = false;
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await context.route('https://ftoers.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/shared/config.js')) {
      await route.fulfill({
        contentType: 'text/javascript',
        body: "export const backendConfig={url:'https://fto-test.supabase.co',key:'test-public-key'};",
      });
      return;
    }
    let target = url.pathname.startsWith('/virtual/')
      ? path.join(dist, url.pathname.slice(9))
      : url.pathname.startsWith('/__src/')
        ? path.join(src, url.pathname.slice(7))
        : path.join(root, url.pathname);
    if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
    try {
      await route.fulfill({
        body: await readFile(target),
        contentType: mime[path.extname(target)] ?? 'application/octet-stream',
      });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
  return { context, errors, decisions };
}
async function menu(page) {
  await page.locator('#ft-account-trigger').click();
  await page.locator('#ft-account-menu:popover-open').waitFor();
}
try {
  const guest = await context();
  const home = await guest.context.newPage();
  await home.goto('https://ftoers.test/');
  await home.locator('#ft-account-trigger').waitFor();
  assert.equal(await home.locator('#leaderboard').count(), 0);
  await home.locator('#home-about').click();
  await home.locator('#home-about-dialog[open]').waitFor();
  assert.match(await home.locator('#home-about-dialog').textContent(), /Abid and Matt/);
  assert.equal(await home.locator('#home-about-dialog a[href*="2023MAOS01"]').count(), 1);
  await home.locator('#home-about-close').click();
  await menu(home);
  assert.deepEqual(await home.getByRole('menuitem').allTextContents(), ['Sign in']);
  await home.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
  await home.locator('.ft-dialog[open]').waitFor();
  assert.equal(
    await home.locator('.ft-dialog[open]').evaluate((e) => getComputedStyle(e).backgroundColor),
    'rgb(23, 34, 49)',
  );
  await home.screenshot({ path: '/tmp/ftoers-polish/home-sign-in.png' });
  await home.getByRole('button', { name: 'Close account' }).click();
  const sim = await guest.context.newPage();
  await sim.goto('https://ftoers.test/virtual/');
  try {
    await sim.waitForFunction(() => window.fto?.snapshot().ready, {}, { timeout: 10000 });
  } catch {
    throw Error('Simulator startup: ' + guest.errors.join('; '));
  }
  await sim.locator('#ft-account-trigger').waitFor();
  assert.equal(await sim.locator('.network-home').count(), 0);
  assert.equal(await sim.locator('.topbar #settings,.topbar #about').count(), 0);
  assert.equal(await sim.locator('#show-statistics').isChecked(), true);
  assert.equal(await sim.evaluate(() => window.fto.snapshot().inspectionProjection.opacity), 0.6);
  await menu(sim);
  await sim.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
  assert.equal(
    await sim
      .locator('.ft-dialog')
      .first()
      .evaluate((e) => getComputedStyle(e).backgroundColor),
    'rgb(25, 39, 36)',
  );
  await sim.getByRole('button', { name: 'Close account' }).click();
  const beforeMenu = await sim.evaluate(() => window.fto.snapshot().history);
  await menu(sim);
  await sim.keyboard.press('f');
  assert.deepEqual(await sim.evaluate(() => window.fto.snapshot().history), beforeMenu);
  await sim.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await sim.locator('#settings-dialog[open]').waitFor();
  await sim.locator('#close-settings').click();
  await menu(sim);
  await sim.getByRole('menuitem', { name: 'About us', exact: true }).click();
  await sim.locator('#about-dialog[open]').waitFor();
  await sim.locator('#close-about').click();
  // Exercise actual IndexedDB retention and overlapping pins, not a mirrored model.
  const retention = await sim.evaluate(
    async (recordings) => {
      const { RecordingAlbum } = await import('/__src/recording-album.js');
      const album = new RecordingAlbum();
      await album.restoreValidated({ format: 'fto-recording-album-v1', entries: [] });
      for (let i = 0; i < recordings.length; i++)
        await album.remember(recordings[i], {
          pb: i === 0,
          averagePB: i === 4 || i === 5 ? [5] : i === 11 ? [5, 12] : [],
        });
      const entries = await album.list(),
        backup = await album.export();
      const unique = new Set(backup.entries.map((e) => e.id)).size;
      await album.restoreValidated(backup);
      const restored = await album.list();
      return {
        count: entries.length,
        unique,
        restored: restored.length,
        recent: entries.filter((e) => e.recent).length,
        pinned: entries.filter((e) => e.pb || e.averagePB?.length).length,
        both: entries.filter((e) => e.averagePB?.includes(5) && e.averagePB?.includes(12)).length,
        window: backup.windows[0].entries.length,
      };
    },
    Array.from({ length: 25 }, (_, i) => fixture(i)),
  );
  assert.deepEqual(retention, {
    count: 24,
    unique: 24,
    restored: 24,
    recent: 12,
    pinned: 12,
    both: 11,
    window: 12,
  });
  await sim.setViewportSize({ width: 390, height: 844 });
  await menu(sim);
  await sim.screenshot({ path: '/tmp/ftoers-polish/simulator-menu-mobile.png' });
  assert.equal(await sim.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await sim.keyboard.press('Escape');
  assert.deepEqual(guest.errors, []);
  await guest.context.close();
  const admin = await context(true),
    signedHome = await admin.context.newPage();
  await signedHome.goto('https://ftoers.test/');
  await signedHome.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
  await menu(signedHome);
  assert.deepEqual(await signedHome.getByRole('menuitem').allTextContents(), ['Log out']);
  await signedHome.keyboard.press('Escape');
  await signedHome.locator('#home-about').click();
  await signedHome.screenshot({ path: '/tmp/ftoers-polish/home-about.png' });
  await signedHome.close();
  const page = await admin.context.newPage();
  await page.goto('https://ftoers.test/virtual/');
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  await page.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
  await menu(page);
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(), [
    'Settings',
    'About us',
    'Review solves',
    'Log out',
  ]);
  await page.screenshot({ path: '/tmp/ftoers-polish/simulator-menu.png' });
  await page.getByRole('menuitem', { name: 'Review solves' }).click();
  await page.getByRole('button', { name: 'Watch evidence solve 1', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Watch evidence solve 1', exact: true }).click();
  await page.locator('#home-replay-view canvas').waitFor();
  assert.equal(await page.locator('#solve-review-panel').isVisible(), true);
  await page.getByRole('button', { name: 'Watch evidence solve 2', exact: true }).click();
  assert.equal(await page.locator('#home-replay-view canvas').count(), 1);
  assert.equal(admin.context.pages().length, 1);
  await page.screenshot({ path: '/tmp/ftoers-polish/review-in-simulator.png' });
  await page.locator('#solve-review-panel [data-note]').fill('Reviewed');
  await page.getByRole('button', { name: 'Approve & next', exact: true }).click();
  await page
    .locator('#solve-review-panel [data-message]')
    .filter({ hasText: 'No pending' })
    .waitFor();
  assert.equal(admin.decisions[0].approve, true);
  assert.equal(admin.decisions[0].note, 'Reviewed');
  await menu(page);
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.locator('#ft-account-trigger[data-signed-in=false]').waitFor();
  await page.locator('#solve-review-panel').waitFor({ state: 'hidden' });
  assert.deepEqual(admin.errors, []);
  await admin.context.close();
  const broken = await context(true, true),
    badPage = await broken.context.newPage();
  await badPage.goto('https://ftoers.test/virtual/');
  await badPage.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
  await menu(badPage);
  await badPage.getByRole('menuitem', { name: 'Review solves' }).click();
  await badPage
    .locator('#solve-review-panel [data-message]')
    .filter({ hasText: 'invalid or missing' })
    .waitFor();
  assert.equal(
    await badPage.getByRole('button', { name: 'Approve & next', exact: true }).isDisabled(),
    true,
  );
  await badPage.locator('#solve-review-panel [data-note]').fill('Recording evidence is missing.');
  await badPage.getByRole('button', { name: 'Reject & next', exact: true }).click();
  await badPage
    .locator('#solve-review-panel [data-message]')
    .filter({ hasText: 'No pending' })
    .waitFor();
  assert.equal(broken.decisions[0].approve, false);
  assert.equal(broken.decisions[0].note, 'Recording evidence is missing.');
  await broken.context.close();
  console.log(
    'Polish browser checks passed: avatar menus, site palettes, simulator-only review/replay, defaults, rolling retention, overlapping PBs, and backup restore.',
  );
} finally {
  await browser.close();
}
