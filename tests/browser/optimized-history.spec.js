import { test, expect } from './fixtures.js';
test('large histories render a bounded range, reach the earliest result, and defer the hidden dialog', async ({
  page,
}) => {
  await page.route('**/history-harness', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><link rel="stylesheet" href="/src/style.css"><h2 id="history-title"></h2><span id="history-count"></span><span id="times-count"></span><p id="history-empty"></p><p id="times-empty"></p><ol id="solve-times" style="height:340px;max-height:340px"></ol><dialog><ol id="history-times" style="height:340px;max-height:340px"></ol></dialog>`,
    }),
  );
  await page.goto('/history-harness');
  await page.evaluate(async () => {
    const { renderTimeHistory } = await import('/src/time-history-ui.js');
    const times = Array.from({ length: 10000 }, (_, i) => ({ ms: 1000 + i }));
    window.clicked = null;
    const start = performance.now();
    renderTimeHistory({
      size: 3,
      session: { times, completed: 10000 },
      openSingle: (i) => {
        window.clicked = i;
      },
      openAverage: () => {},
    });
    window.renderMs = performance.now() - start;
  });
  expect(await page.locator('#solve-times li[data-result-index]').count()).toBeLessThan(40);
  await expect(page.locator('#solve-times li[data-result-index]').first()).toHaveAttribute(
    'data-result-index',
    '9999',
  );
  await expect(page.locator('#history-times li')).toHaveCount(0);
  await page.locator('#solve-times').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.getByRole('button', { name: 'Solve 1: 1.00', exact: true }).click();
  expect(await page.evaluate(() => window.clicked)).toBe(0);
  const metrics = await page.evaluate(() => ({
    scroll: document.querySelector('#solve-times').scrollHeight,
    row: document.querySelector('#solve-times [data-result-index]').getBoundingClientRect().height,
    ms: window.renderMs,
  }));
  expect(metrics.row).toBe(34);
  expect(metrics.scroll).toBeGreaterThanOrEqual(340000);
  await page.locator('dialog').evaluate((el) => el.showModal());
  await expect(page.locator('#history-times li[data-result-index]').first()).toHaveAttribute(
    'data-result-index',
    '9999',
  );
  expect(await page.locator('#history-times li[data-result-index]').count()).toBeLessThan(40);
});
test('review pager sends cursor and filters to the server instead of paging held cases locally', async ({
  page,
}) => {
  await page.route('**/review-harness', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="solve-panel"></div>' }),
  );
  await page.goto('/review-harness');
  await page.evaluate(async () => {
    const { SolveReview } = await import('/src/solve-review.js');
    window.calls = [];
    window.review = new SolveReview({
      isAdmin: () => true,
      pause: () => {},
      play: () => {},
      rpc: async (name, args) => {
        window.calls.push({ name, args });
        if (name === 'review_evidence') return [];
        const next = !!args.after_cursor;
        return {
          rows: [
            {
              id: next ? 'later' : 'first',
              username: next ? 'Later' : 'First',
              metric: 'single',
              ms: 1000,
              status: args.review_state === 'held' ? 'investigating' : 'pending',
            },
          ],
          has_more: !next,
          next_cursor: {
            sort_at: '2026-01-01T00:00:00Z',
            created_at: '2026-01-01T00:00:00Z',
            id: '00000000-0000-4000-8000-000000000001',
          },
          counts: { pending: 27, held: 105 },
        };
      },
    });
    await window.review.open();
  });
  await page.locator('[data-next-page]').click();
  await expect(page.locator('[data-page]')).toHaveText('Page 2');
  await expect(page.locator('[data-queue-list]')).toContainText('Later');
  await expect(page.locator('[data-next-page]')).toBeDisabled();
  await page.locator('[data-review-state="held"]').click();
  await expect(page.locator('[data-page]')).toHaveText('Page 1');
  const calls = await page.evaluate(() =>
    window.calls.filter((c) => c.name === 'review_queue_page'),
  );
  expect(calls[1].args.after_cursor.id).toBe('00000000-0000-4000-8000-000000000001');
  expect(calls.at(-1).args).toEqual({ review_state: 'held', category: 'all', after_cursor: null });
});
