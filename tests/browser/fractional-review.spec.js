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
  now = 22400.40000000596;
  r.event('turn', { id: 1, move: { ...U, dir: -1 } });
  return r.finish(now, true);
}
for (const metric of ['single', 'ao5', 'ao12'])
  test(`${metric} fractional recording evidence can be reviewed and approved`, async ({ page }) => {
    await page.route('**/review-harness', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="solve-panel"></div>',
      }),
    );
    await page.goto('/review-harness');
    await page.evaluate(
      async ({ recording, metric }) => {
        const { SolveReview } = await import('/src/solve-review.js');
        const count = { single: 1, ao5: 5, ao12: 12 }[metric],
          row = { id: 'fractional', metric, ms: 22400.400000006, username: 'matt' };
        window.review = new SolveReview({
          isAdmin: () => true,
          pause: () => {},
          play: () => {},
          rpc: async (name) =>
            name === 'review_queue'
              ? [row]
              : Array.from({ length: count }, () => ({ ms: row.ms, dnf: false, recording })),
        });
        await window.review.open();
        window.baseEvidence = structuredClone(window.review.evidence);
      },
      { recording: recording(), metric },
    );
    await expect(page.locator('[data-approve]')).toBeEnabled();
    await expect(page.locator('[data-check]')).toHaveAttribute('data-valid', 'true');
    // Meaningfully altered or paused evidence must remain ineligible.
    for (const change of ['altered', 'pause', 'legacy-pause', 'undo']) {
      await page.evaluate(async (change) => {
        const row = window.review.current,
          entry = structuredClone(window.baseEvidence[0]);
        if (change === 'altered') entry.recording.solveMs += 1;
        else if (change === 'pause') entry.recording.usedPause = true;
        else if (change === 'legacy-pause')
          entry.recording.events.splice(1, 0, { type: 'pause', at: 0 });
        else entry.recording.usedUndo = true;
        window.review.rpc = async () =>
          Array.from({ length: { single: 1, ao5: 5, ao12: 12 }[row.metric] }, () => entry);
        await window.review.loadEvidence(row);
      }, change);
      await expect(page.locator('[data-approve]')).toBeDisabled();
    }
  });
