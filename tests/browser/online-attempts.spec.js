import {
  waitForApp,
  requestReset,
  requestScramble,
  freezeClock,
  confirmAction,
} from './helpers.js';

import { test, expect } from './fixtures.js';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';

const U = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' },
  view = { rotation: [0, 0, 0, 1], radius: 10 };
async function setup(page, { initialRows, nextResult } = {}) {
  const user = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'test@example.invalid',
      user_metadata: {},
      aud: 'authenticated',
    },
    exp = Math.floor(Date.now() / 1000) + 3600;
  const token =
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
    '.' +
    Buffer.from(
      JSON.stringify({ sub: user.id, exp, role: 'authenticated', aud: 'authenticated' }),
    ).toString('base64url') +
    '.c2ln';
  const recorder = new SolveRecorder();
  recorder.arm({ size: 3, scramble: [U], view, keyboard: defaultConfig(3), colors: {} });
  const calls = [];
  let ineligible = [];
  let rows = initialRows ?? [
    { id: 'old', metric: 'single', ms: 40330, pending_ms: 32980, evidence_complete: true },
  ];
  await page.route('**/shared/config.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "export const backendConfig={url:'https://backend.test',key:'test-public-key'};",
    }),
  );
  await page.route('https://backend.test/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1),
      args = route.request().postDataJSON();
    calls.push({ name, args });
    let data = null;
    if (name === 'user') data = user;
    if (name === 'my_profile') data = { id: user.id, username: 'Tester', admin: false };
    if (name === 'my_submission_notifications' || name === 'leaderboard') data = [];
    if (name === 'my_leaderboard_results') data = { candidates: rows, ineligible };
    if (name === 'begin_attempt') data = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    if (name === 'record_online_attempt') {
      if (args.replay && !args.replay.usedPause)
        rows = [
          { ...rows[0], id: 'new', metric: 'single', ms: 32750, evidence_complete: true },
          ...['ao5', 'ao12'].map((metric) => ({
            id: metric,
            metric,
            ms: 37000,
            evidence_complete: true,
          })),
        ];
      if (!args.replay || args.replay.usedPause) {
        rows = [];
        ineligible = [
          { metric: 'single', ineligible_reason: args.replay?.usedPause ? 'pause' : 'abandoned' },
        ];
      }
      if (nextResult) {
        rows = nextResult.candidates;
        ineligible = nextResult.ineligible;
      }
      data = {
        ineligible,
        dnf: !args.replay || !!args.replay.usedPause,
        invalid_reason: args.replay?.usedPause ? 'pause' : null,
        candidates: rows,
      };
    }
    if (name === 'skip_online_scramble') {
      rows = [];
      ineligible = [{ metric: 'single', ineligible_reason: 'skipped' }];
      data = { dnf: true, candidates: rows, ineligible };
    }
    if (name === 'submit_leaderboard') {
      rows = rows.filter((row) => row.id !== args.submission);
      data = { status: 'pending' };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/worker.js*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "self.onmessage=()=>self.postMessage({scramble:'U F'});",
    }),
  );
  await page.addInitScript(
    ({ user, token, exp, recordings, U }) => {
      if (sessionStorage.getItem('online-seeded')) return;
      sessionStorage.setItem('online-seeded', 'true');
      localStorage.setItem(
        'ftoers.auth.v1',
        JSON.stringify({
          access_token: token,
          refresh_token: 'test-refresh',
          expires_at: exp,
          expires_in: 3600,
          token_type: 'bearer',
          user,
        }),
      );
      localStorage.setItem(
        'master-fto-settings-v1',
        JSON.stringify({
          animate: false,
          animateScrambling: false,
          follow: false,
          disableSounds: true,
        }),
      );
      localStorage.setItem(
        'master-fto-v1',
        JSON.stringify({
          size: 3,
          solves: {
            3: { history: [U], redo: [], undoFloor: 1, recordings, timer: { status: 'ready' } },
          },
        }),
      );
    },
    { user, token, exp, recordings: recorder.serialize(), U },
  );
  await page.goto('/');
  await waitForApp(page);
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-signed-in', 'true');
  await expect(page.locator('#online-pb-list')).toContainText('40.33');
  return calls;
}
const tripleEscape = (page) =>
  page.evaluate(() => {
    for (let i = 0; i < 3; i++)
      for (const type of ['keydown', 'keyup'])
        window.dispatchEvent(new KeyboardEvent(type, { code: 'Escape', bubbles: true }));
  });
