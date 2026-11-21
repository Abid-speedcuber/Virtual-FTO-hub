import { test, expect } from './fixtures.js';
import { freezeClock } from './helpers.js';

test(
  'clock freezing tolerates slow commands and preserves explicit elapsed time',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.clock.install();
    // Simulate a round trip longer than the old 100ms pauseAt margin.
    await freezeClock({
      clock: page.clock,
      evaluate: async (fn) => {
        const value = await page.evaluate(fn);
        await new Promise((resolve) => setTimeout(resolve, 250));
        return value;
      },
    });
    const before = await page.evaluate(() => ({ wall: Date.now(), ticks: performance.now() }));
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => ({ wall: Date.now(), ticks: performance.now() }))).toEqual(
      before,
    );
    await page.clock.runFor(1000);
    const after = await page.evaluate(() => ({ wall: Date.now(), ticks: performance.now() }));
    expect(after.wall - before.wall).toBe(1000);
    expect(after.ticks - before.ticks).toBe(1000);
  },
);

test(
  'default worker fixture handles Vite query strings without loading the real solver',
  { tag: '@smoke' },
  async ({ page }) => {
    const vendor = [];
    page.on('request', (request) => {
      if (request.url().includes('/src/vendor/')) vendor.push(request.url());
    });
    await page.route('**/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Worker fixture</title>',
      }),
    );
    await page.goto('/');
    for (const url of ['/src/worker.js', '/src/worker.js?worker_file&type=module']) {
      const scramble = await page.evaluate(
        (url) =>
          new Promise((resolve, reject) => {
            const worker = new Worker(url, { type: 'module' });
            worker.onmessage = (event) => {
              worker.terminate();
              resolve(event.data.scramble);
            };
            worker.onerror = (event) => {
              worker.terminate();
              reject(Error(event.message));
            };
            worker.postMessage(null);
          }),
        url,
      );
      expect(scramble).toBe('U F');
    }
    expect(vendor).toEqual([]);
  },
);

test(
  'extra sessions isolate storage and block external backend requests',
  { tag: '@smoke' },
  async ({ page, createContext }) => {
    const extra = await createContext();
    const other = await extra.newPage();
    for (const target of [page, other]) {
      await target.route('**/', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Isolated fixture</title>',
        }),
      );
      await target.goto('/');
    }
    await page.evaluate(() => localStorage.setItem('fixture-isolation', 'base'));
    expect(await other.evaluate(() => localStorage.getItem('fixture-isolation'))).toBeNull();
    for (const target of [page, other]) {
      const url = 'https://backend.invalid/rest/v1/attempts';
      const failed = target.waitForEvent('requestfailed', {
        predicate: (request) => request.url() === url,
      });
      await target.evaluate(
        (url) => fetch(url, { method: 'POST', body: '{}' }).catch(() => null),
        url,
      );
      expect((await failed).failure().errorText).toContain('ERR_BLOCKED_BY_CLIENT');
    }
  },
);
