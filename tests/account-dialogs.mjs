import { browserLaunchOptions } from './browser-options.js';
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dist = path.resolve('dist'),
  out = path.resolve('test-results/account-dialogs');
const user = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'solver@example.com',
  user_metadata: {},
  aud: 'authenticated',
};
const token =
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url') +
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
const session = {
  access_token: token,
  refresh_token: 'test-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user,
};
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};
const browser = await chromium.launch(browserLaunchOptions);
await mkdir(out, { recursive: true });
async function setup(base, recovery = false, failVerify = true) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } }),
    page = await context.newPage(),
    calls = [],
    errors = [];
  let failRecovery = true,
    failLogin = true,
    missingProfile = recovery,
    wcaConnected = false,
    failLink = true;
  page.on('pageerror', (e) => errors.push(e.message));
  if (recovery)
    await context.addInitScript(() =>
      localStorage.setItem(
        'ftoers.auth.v1-code-verifier',
        JSON.stringify('test-verifier/recovery'),
      ),
    );
  await context.route('https://auth-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1),
      method = route.request().method(),
      body = ['POST', 'PUT'].includes(method) ? route.request().postDataJSON() : null;
    calls.push({ name, method, body });
    let data = {},
      status = 200;
    if (name === 'recover' && failRecovery) {
      status = 429;
      data = {
        msg: 'Please wait before requesting another email.',
        error_code: 'over_email_send_rate_limit',
      };
      failRecovery = false;
    }
    if (name === 'signup') data = { user, session: null };
    if (name === 'verify') {
      if (failVerify) {
        status = 400;
        data = { msg: 'The verification code is invalid or expired.', error_code: 'otp_expired' };
        failVerify = false;
      } else data = session;
    }
    if (name === 'token') {
      if (url.searchParams.get('grant_type') === 'password' && failLogin) {
        status = 400;
        data = { msg: 'Invalid login credentials', error_code: 'invalid_credentials' };
        failLogin = false;
      } else data = session;
    }
    if (name === 'user') data = user;
    if (name === 'my_profile') {
      if (recovery) await new Promise((r) => setTimeout(r, 200));
      data = missingProfile
        ? null
        : {
            id: user.id,
            username: 'Solver',
            admin: false,
            wca_connected: wcaConnected,
            wca_id: wcaConnected ? '2015TEST01' : null,
            wca_name: wcaConnected ? 'WCA Solver' : null,
            wca_verified: wcaConnected,
          };
    }
    if (name === 'claim_profile') {
      missingProfile = false;
      data = { id: user.id, username: body.name, admin: false };
    }
    if (url.pathname.includes('/user/identities/authorize')) {
      if (failLink) {
        failLink = false;
        status = 409;
        data = { msg: 'Identity already exists', error_code: 'identity_already_exists' };
      } else {
        wcaConnected = true;
        data = { url: 'https://auth-test.supabase.co/wca-connected' };
      }
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      return;
    }
    if (name === 'authorize') {
      await route.fulfill({ contentType: 'text/html', body: 'Google OAuth started' });
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await context.route('https://ftoers.test/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/shared/config.js')) {
      await route.fulfill({
        contentType: 'text/javascript',
        body: "export const backendConfig={url:'https://auth-test.supabase.co',key:'test-public-key'};",
      });
      return;
    }
    let file =
      url.pathname === '/'
        ? path.resolve('tests/fixtures/account-home.html')
        : path.join(
            dist,
            url.pathname.startsWith('/virtual/') ? url.pathname.slice(9) : url.pathname.slice(1),
          );
    if (url.pathname === '/virtual/') file = path.join(dist, 'index.html');
    try {
      await route.fulfill({
        body: await readFile(file),
        contentType: types[path.extname(file)] ?? 'application/octet-stream',
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await page.goto('https://ftoers.test' + base + (recovery ? '?code=test-recovery-code' : ''));
  await page.locator('#ft-account-trigger').waitFor();
  return { page, context, calls, errors };
}
async function mobile(page, name) {
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(
    await page.locator('.ft-auth').evaluate((e) => e.scrollWidth > e.clientWidth),
    false,
  );
  await page.screenshot({ path: out + '/' + name + '-mobile.png' });
  await page.setViewportSize({ width: 1200, height: 900 });
}
async function checkEye(page, field = 'password') {
  const input = page.locator('[name=' + field + ']'),
    button = page.locator(
      '[data-password-toggle="' +
        (field === 'confirm' ? 'ft-password-confirm' : 'ft-password') +
        '"]',
    );
  const value = await input.inputValue();
  assert.equal(await input.getAttribute('type'), 'password');
  await button.click();
  assert.equal(await input.getAttribute('type'), 'text');
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  assert.equal(await input.inputValue(), value);
  await button.click();
  assert.equal(await input.getAttribute('type'), 'password');
}
async function signIn(page) {
  await page.locator('#ft-account-trigger').click();
  await page.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
  await page.locator('.ft-auth[open]').waitFor();
}
try {
  for (const base of ['/', '/virtual/']) {
    const { page, context, calls, errors } = await setup(base),
      site = base === '/' ? 'home' : 'simulator';
    await signIn(page);
    await checkEye(page);
    assert.equal(await page.locator('.ft-google svg').count(), 1);
    assert.equal(await page.locator('.ft-wca').isVisible(), true);
    await page.screenshot({ path: `${out}/${site}-login.png` });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.locator('.ft-auth').evaluate((e) => e.scrollWidth > e.clientWidth),
        false,
      );
      await page.screenshot({ path: `${out}/${site}-login-${width}.png` });
    }
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.locator('[name=email]').fill(user.email);
    await page.locator('[name=username]').fill('Solver');
    assert.equal(await page.locator('[name=wca_id]').getAttribute('required'), null);
    await page.locator('[name=wca_id]').fill('2024ashr02');
    await page.locator('[name=password]').fill('new-password-123');
    await page.locator('[name=confirm]').fill('wrong-password');
    assert.equal(await page.locator('#ft-password-mismatch').isVisible(), false);
    await page.locator('.ft-submit').click();
    assert.equal(
      calls.some((c) => c.name === 'signup'),
      false,
    );
    assert.equal(await page.locator('#ft-password-mismatch').isVisible(), true);
    await page.locator('[name=confirm]').fill('new-password-123');
    await checkEye(page);
    await checkEye(page, 'confirm');
    await page.screenshot({ path: `${out}/${site}-signup.png` });
    await mobile(page, site + '-signup');
    await page.locator('.ft-submit').click();
    await page.getByRole('heading', { name: 'Confirm your email', exact: true }).waitFor();
    assert.equal(calls.find((c) => c.name === 'signup').body.data.requested_username, 'Solver');
    assert.equal(calls.find((c) => c.name === 'signup').body.data.requested_wca_id, '2024ASHR02');
    assert.equal(await page.locator('[name=password]').isEnabled(), false);
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(sessionStorage.getItem('ftoers.email-verification.v1'))),
      { kind: 'signup', email: user.email },
    );
    await page.reload();
    await signIn(page);
    await page.getByRole('heading', { name: 'Confirm your email', exact: true }).waitFor();
    await page.locator('[name=code]').fill('00000000');
    await page.locator('.ft-submit').click();
    await page.locator('.ft-auth[data-state=error]').waitFor();
    assert.equal(calls.find((c) => c.name === 'verify').body.type, 'email');
    await page.getByRole('button', { name: 'Resend code', exact: true }).click();
    await page.locator('.ft-notice').filter({ hasText: 'new code' }).waitFor();
    assert.equal(calls.find((c) => c.name === 'resend').body.type, 'signup');
    await mobile(page, site + '-verification');
    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    assert.equal(await page.locator('.ft-oauth').isVisible(), false);
    assert.equal(await page.locator('[name=password]').isEnabled(), false);
    await page.locator('[name=email]').fill(user.email);
    await page.locator('.ft-submit').click();
    await page.locator('.ft-auth[data-state=error]').waitFor();
    assert.match(await page.locator('.ft-notice').textContent(), /hourly email limit/);
    assert.equal(await page.locator('.ft-submit').isEnabled(), true);
    await page.screenshot({ path: `${out}/${site}-reset-error.png` });
    await mobile(page, site + '-reset');
    await page.locator('.ft-submit').click();
    await page.getByRole('heading', { name: 'Reset your password', exact: true }).waitFor();
    assert.equal(calls.filter((c) => c.name === 'recover').length, 2);
    await page.screenshot({ path: `${out}/${site}-reset-code.png` });
    await page.locator('[name=code]').fill('12345678');
    await page.locator('.ft-submit').click();
    await page.getByRole('heading', { name: 'Set a new password', exact: true }).waitFor();
    assert.equal(calls.filter((c) => c.name === 'verify').at(-1).body.type, 'recovery');
    await page.locator('[name=password]').fill('changed-password-123');
    await page.locator('[name=confirm]').fill('changed-password-123');
    await checkEye(page);
    await checkEye(page, 'confirm');
    await page.locator('.ft-submit').click();
    await page.locator('.ft-auth[data-state=success]').waitFor();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.locator('.ft-auth').waitFor({ state: 'hidden' });
    await page.locator('#ft-account-trigger').click();
    await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
    await page.locator('.ft-profile [data-sign-out]').click();
    await page.locator('#ft-account-trigger[data-signed-in=false]').waitFor();
    await signIn(page);
    await page.locator('[name=identity]').fill(user.email);
    await page.locator('[name=password]').fill('password-123');
    await page.locator('.ft-submit').click();
    await page.locator('.ft-auth[data-state=error]').waitFor();
    await page.locator('.ft-submit').click();
    await page.locator('.ft-auth').waitFor({ state: 'hidden' });
    await page.locator('#ft-account-trigger').click();
    assert.deepEqual(
      await page
        .locator('#ft-account-menu button')
        .allTextContents()
        .then((items) => items.slice(0, 1)),
      ['Profile'],
    );
    await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
    await page.locator('.ft-profile [data-connect="custom:wca"]').click();
    await page.locator('.ft-profile .ft-notice').filter({ hasText: 'Merge accounts' }).waitFor();
    const linkCall = calls.find((call) => call.name === 'authorize' && call.method === 'GET');
    assert.ok(linkCall);
    await page.locator('.ft-profile [data-connect="custom:wca"]').click();
    await page.waitForURL('https://auth-test.supabase.co/wca-connected');
    await page.goto('https://ftoers.test' + base);
    await page.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
    await page.locator('#ft-account-trigger').click();
    await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
    await page.locator('[data-verified-wca]').filter({ hasText: '2015TEST01' }).waitFor();
    assert.equal(await page.locator('.ft-submit').isVisible(), false);
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(
      await page
        .locator('.ft-profile')
        .evaluate((element) => element.scrollWidth > element.clientWidth),
      false,
    );
    await page.screenshot({ path: out + '/' + site + '-profile-mobile.png' });
    await page.setViewportSize({ width: 1200, height: 900 });
    assert.deepEqual(errors, []);
    await context.close();
    const signup = await setup(base, false, false);
    await signIn(signup.page);
    await signup.page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await signup.page.locator('[name=email]').fill(user.email);
    await signup.page.locator('[name=username]').fill('Solver');
    for (const name of ['password', 'confirm'])
      await signup.page.locator('[name=' + name + ']').fill('new-password-123');
    await signup.page.locator('.ft-submit').click();
    await signup.page.locator('[name=code]').fill('12345678');
    await signup.page.locator('.ft-submit').click();
    await signup.page.locator('.ft-auth').waitFor({ state: 'hidden' });
    assert.equal(signup.calls.find((c) => c.name === 'verify').body.type, 'email');
    assert.equal(
      await signup.page.evaluate(() => sessionStorage.getItem('ftoers.email-verification.v1')),
      null,
    );
    assert.deepEqual(signup.errors, []);
    await signup.context.close();
    const r = await setup(base, true);
    await r.page.locator('.ft-auth[open] h2').filter({ hasText: 'Set a new password' }).waitFor();
    await r.page.locator('[name=password]').fill('new-password-123');
    await r.page.locator('[name=confirm]').fill('different-password');
    assert.equal(await r.page.locator('#ft-password-mismatch').isVisible(), false);
    await r.page.locator('.ft-submit').click();
    assert.equal(
      r.calls.some((c) => c.name === 'user' && c.method === 'PUT'),
      false,
    );
    await r.page.locator('[name=confirm]').fill('new-password-123');
    await r.page.screenshot({ path: `${out}/${site}-new-password.png` });
    await mobile(r.page, site + '-new-password');
    await r.page.locator('.ft-submit').click();
    await r.page.locator('.ft-auth[data-state=success]').waitFor();
    assert.equal(
      r.calls.find((c) => c.name === 'user' && c.method === 'PUT').body.password,
      'new-password-123',
    );
    await r.page.getByRole('button', { name: 'Done', exact: true }).click();
    await r.page.locator('.ft-auth h2').filter({ hasText: 'Choose your username' }).waitFor();
    await mobile(r.page, site + '-username');
    await r.page.locator('[name=username]').fill('Solver');
    assert.equal(await r.page.locator('[name=wca_id]').getAttribute('required'), null);
    await r.page.locator('[name=wca_id]').fill('2015test01');
    await r.page.locator('.ft-submit').click();
    await r.page.locator('.ft-auth').waitFor({ state: 'hidden' });
    assert.deepEqual(r.calls.find((call) => call.name === 'claim_profile').body, {
      name: 'Solver',
      wca_id: '2015TEST01',
    });
    assert.deepEqual(r.errors, []);
    await r.context.close();
    const oauth = await setup(base);
    await signIn(oauth.page);
    await oauth.page.getByRole('button', { name: 'Continue with Google' }).click();
    await oauth.page.waitForURL('https://auth-test.supabase.co/auth/v1/authorize**');
    assert.equal(new URL(oauth.page.url()).searchParams.get('provider'), 'google');
    assert.equal(
      new URL(oauth.page.url()).searchParams.get('redirect_to'),
      'https://ftoers.test' + base,
    );
    await oauth.context.close();
    const wca = await setup(base);
    await signIn(wca.page);
    await wca.page.getByRole('button', { name: 'Continue with WCA', exact: true }).click();
    await wca.page.waitForURL('https://auth-test.supabase.co/auth/v1/authorize**');
    assert.equal(new URL(wca.page.url()).searchParams.get('provider'), 'custom:wca');
    assert.equal(
      new URL(wca.page.url()).searchParams.get('redirect_to'),
      'https://ftoers.test' + base,
    );
    await wca.context.close();
  }
  console.log(
    'Account dialogs passed on both sites: mobile layouts, password eyes/matching, signup/recovery email codes, resend/errors, cross-page pending verification, password updates, PKCE callbacks, username onboarding and Google redirect. No real email or credentials used.',
  );
} finally {
  await browser.close();
}