test('reloaded inspection records the new solve and pages through independent submit actions', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-signed-in', 'true');
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.fto.snapshot().timer.status === 'finished');
  await expect(page.locator('#online-pb-list')).toContainText('Single · 32.75');
  expect(calls.filter((c) => c.name === 'begin_attempt')).toHaveLength(1);
  expect(calls.filter((c) => c.name === 'record_online_attempt')).toHaveLength(1);
  const sent = calls.find((c) => c.name === 'record_online_attempt').args.replay;
  expect(sent.complete).toBe(true);
  expect(sent.usedUndo).not.toBe(true);
  await expect(page.locator('#online-pb-list li')).toHaveCount(1);
  await expect(page.getByLabel('Result 1 of 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next result', exact: true }).click();
  await expect(page.locator('#online-pb-list strong')).toHaveText('ao5 · 37.00');
  await page.getByRole('button', { name: 'Next result', exact: true }).click();
  await expect(page.locator('#online-pb-list strong')).toHaveText('ao12 · 37.00');
  await page.getByRole('button', { name: 'Next result', exact: true }).click();
  await expect(page.locator('#online-pb-list strong')).toHaveText('Single · 32.75');
  await page.getByRole('button', { name: 'Submit to leaderboard', exact: true }).click();
  await expect(page.locator('#online-pb-list strong')).toHaveText('ao5 · 37.00');
  await expect(page.getByLabel('Result 1 of 2', { exact: true })).toBeVisible();
  expect(
    calls.filter((c) => c.name === 'submit_leaderboard').map((c) => c.args.submission),
  ).toEqual(['new']);
  for (const width of [1360, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    if (width < 900) await page.locator('#mobile-history').click();
    await expect(page.locator('#online-pb-list')).toBeVisible();
    expect(
      await page.locator('#online-pb-list').evaluate((e) => e.scrollWidth > e.clientWidth),
    ).toBe(false);
    await page
      .locator('#online-pb-notices')
      .screenshot({ path: `/tmp/fto-online-pager-${width}.png` });
    if (width < 900) await page.locator('#close-history').click();
  }
});
test('triple Escape and reset during inspection add hidden DNFs; abandonment after starting stays visible', async ({
  page,
}) => {
  const calls = await setup(page);
  await tripleEscape(page);
  await expect.poll(() => calls.filter((c) => c.name === 'skip_online_scramble').length).toBe(1);
  await page.waitForFunction(
    () =>
      window.fto.snapshot().timer.status === 'ready' && !window.fto.snapshot().generatingScramble,
  );
  expect(await page.evaluate(() => window.fto.snapshot().timer.times.length)).toBe(0);
  await confirmAction(page, () => requestReset(page));
  await expect.poll(() => calls.filter((c) => c.name === 'skip_online_scramble').length).toBe(2);
  expect(await page.evaluate(() => window.fto.snapshot().timer.times.length)).toBe(0);
  await confirmAction(page, () => requestScramble(page));
  await page.waitForFunction(
    () =>
      window.fto.snapshot().timer.status === 'ready' && !window.fto.snapshot().generatingScramble,
  );
  expect(calls.filter((c) => c.name === 'skip_online_scramble')).toHaveLength(2);
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.fto.snapshot().timer.status === 'running');
  await tripleEscape(page);
  await page.waitForFunction(() => window.fto.snapshot().timer.status === 'ready');
  await expect.poll(() => calls.filter((c) => c.name === 'record_online_attempt').length).toBe(1);
  expect(calls.find((c) => c.name === 'record_online_attempt').args.replay).toBeNull();
  expect(await page.evaluate(() => window.fto.snapshot().timer.times.map((t) => t.dnf))).toEqual([
    true,
  ]);
  expect(calls.filter((c) => c.name === 'skip_online_scramble')).toHaveLength(2);
});

