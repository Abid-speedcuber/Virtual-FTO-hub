import { test, expect } from './fixtures.js';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
function sessionFor(id) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = {
    id,
    email: id === first ? 'first@example.test' : 'second@example.test',
    aud: 'authenticated',
    user_metadata: {},
  };
  return {
    access_token:
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url') +
      '.' +
      Buffer.from(
        JSON.stringify({
          sub: id,
          exp,
          role: 'authenticated',
          amr: [{ method: 'oauth', timestamp: exp - 3600 }],
        }),
      ).toString('base64url') +
      '.signature',
    refresh_token: 'refresh-' + id,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user,
  };
}
async function setup(context, available = true) {
  const calls = [],
    primary = sessionFor(first),
    secondary = sessionFor(second);
  let username = 'FirstSolver';
  await context.addInitScript(
    (session) => localStorage.setItem('ftoers.auth.v1', JSON.stringify(session)),
    primary,
  );
  await context.route('**/shared/config.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: "export const backendConfig={url:'https://merge-backend.test',key:'public-test-key'};",
    }),
  );
  await context.route('**/__account_home__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="account"></div><script type="module">import {mountAccount} from "/shared/account.js";mountAccount(document.getElementById("account"),{surface:"home"});</script></body></html>',
    }),
  );
  await context.route('https://merge-backend.test/**', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1),
      body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    calls.push({ name, body });
    if (name === 'authorize') {
      const callback = new URL(url.searchParams.get('redirect_to'));
      callback.searchParams.set(
        'code',
        url.searchParams.get('provider') === 'google' ? 'primary' : 'secondary',
      );
      await route.fulfill({ status: 302, headers: { location: callback.href } });
      return;
    }
    let data = [],
      status = 200;
    if (name === 'token') data = body.auth_code === 'primary' ? primary : secondary;
    if (name === 'user')
      data = route.request().headers().authorization?.includes(secondary.access_token)
        ? secondary.user
        : primary.user;
    if (name === 'my_profile')
      data = {
        id: first,
        username,
        admin: false,
        logins: [{ provider: 'google', email: primary.user.email }],
        wca_connected: false,
      };
    if (name === 'rename_username') {
      if (body.name === 'TakenName') {
        status = 409;
        data = { message: 'Username already taken' };
      } else {
        username = body.name;
        data = { id: first, username };
      }
    }
    if (name === 'my_leaderboard_results') data = { candidates: [], ineligible: [] };
    if (name === 'merge_features') {
      data = { version: 1 };
      if (!available) {
        status = 404;
        data = { message: 'Could not find the function merge_features' };
      }
    }
    if (name === 'merge-accounts')
      data =
        body.action === 'preview'
          ? {
              ticket: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              primary: { username, approved: 2, pending: 1, held: 0, links: 3 },
              secondary: {
                username: 'SecondSolver',
                approved: 1,
                pending: 2,
                held: 1,
                links: 4,
                wca_id: '2015TEST01',
                wca_verified: true,
              },
            }
          : { username: 'SecondSolver', sign_in_again: true };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { calls, primary };
}
for (const surface of ['home', 'simulator'])
  test(`profile and verified merge flow on ${surface}`, async ({ page, context }) => {
    const { calls, primary } = await setup(context),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(surface === 'home' ? '/__account_home__' : '/');
    await page.locator('#ft-account-trigger').click();
    await expect(page.getByRole('menuitem').first()).toHaveText('Profile');
    await expect(page.getByRole('menuitem', { name: 'Log out', exact: true })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
    await expect(page.locator('.ft-profile [data-profile-name]')).toHaveText('FirstSolver');
    await expect(page.locator('.ft-profile [data-connect="google"]')).toBeHidden();
    await expect(page.locator('.ft-profile [data-connect="custom:wca"]')).toBeVisible();
    await page.getByRole('button', { name: 'Change username', exact: true }).click();
    await page.locator('#ft-profile-username').fill('TakenName');
    await page.getByRole('button', { name: 'Save username', exact: true }).click();
    await expect(page.locator('.ft-username-status')).toHaveText('Username already taken');
    await page.locator('#ft-profile-username').fill('FirstSolverRenamed');
    await expect(page.locator('.ft-username-status')).toHaveText('');
    await page.getByRole('button', { name: 'Save username', exact: true }).click();
    await expect(page.locator('[data-profile-name]')).toHaveText('FirstSolverRenamed');
    await expect(page.locator('#ft-account-trigger')).toHaveAttribute(
      'title',
      'FirstSolverRenamed',
    );
    await expect(page.locator('[data-username-form]')).toBeHidden();
    await page
      .locator('.ft-profile')
      .screenshot({ path: '/tmp/ftoers-profile-' + surface + '.png' });
    await page.locator('.ft-profile [data-merge]').click();
    await expect(page.locator('.ft-merge')).toBeVisible();
    for (const [slot, provider] of [
      ['primary', 'google'],
      ['secondary', 'custom:wca'],
    ]) {
      const opened = page.waitForEvent('popup');
      await page.locator(`[data-proof=${slot}] [data-provider="${provider}"]`).click();
      const popup = await opened;
      popup.on('pageerror', (error) => errors.push(error.message));
      await expect(page.locator(`[data-proof=${slot}] [data-proof-status]`)).toContainText(
        /Sign-in succeeded|Waiting for the merge service|Ownership and account selection/,
      );
      await expect(page.locator(`[data-proof=${slot}] .ft-proof-methods`)).toBeHidden();
      await expect(page.locator(`[data-proof=${slot}] [data-change-proof]`)).toBeAttached();
      expect(
        await page.evaluate(() => JSON.parse(localStorage.getItem('ftoers.auth.v1')).access_token),
      ).toBe(primary.access_token);
    }
    await expect(page.locator('.ft-merge [data-preview]')).toBeVisible();
    await expect(page.locator('.ft-merge-choices')).toContainText('SecondSolver');
    await expect(page.locator('.ft-merge [data-complete]')).toBeDisabled();
    expect(
      calls.filter((call) => call.name === 'merge-accounts' && call.body.action === 'confirm'),
    ).toHaveLength(0);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page
        .locator('.ft-merge')
        .evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBe(false);
    await page.screenshot({ path: '/tmp/ftoers-merge-' + surface + '-mobile.png' });
    await page.locator('.ft-merge input[value=secondary]').check();
    await page.locator('[data-confirm-merge]').check();
    await page.locator('[data-complete]').click();
    await expect(page.locator('.ft-auth[open] .ft-notice')).toContainText('Accounts merged');
    expect(
      calls.find((call) => call.name === 'merge-accounts' && call.body.action === 'confirm').body
        .keep,
    ).toBe('secondary');
    expect(errors).toEqual([]);
  });
test('profile handles a backend awaiting merge deployment without starting OAuth', async ({
  page,
  context,
}) => {
  const { calls } = await setup(context, false);
  await page.goto('/__account_home__');
  await page.locator('#ft-account-trigger').click();
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
  await page.locator('.ft-profile [data-merge]').click();
  await expect(page.locator('.ft-profile .ft-notice')).toContainText('not enabled yet');
  expect(calls.some((call) => call.name === 'merge-accounts' || call.name === 'authorize')).toBe(
    false,
  );
});

test('log out is available inside Profile', async ({ page, context }) => {
  await setup(context);
  await page.goto('/__account_home__');
  await page.locator('#ft-account-trigger').click();
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
  await page.locator('.ft-profile [data-sign-out]').click();
  await expect(page.locator('#ft-account-trigger')).toHaveAttribute('data-signed-in', 'false');
  await expect(page.locator('.ft-profile')).toBeHidden();
});

async function openVerifiedPair(page) {
  await page.goto('/__account_home__');
  await page.locator('#ft-account-trigger').click();
  await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
  await page.locator('.ft-profile [data-merge]').click();
  for (const [slot, provider] of [
    ['primary', 'google'],
    ['secondary', 'custom:wca'],
  ]) {
    const opened = page.waitForEvent('popup');
    await page.locator(`[data-proof=${slot}] [data-provider="${provider}"]`).click();
    await opened;
    await expect(page.locator(`[data-proof=${slot}] .ft-proof-methods`)).toBeHidden();
    await expect(page.locator(`[data-proof=${slot}] [data-proof-title]`)).not.toHaveText(
      'Signing in…',
    );
  }
}
test('failed preview fetch keeps sign-ins distinct from server verification and retries without OAuth', async ({
  page,
  context,
}) => {
  const { calls } = await setup(context);
  let failed = false;
  await context.route('https://merge-backend.test/functions/v1/merge-accounts', async (route) => {
    if (!failed && route.request().postDataJSON().action === 'preview') {
      failed = true;
      await route.abort('failed');
      return;
    }
    await route.fallback();
  });
  await openVerifiedPair(page);
  await expect(page.locator('.ft-merge .ft-notice')).toContainText('account check is incomplete');
  await expect(page.locator('.ft-merge .ft-notice')).toContainText('No accounts were merged');
  for (const slot of ['primary', 'secondary']) {
    await expect(page.locator(`[data-proof=${slot}]`)).toHaveAttribute(
      'data-proof-state',
      'signed-in',
    );
    await expect(page.locator(`[data-proof=${slot}] [data-proof-title]`)).toContainText(
      'Signed in with',
    );
    await expect(page.locator(`[data-proof=${slot}] .ft-proof-methods`)).toBeHidden();
    await expect(page.locator(`[data-proof=${slot}] [data-change-proof]`)).toBeVisible();
  }
  await page.screenshot({ path: '/tmp/ftoers-merge-network-error.png' });
  const oauthCalls = calls.filter((call) => call.name === 'authorize').length;
  await page.locator('[data-retry-check]').click();
  await expect(page.locator('[data-preview]')).toBeVisible();
  expect(calls.filter((call) => call.name === 'authorize').length).toBe(oauthCalls);
  expect(
    calls.some((call) => call.name === 'merge-accounts' && call.body.action === 'confirm'),
  ).toBe(false);
});
test('expired sign-ins are not shown as verified and can be changed', async ({ page, context }) => {
  await setup(context);
  await context.route('https://merge-backend.test/functions/v1/merge-accounts', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Account verification expired. Sign in again.' }),
    }),
  );
  await openVerifiedPair(page);
  await expect(page.locator('.ft-merge .ft-notice')).toContainText('expired');
  await expect(page.locator('[data-proof=primary]')).toHaveAttribute(
    'data-proof-state',
    'needs-sign-in',
  );
  await expect(page.locator('[data-proof=primary] [data-provider=google]')).toBeHidden();
  await page.locator('[data-proof=primary] [data-change-proof]').click();
  await expect(page.locator('[data-proof=primary] [data-provider=google]')).toBeVisible();
});
test('lost confirmation response never claims no merge occurred or allows a blind second merge', async ({
  page,
  context,
}) => {
  await setup(context);
  await context.route('https://merge-backend.test/functions/v1/merge-accounts', async (route) => {
    if (route.request().postDataJSON().action === 'confirm') await route.abort('failed');
    else await route.fallback();
  });
  await openVerifiedPair(page);
  await expect(page.locator('[data-preview]')).toBeVisible();
  await page.locator('[data-confirm-merge]').check();
  await page.locator('[data-complete]').click();
  await expect(page.locator('.ft-merge .ft-notice')).toContainText('merge may have finished');
  await expect(page.locator('[data-complete]')).toBeDisabled();
  await expect(page.locator('[data-check-profile]')).toBeVisible();
});
