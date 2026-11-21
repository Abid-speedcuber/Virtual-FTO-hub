import { browserLaunchOptions } from './browser-options.js';
// Serve only this repo's build: intentionally no parent FTOers routes/files.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const dist = resolve('dist'),
  types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.mp3': 'audio/mpeg',
  };
const browser = await chromium.launch(browserLaunchOptions);
try {
  for (const base of ['/', '/virtual/']) {
    const context = await browser.newContext(),
      page = await context.newPage(),
      errors = [],
      missing = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await context.route('https://standalone.test/**', async (route) => {
      const { pathname } = new URL(route.request().url());
      if (!pathname.startsWith(base)) {
        missing.push(pathname);
        await route.fulfill({ status: 404 });
        return;
      }
      const rel = pathname.slice(base.length) || 'index.html';
      if (rel === 'shared/config.js') {
        await route.fulfill({
          contentType: 'text/javascript',
          body: "export const backendConfig={url:'',key:''};",
        });
        return;
      }
      try {
        await route.fulfill({
          body: await readFile(resolve(dist, rel)),
          contentType: types[extname(rel)] ?? 'application/octet-stream',
        });
      } catch {
        missing.push(pathname);
        await route.fulfill({ status: 404 });
      }
    });
    await page.goto('https://standalone.test' + base);
    await page.waitForFunction(() => window.fto?.snapshot().ready);
    await page.locator('#ft-account-trigger').click();
    assert.deepEqual(await page.getByRole('menuitem').allTextContents(), [
      'Sign in',
      'Settings',
      'About us',
    ]);
    await page.getByRole('menuitem', { name: 'Sign in', exact: true }).click();
    await page.locator('.ft-dialog[open]').waitFor();
    assert.equal(
      await page.locator('.ft-dialog[open]').evaluate((e) => getComputedStyle(e).backgroundColor),
      'rgb(25, 39, 36)',
    );
    await page.getByRole('button', { name: 'Close account' }).click();
    await page.locator('#leaderboard').click();
    await page.locator('#leaderboard-dialog[open]').waitFor();
    await page.locator('#board-message').filter({ hasText: 'backend is connected' }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(missing, []);
    await context.close();
  }
  console.log(
    'Standalone browser checks passed at / and /virtual/: account CSS/modules and simulator leaderboard need no parent checkout.',
  );
} finally {
  await browser.close();
}
