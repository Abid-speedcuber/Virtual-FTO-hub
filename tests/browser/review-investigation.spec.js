import { waitForApp } from './helpers.js';
import { test, expect } from './fixtures.js';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';
function replay(username) {
  let now = 0;
  const r = new SolveRecorder({}, () => now),
    U = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' },
    view = { rotation: [0, 0, 0, 1], radius: 10 };
  r.arm({ size: 3, scramble: [U], view, keyboard: defaultConfig(3), colors: {} });
  r.begin(view, defaultConfig(3));
  now = 1000;
  r.event('turn', { id: 1, move: { ...U, dir: -1 } });
  return { ...r.finish(now, true), usedPause: false, solver: { username } };
}
async function setup(page, { legacyNotifications = false } = {}) {
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
  let queue = [
    { id: 'first', username: 'matt', metric: 'single', ms: 1000, status: 'pending' },
    { id: 'second', username: 'other', metric: 'single', ms: 1000, status: 'pending' },
  ];
  const notices = [
    {
      id: 1,
      metric: 'single',
      ms: 33260,
      decision: 'approved',
      note: '',
      created_at: new Date().toISOString(),
      read_at: null,
    },
    {
      id: 2,
      metric: 'ao12',
      ms: 44280,
      decision: 'held',
      note: 'We are investigating possible macro use and holding verification pending further investigation.',
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
    if (['my_leaderboard_candidates', 'leaderboard'].includes(name)) data = [];
    if (name === 'my_submission_notifications') {
      if (legacyNotifications && args.include_investigations)
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'PGRST202',
            message:
              'Could not find the function public.my_submission_notifications(include_investigations) in the schema cache',
          }),
        });
      data = legacyNotifications ? notices.filter((n) => n.decision !== 'held') : notices;
    }
    if (name === 'review_queue') data = queue;
    if (name === 'review_evidence') {
      const row = queue.find((r) => r.id === args.submission);
      data = [{ ms: 1000, dnf: false, recording: replay(row.username) }];
    }
    if (name === 'hold_submission') {
      const row = queue.find((r) => r.id === args.submission);
      row.status = 'investigating';
      row.investigation_note = args.note;
      notices.unshift({
        id: notices.length + 1,
        metric: row.metric,
        ms: row.ms,
        decision: 'held',
        note: args.note,
        created_at: new Date().toISOString(),
        read_at: null,
      });
      data = { status: 'investigating' };
    }
    if (name === 'review_submission') {
      const row = queue.find((r) => r.id === args.submission);
      notices.unshift({
        id: notices.length + 1,
        metric: row.metric,
        ms: row.ms,
        decision: args.approve ? 'approved' : 'rejected',
        note: args.note,
        created_at: new Date().toISOString(),
        read_at: null,
      });
      queue = queue.filter((r) => r.id !== row.id);
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.addInitScript(
    ({ user, token, exp }) =>
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
      ),
    { user, token, exp },
  );
  await page.goto('/');
  await waitForApp(page);
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-signed-in', 'true');
  return calls;
}
test('personal notifications and connection dot reflect online/offline state without pausing the app', async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-connection', 'online');
  await expect(page.locator('.avatar-connection-dot')).toHaveAttribute(
    'aria-label',
    'Connection: Online',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
  });
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-connection', 'offline');
  await page.evaluate(() =>
    document.querySelector('.ft-avatar').replaceChildren(document.createTextNode('A')),
  );
  await expect(page.locator('.avatar-connection-dot')).toHaveCount(1);
  await expect(page.locator('.avatar-connection-dot')).toHaveAttribute(
    'aria-label',
    'Connection: Offline',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-connection', 'online');
  await page.locator('#notifications').click();
  await expect(page.locator('#submission-notifications-list')).toContainText(
    'Your 33.26 Single submission has been verified.',
  );
  await expect(page.locator('#submission-notifications-list')).toContainText(
    'Your 44.28 ao12 submission is on hold for further investigation.',
  );
  await expect(page.locator('#submission-notifications-list')).toContainText(
    'We are investigating possible macro use',
  );
  await page
    .locator('#notifications-dialog')
    .screenshot({ path: '/tmp/fto-investigation-notifications.png' });
});
test('admin writes hold/rejection explanations and can complete a held investigation later', async ({
  page,
}) => {
  const calls = await setup(page);
  await page.locator('#ft-account-trigger').click();
  await page.getByRole('menuitem', { name: 'Review solves', exact: true }).click();
  await expect(page.locator('#solve-review-panel [data-check]')).toHaveAttribute(
    'data-valid',
    'true',
  );
  await page.locator('#solve-review-panel [data-hold]').click();
  await expect(page.locator('#solve-review-panel [data-message]')).toContainText(
    'Write the investigation message',
  );
  expect(calls.some((c) => c.name === 'hold_submission')).toBe(false);
  const message = 'We are checking possible macro use before verifying this solve.';
  await page.locator('#solve-review-panel [data-note]').fill(message);
  await page.locator('#solve-review-panel [data-hold]').click();
  await expect(page.locator('#solve-review-panel [data-count]')).toContainText('1 on hold');
  await page.getByRole('button', { name: 'On hold', exact: true }).click();
  await expect(page.locator('#solve-review-panel [data-investigation]')).toContainText(message);
  await expect(page.locator('.review-hold-badge')).toHaveText('On hold');
  await expect(page.locator('#solve-review-panel [data-note]')).toHaveValue('');
  await page.locator('#solve-review-panel [data-approve]').click();
  await expect(page.locator('#solve-review-panel [data-count]')).toHaveText('1 pending');
  await page.getByRole('button', { name: 'To review', exact: true }).click();
  await expect(page.locator('#solve-review-panel [data-solver]')).toHaveText('other');
  await page.locator('#solve-review-panel [data-reject]').click();
  await expect(page.locator('#solve-review-panel [data-message]')).toContainText(
    'Write an explanation',
  );
  const reason = 'Your username is offensive. Please contact Abid to resolve it.';
  await page.locator('#solve-review-panel [data-note]').fill(reason);
  await page.locator('#solve-review-panel [data-reject]').click();
  await expect(page.locator('#solve-review-panel [data-count]')).toHaveText('0 pending');
  expect(calls.find((c) => c.name === 'hold_submission').args.note).toBe(message);
  expect(calls.filter((c) => c.name === 'review_submission').at(-1).args.note).toBe(reason);
  await page.locator('#solve-review-panel [data-close]').click();
  await page.locator('#notifications').click();
  await expect(page.locator('#submission-notifications-list')).toContainText(reason);
  await expect(page.locator('#submission-notifications-list')).toContainText(
    'Your 1.00 Single submission has been rejected.',
  );
});

test('notification wording works with the older hosted backend during local hand testing', async ({
  page,
}) => {
  const calls = await setup(page, { legacyNotifications: true });
  await page.locator('#notifications').click();
  await expect(page.locator('#submission-notifications-list')).toContainText(
    'Your 33.26 Single submission has been verified.',
  );
  await expect(page.locator('#submission-notifications-list')).not.toContainText(
    'has been rejected',
  );
  expect(
    calls.some(
      (c) => c.name === 'my_submission_notifications' && c.args.include_investigations === true,
    ),
  ).toBe(true);
  expect(
    calls.some((c) => c.name === 'my_submission_notifications' && !c.args.include_investigations),
  ).toBe(true);
});
