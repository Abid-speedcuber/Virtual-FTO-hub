import { browserLaunchOptions } from './browser-options.js';
// Explicit live smoke test. Creates one disposable Auth user, deletes it in finally.
// Never include FTOERS_SMOKE_SERVICE_KEY in a browser bundle or public config.
import { chromium } from '@playwright/test';
import { createClient } from '../public/shared/supabase.js';
import { backendConfig } from '../public/shared/config.js';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { SolveRecorder } from '../src/solve-recording.js';
import { defaultConfig } from '../src/keyboard-engine.js';
const key = process.env.FTOERS_SMOKE_SERVICE_KEY;
if (!key) throw Error('Supply a service-role key explicitly for this disposable-user test.');
const admin = createClient(backendConfig.url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomBytes(5).toString('hex'),
  email = `ftoers-smoke-${suffix}@example.com`,
  username = 'qa_' + suffix,
  password = randomBytes(24).toString('base64url') + 'A7!';
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;
const uid = data.user.id;
let browser;
let failure;
try {
  browser = await chromium.launch(browserLaunchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } }),
    home = await context.newPage();
  const base = process.env.FTOERS_SMOKE_BASE_URL || 'http://127.0.0.1:8080';
  await home.goto(base + '/');
  await home.locator('#account button').click();
  await home.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
  await home.locator('[name=identity]').fill(email);
  await home.locator('[name=password]').fill(password);
  await home.locator('.ft-submit').click();
  await home.getByRole('heading', { name: 'Choose your username' }).waitFor();
  await home.locator('[name=username]').fill(username);
  await home.locator('.ft-submit').click();
  await home.locator('.ft-dialog[open]').waitFor({ state: 'hidden' });
  await home.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
  assert.equal(await home.locator('#ft-account-trigger').getAttribute('title'), username);
  const simulator = await context.newPage();
  await simulator.goto(base + '/virtual/');
  await simulator.waitForFunction(() => window.fto?.snapshot().ready);
  await simulator.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
  console.log('PASS email login, username onboarding, homepage → simulator session');
  await home.locator('#account button').click();
  await home.getByRole('menuitem', { name: 'Profile' }).click();
  await home.locator('.ft-profile [data-sign-out]').click();
  await home.locator('#ft-account-trigger[data-signed-in=false]').waitFor();
  await simulator.locator('#ft-account-trigger[data-signed-in=false]').waitFor();
  console.log('PASS cross-tab sign-out');
  // Force overlapping profile refreshes to complete at different times.
  let profileRequests = 0;
  await simulator.route('**/rest/v1/rpc/my_profile', async (route) => {
    const order = ++profileRequests;
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, order === 1 ? 20 : 250));
    await route.fulfill({ response });
  });
  await simulator.locator('#network-account button').click();
  await simulator.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
  await simulator.locator('[name=identity]').fill(username.toUpperCase());
  await simulator.locator('[name=password]').fill(password);
  await simulator.locator('.ft-submit').click();
  try {
    await simulator.locator('.ft-dialog[open]').waitFor({ state: 'hidden', timeout: 8000 });
  } catch {
    console.log(
      'Form state',
      await simulator.locator('.ft-dialog form').evaluate((f) =>
        [...f.elements].map((e) => ({
          name: e.name,
          type: e.type,
          disabled: e.disabled,
          valid: e.validity?.valid,
        })),
      ),
    );
    throw Error(
      'Username sign-in failed: ' +
        (await simulator.locator('.ft-dialog [role=status]').textContent()),
    );
  }
  await home.locator('#ft-account-trigger[data-signed-in=true]').waitFor();
  assert.equal(await home.locator('#ft-account-trigger').getAttribute('title'), username);
  console.log('PASS case-insensitive username login and simulator → homepage session');
  const view = { rotation: [0, 0, 0, 1], radius: 10 },
    U = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' };
  let now = 0;
  const recorder = new SolveRecorder({}, () => now);
  recorder.arm({ size: 3, scramble: [U], view, keyboard: defaultConfig(3), colors: {} });
  recorder.begin(view, defaultConfig(3));
  now = 1000;
  const recording = recorder.finish(1000, true);
  const result = await simulator.evaluate(
    async ({ recording, sequence }) => {
      const account = await import(new URL('./shared/account.js', document.baseURI).href);
      const codes = await Promise.all(
        Array.from({ length: 6 }, () => account.rpc('create_short_link', { replay: recording })),
      );
      const attempt = await account.rpc('begin_attempt', { session: sequence });
      recording.usedUndo = true;
      const finished = await account.rpc('finish_attempt', { attempt, replay: recording });
      let denied = false;
      try {
        await account.rpc('review_queue');
      } catch {
        denied = true;
      }
      return { codes, finished, denied };
    },
    { recording, sequence: randomUUID() },
  );
  assert.equal(new Set(result.codes).size, 1);
  assert.equal(result.finished.dnf, true);
  assert.deepEqual(result.finished.submitted, []);
  assert.equal(result.denied, true);
  const anonymous = createClient(backendConfig.url, backendConfig.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const replay = await anonymous.rpc('get_short_link', { code: result.codes[0] });
  assert.equal(replay.error, null);
  assert.equal(replay.data.size, 3);
  console.log(
    'PASS concurrent short-link deduplication, anonymous playback, undo DNF and admin access restriction',
  );
  await context.close();
} catch (error) {
  failure = error;
} finally {
  const cleanup = await Promise.allSettled([
    browser?.close(),
    admin.auth.admin.deleteUser(uid).then((result) => {
      if (result.error) throw result.error;
    }),
  ]);
  const errors = cleanup
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);
  if (errors.length)
    failure = new AggregateError(
      [...(failure ? [failure] : []), ...errors],
      'Live test or cleanup failed',
    );
  else console.log('Disposable Auth user and related recording data removed.');
}
if (failure) throw failure;
