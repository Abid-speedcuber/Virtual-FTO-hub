import { test, expect } from './fixtures.js';
import { waitForApp } from './helpers.js';
import { SolveRecorder } from '../../src/solve-recording.js';
import { defaultConfig } from '../../src/keyboard-engine.js';
import { encodeRecording } from '../../src/recording-codec.js';

function recording() {
  let now = 0;
  const recorder = new SolveRecorder({}, () => now),
    move = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' };
  recorder.arm({
    size: 3,
    scramble: [move],
    keyboard: defaultConfig(3),
    view: { rotation: [0, 0, 0, 1], radius: 10 },
    colors: {},
  });
  recorder.event('start');
  now = 100;
  recorder.event('key', { edge: 'down', code: 'KeyF' });
  recorder.event('accept', { id: 1, action: 'move', source: 'keyboard' });
  now = 300;
  recorder.event('key', { edge: 'up', code: 'KeyF' });
  now = 60000;
  recorder.event('turn', { id: 1, move: { ...move, dir: -1 } });
  return recorder.finish(60000, true);
}
async function expectAutoplay(page) {
  await waitForApp(page);
  await expect(page.locator('#home-replay-play')).toHaveAttribute('aria-label', 'Pause recording');
  await expect.poll(() => page.evaluate(() => window.fto.snapshot().replay?.playing)).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.fto.snapshot().replay?.at ?? 0))
    .toBeGreaterThan(0);
}

test('full recording links autoplay on initial navigation and still pause normally', async ({
  page,
}) => {
  await page.goto('/#replay=' + (await encodeRecording(recording())));
  await expectAutoplay(page);
  await page.locator('#home-replay-play').click();
  await expect(page.locator('#home-replay-play')).toHaveAttribute('aria-label', 'Play recording');
  expect(await page.evaluate(() => window.fto.snapshot().replay.playing)).toBe(false);
});

test('full recording links autoplay on fragment navigation', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.evaluate(
    (payload) => {
      location.hash = 'replay=' + payload;
    },
    await encodeRecording(recording()),
  );
  await expectAutoplay(page);
});

for (const kind of ['short', 'rank'])
  test(`${kind} recording links autoplay after retrieval`, async ({ page }) => {
    const data = recording();
    await page.route('**/shared/account.js*', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export const configured=false, profile=null, ready=Promise.resolve();
      export const mountAccount=()=>{}, onAccountChange=()=>{}, openAccount=()=>{};
      export async function rpc(name,args){
        (window.cloudRequests??=[]).push({name,args});
        if(name==='get_short_link'||name==='public_replay')return ${JSON.stringify(data)};
        return [];
      }`,
      }),
    );
    await page.goto('/#' + kind + '=example');
    await expectAutoplay(page);
    expect(await page.evaluate(() => window.cloudRequests)).toContainEqual({
      name: kind === 'short' ? 'get_short_link' : 'public_replay',
      args: kind === 'short' ? { code: 'example' } : { submission: 'example' },
    });
  });

test('manual imports keep their existing paused start', async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
  await page.locator('#album').click();
  await page.locator('#album-import-recording').click();
  await page.locator('#recording-paste').fill(JSON.stringify(recording()));
  await page.locator('#recording-paste-load').click();
  await expect(page.locator('#home-replay-view canvas')).toBeVisible();
  await expect(page.locator('#home-replay-play')).toHaveAttribute('aria-label', 'Play recording');
  expect(await page.evaluate(() => window.fto.snapshot().replay.playing)).toBe(false);
});