for (const cause of ['manual', 'blur'])
  test(`${cause} pause preserves the local solve but sends permanent leaderboard DNF evidence`, async ({
    page,
  }) => {
    const calls = await setup(page);
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(() => window.fto.snapshot().timer.status === 'running');
    if (cause === 'manual') await page.locator('#mobile-pause').click();
    else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#leaderboard-status')).toContainText('Paused solves count as DNF');
    await page.keyboard.press('KeyF');
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(() => window.fto.snapshot().timer.status === 'finished');
    await expect.poll(() => calls.filter((c) => c.name === 'record_online_attempt').length).toBe(1);
    expect(calls.find((c) => c.name === 'record_online_attempt').args.replay.usedPause).toBe(true);
    expect(await page.evaluate(() => window.fto.snapshot().timer.times.at(-1).dnf)).toBeUndefined();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem('master-fto-v1')).solves[3].recordings.last.usedPause,
      ),
    ).toBe(true);
  });
for (const duration of [400, 5000])
  test(`${duration}ms disconnection keeps the timer running and applies the five-second eligibility boundary`, async ({
    page,
    context,
  }) => {
    await page.clock.install();
    const calls = await setup(page);
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(() => window.fto.snapshot().timer.status === 'running');
    await page.evaluate(async () => {
      const { network } = await import('/src/network.js');
      await network.queue;
    });
    await freezeClock(page, 1000);
    const before = await page.evaluate(() => window.fto.snapshot().timer.elapsedMs);
    await context.setOffline(true);
    await page.waitForFunction(() => navigator.onLine === false);
    await page.clock.runFor(duration);
    expect(await page.evaluate(() => window.fto.snapshot().timer.status)).toBe('running');
    expect(await page.evaluate(() => window.fto.snapshot().timer.elapsedMs)).toBeGreaterThanOrEqual(
      before + duration,
    );
    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine === true);
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(() => window.fto.snapshot().timer.status === 'finished');
    await expect.poll(() => calls.filter((c) => c.name === 'record_online_attempt').length).toBe(1);
    const sent = calls.find((c) => c.name === 'record_online_attempt').args.replay;
    if (duration < 5000) {
      expect(sent).not.toBeNull();
      expect(sent.usedPause).toBe(false);
    } else expect(sent).toBeNull();
  });

const staleAverageRows = [
  { id: 'old', metric: 'single', ms: 40330, evidence_complete: true },
  { id: 'old-average', metric: 'ao5', ms: 31610, pending_ms: 28930, evidence_complete: true },
];
test('the current ineligible average explains the reason and never offers an older average', async ({
  page,
}) => {
  await setup(page, {
    initialRows: staleAverageRows,
    nextResult: {
      candidates: [],
      ineligible: [{ metric: 'ao5', ineligible_reason: 'leaderboard_dnfs', pending_ms: 28930 }],
    },
  });
  await page.getByRole('button', { name: 'Next result', exact: true }).click();
  await expect(page.locator('#online-pb-list')).toContainText('ao5 · 31.61');
  await page.keyboard.press('KeyF');
  await expect(page.locator('#online-pb-list')).toContainText('Current ao5 · Ineligible');
  await expect(page.locator('#online-pb-list')).toContainText('two or more leaderboard DNFs');
  await expect(page.locator('#online-pb-list')).toContainText('Pending submission · 28.93');
  await expect(page.locator('#online-pb-list')).not.toContainText('31.61');
  await expect(
    page.getByRole('button', { name: 'Submit to leaderboard', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator('#online-pb-list')).toContainText('Current ao5 · Ineligible');
  await expect(
    page.getByRole('button', { name: 'Submit to leaderboard', exact: true }),
  ).toHaveCount(0);
});
test('a current eligible average replaces the old offer while allowing a faster pending result to be replaced', async ({
  page,
}) => {
  const calls = await setup(page, {
    initialRows: staleAverageRows,
    nextResult: {
      candidates: [
        {
          id: 'current-average',
          metric: 'ao5',
          ms: 29840,
          pending_ms: 28930,
          evidence_complete: true,
        },
      ],
      ineligible: [],
    },
  });
  await page.keyboard.press('KeyF');
  await expect(page.locator('#online-pb-list')).toContainText('ao5 · 29.84');
  await expect(page.locator('#online-pb-list')).toContainText('Replaces your pending 28.93');
  await expect(page.locator('#online-pb-list')).not.toContainText('31.61');
  await page.getByRole('button', { name: 'Submit to leaderboard', exact: true }).click();
  await expect
    .poll(() => calls.filter((c) => c.name === 'submit_leaderboard').map((c) => c.args.submission))
    .toEqual(['current-average']);
});
