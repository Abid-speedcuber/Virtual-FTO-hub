import { waitForApp } from './helpers.js';
import { test, expect } from './fixtures.js';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';
function recording() {
  const U = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' };
  let now = 0;
  const r = new SolveRecorder({}, () => now);
  r.arm({
    size: 3,
    scramble: [U],
    view: { rotation: [0, 0, 0, 1], radius: 10 },
    keyboard: defaultConfig(3),
    colors: {},
  });
  r.begin({ rotation: [0, 0, 0, 1], radius: 10 }, defaultConfig(3));
  now = 1000;
  r.event('turn', { id: 1, move: { ...U, dir: -1 } });
  return {
    ...r.finish(now, true),
    usedPause: false,
    solver: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', username: 'matt' },
  };
}
async function setup(page) {
  const user = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'admin@example.invalid',
      user_metadata: {},
      aud: 'authenticated',
    },
    exp = Math.floor(Date.now() / 1000) + 3600,
    token =
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') +
      '.' +
      Buffer.from(
        JSON.stringify({ sub: user.id, exp, role: 'authenticated', aud: 'authenticated' }),
      ).toString('base64url') +
      '.c2ln',
    calls = [];
  let rows = [
    {
      id: 1,
      metric: 'single',
      ms: 22400,
      decision: 'approved',
      note: 'Verified after a submission issue.',
      created_at: new Date().toISOString(),
      read_at: null,
    },
    {
      id: 2,
      metric: 'ao5',
      ms: 34000,
      decision: 'rejected',
      note: 'Please check <img src=x> the keyboard layout.',
      created_at: new Date().toISOString(),
      read_at: null,
    },
  ];
  await page.route('**/shared/config.js', (r) =>
    r.fulfill({
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
    if (name === 'my_profile') data = { id: user.id, username: 'Owner', admin: true };
    if (['my_leaderboard_candidates', 'review_queue'].includes(name)) data = [];
    if (name === 'leaderboard')
      data = [{ id: 'result', username: 'matt', ms: 22400, has_replay: true }];
    if (name === 'my_submission_notifications') data = rows;
    if (name === 'mark_submission_notifications_read')
      rows = rows.map((row) => ({ ...row, read_at: new Date().toISOString() }));
    if (name === 'inspect_leaderboard_recovery') {
      const paused = args.source[0] === 'b',
        warning = args.source[0] === 'c';
      data = {
        source: args.source,
        username: 'matt',
        ms: 1000,
        recording: { ...recording(), usedPause: paused },
        can_recover: !paused,
        trusted: !warning,
        flags: paused
          ? [
              {
                code: 'pause',
                severity: 'block',
                label: 'The solve was paused. This solve is ineligible for the leaderboard.',
              },
            ]
          : warning
            ? [
                {
                  code: 'unverified',
                  severity: 'warning',
                  label:
                    'No trusted online recording. Verify the solver identity and timing yourself.',
                },
              ]
            : [],
        existing_approved: null,
      };
    }
    if (name === 'recover_leaderboard_single')
      data = { id: 'approved-recovery', status: 'approved', already_added: false };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.addInitScript(
    ({ user, token, exp }) => {
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
    },
    { user, token, exp },
  );
  await page.goto('/');
  await waitForApp(page);
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-signed-in', 'true');
  return calls;
}
test('bell, modal headers and separate rules work on desktop and phone', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#notifications')).toHaveAttribute('data-unread', '2');
  await expect(page.locator('#leaderboard')).not.toHaveAttribute('data-unread');
  await page.locator('#notifications').click();
  await expect(page.locator('#notifications-dialog')).toBeVisible();
  await expect(page.locator('#submission-notifications-list li')).toHaveCount(2);
  await expect(page.locator('#submission-notifications-list img')).toHaveCount(0);
  await page.locator('#submission-notifications-read').click();
  await expect(page.locator('#notifications')).not.toHaveAttribute('data-unread');
  await page.locator('#close-notifications').click();
  await page.locator('#leaderboard').click();
  await expect(page.locator('#leaderboard-dialog #submission-notifications')).toHaveCount(0);
  await page.locator('#leaderboard-rules').click();
  await expect(page.locator('#leaderboard-rules-dialog')).toBeVisible();
  await expect(page.locator('#leaderboard-rules-dialog')).toContainText('home-row keys');
  await expect(page.locator('#leaderboard-rules-dialog')).toContainText('abid_ibn_ashraf');
  await expect(page.locator('#leaderboard-rules-dialog a')).toHaveAttribute(
    'href',
    'https://discord.gg/p8mCQYUkaf',
  );
  await page.locator('#close-leaderboard-rules').click();
  await expect(page.locator('#leaderboard-dialog')).toBeVisible();
  await page
    .locator('#leaderboard-dialog')
    .screenshot({ path: '/tmp/fto-leaderboard-desktop.png' });
  await page.locator('#close-leaderboard').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.locator('.topbar').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(
      false,
    );
    await page.locator('#notifications').click();
    expect(
      await page.locator('#notifications-dialog').evaluate((e) => e.scrollWidth > e.clientWidth),
    ).toBe(false);
    await page
      .locator('#notifications-dialog')
      .screenshot({ path: `/tmp/fto-notifications-${width}.png` });
    await page.locator('#close-notifications').click();
    await page.locator('#leaderboard').click();
    await page.locator('#leaderboard-rules').click();
    expect(
      await page
        .locator('#leaderboard-rules-dialog .dialog-body')
        .evaluate((e) => e.scrollWidth > e.clientWidth),
    ).toBe(false);
    await page
      .locator('#leaderboard-rules-dialog')
      .screenshot({ path: `/tmp/fto-rules-${width}.png` });
    await page.locator('#close-leaderboard-rules').click();
    await page.locator('#close-leaderboard').click();
  }
});
test('recovery uses the existing player, requires review, and blocks paused solves', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.locator('#ft-account-trigger').click();
  await page.getByRole('menuitem', { name: 'Review solves', exact: true }).click();
  await page.locator('[data-recover]').click();
  const dialog = page.locator('#leaderboard-recovery-dialog');
  async function inspect(code) {
    await dialog
      .locator('#recovery-source')
      .fill('https://ftoers.web.app/virtual/#short=' + code.repeat(32));
    await dialog.getByRole('button', { name: 'Inspect', exact: true }).click();
    await expect(dialog.locator('[data-preview]')).toBeVisible();
  }
  async function watchAndReturn() {
    await dialog.locator('[data-watch]').click();
    await page.waitForFunction(() => window.fto.snapshot().replay?.size === 3);
    await page.locator('[data-recover]').click();
    await dialog.locator('[data-reviewed]').check();
    await dialog.locator('#recovery-reason').fill('Verified the recording after a submission bug.');
  }
  await inspect('a');
  await expect(dialog).toContainText('No undo or pause evidence found.');
  await expect(dialog.locator('[data-add]')).toBeDisabled();
  await watchAndReturn();
  await expect(dialog.locator('[data-add]')).toBeEnabled();
  await dialog.locator('[data-add]').evaluate((b) => {
    b.click();
    b.click();
  });
  await expect(dialog.locator('[data-message]')).toContainText('Single added');
  expect(calls.filter((c) => c.name === 'recover_leaderboard_single')).toHaveLength(1);
  await expect(dialog.locator('[data-add]')).toBeDisabled();
  await inspect('b');
  await expect(dialog).toContainText('The solve was paused.');
  await watchAndReturn();
  await expect(dialog.locator('[data-add]')).toBeDisabled();
  await inspect('c');
  await watchAndReturn();
  await expect(dialog.locator('[data-add]')).toBeDisabled();
  await dialog.locator('[data-warnings]').check();
  await expect(dialog.locator('[data-add]')).toBeEnabled();
  await dialog.screenshot({ path: '/tmp/fto-recovery-desktop.png' });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await dialog.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(false);
  await dialog.screenshot({ path: '/tmp/fto-recovery-mobile.png' });
});
