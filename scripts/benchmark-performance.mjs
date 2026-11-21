import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const args = process.argv.slice(2),
  option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const root = resolve(option('--root', '.')),
  port = Number(option('--port', '5187')),
  output = option('--output', '/tmp/fto-performance.json');
const server = spawn(
  process.execPath,
  [
    resolve('node_modules/vite/bin/vite.js'),
    root,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { stdio: 'pipe' },
);
let logs = '';
server.stderr.on('data', (data) => (logs += data));
server.stdout.on('data', (data) => (logs += data));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw Error('Benchmark server did not start: ' + logs);
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (message) => {
    if (message.type() === 'info') console.log(message.text());
  });
  await page.route('**/worker.js*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'self.onmessage=()=>{};' }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      'master-fto-settings-v1',
      JSON.stringify({ animate: false, follow: false, disableSounds: true }),
    ),
  );
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const results = await page.evaluate(async () => {
    const { PuzzleViewer } = await import('/src/puzzle-viewer.js'),
      { solvedState } = await import('/src/puzzle.js'),
      { defaultConfig } = await import('/src/keyboard-engine.js'),
      { ReplayKeyboard } = await import('/src/replay-keyboard.js'),
      { PhaseUI } = await import('/src/phase-ui.js');
    // Include Vite's version query so prototype counters use the live app's module.
    const source = await (await fetch('/src/main.js')).text(),
      threeURL = source.match(/import \* as THREE from ["']([^"']+)["']/)?.[1];
    if (!threeURL) throw Error('Could not locate the app Three.js module');
    const THREE = await import(threeURL);
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const measure = (run, repeats = 5) => {
      run();
      const times = [];
      for (let r = 0; r < repeats; r++) {
        const start = performance.now();
        run();
        times.push(performance.now() - start);
      }
      return { medianMs: median(times), samplesMs: times };
    };
    const results = {
      environment: {
        userAgent: navigator.userAgent,
        cpuThrottle: 4,
        dpr: devicePixelRatio,
        renderer: 'headless Chrome / SwiftShader',
        repeats: 5,
      },
    };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:400px';
    document.body.append(host);
    const move = { normal: [1, 1, 1], layer: 'outer', dir: 1, name: 'U' },
      view = { rotation: [0, 0, 0, 1], radius: 10 };
    for (const size of [3, 4, 8]) {
      const viewer = new PuzzleViewer(host),
        state = solvedState(size);
      viewer.resize();
      viewer.setPuzzle(size, state);
      let submissions = 0;
      const nativeRender = viewer.renderer.render.bind(viewer.renderer);
      viewer.renderer.render = (...args) => {
        submissions++;
        return nativeRender(...args);
      };
      const render = (single) => {
        for (let i = 0; i < 8; i++) {
          const motions = [{ move, progress: (i % 24) / 24 }];
          if (single && viewer.setFrame) viewer.setFrame(size, state, null, motions, view);
          else if (single) {
            const draw = viewer.draw;
            viewer.draw = () => {};
            viewer.setPuzzle(size, state, null, motions);
            viewer.setView(view);
            viewer.draw = draw;
            viewer.draw();
          } else {
            viewer.setPuzzle(size, state, null, motions);
            viewer.setView(view);
          }
        }
      };
      for (const single of [false, true]) {
        submissions = 0;
        const result = measure(() => render(single));
        results[`viewer${size}_${single ? 'single' : 'double'}`] = {
          ...result,
          framesPerRun: 8,
          rendersPerFrame: submissions / (6 * 8),
          drawCalls: viewer.renderer.info.render.calls,
        };
      }
      console.info(`Measured viewer ${size}`);
      viewer.dispose();
    }
    const data = {
      size: 3,
      duration: 10000,
      initial: { keyboard: defaultConfig(3) },
      events: [
        { at: 0, type: 'start' },
        { at: 100, type: 'key', edge: 'down', code: 'KeyF' },
        { at: 130, type: 'key', edge: 'up', code: 'KeyF' },
      ],
    };
    const board = document.createElement('div');
    board.style.width = '600px';
    host.append(board);
    const keyboard = new ReplayKeyboard(board, data);
    results.keyboardIdle = measure(() => {
      for (let i = 0; i < 60; i++) keyboard.render(200 + i * 16);
    });
    console.info('Measured keyboard');
    const tracker = {
      enabled: true,
      profile: {
        method: 'custom',
        phases: [
          { name: 'First', type: 'manual' },
          { name: 'Last', type: 'finish' },
        ],
      },
      groups: [],
      reference: null,
      complete: false,
    };
    const ui = Object.create(PhaseUI.prototype);
    ui.getSize = () => 3;
    ui.getConfig = () => ({ method: 'off' });
    results.splits = measure(() => {
      for (let i = 0; i < 60; i++) ui.render(tracker, i * 16, 'running', true);
    });
    host.remove();
    console.info('Measured splits');
    let disposals = 0,
      writes = 0,
      bytes = 0;
    const dispose = THREE.BufferGeometry.prototype.dispose,
      setItem = Storage.prototype.setItem;
    THREE.BufferGeometry.prototype.dispose = function () {
      disposals++;
      return dispose.call(this);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'master-fto-v1') {
        writes++;
        bytes += value.length;
      }
      return setItem.call(this, key, value);
    };
    const live = () => {
      for (let i = 0; i < 20; i++)
        for (const type of ['keydown', 'keyup'])
          window.dispatchEvent(
            new KeyboardEvent(type, {
              code: i % 2 ? 'KeyI' : 'KeyF',
              key: i % 2 ? 'i' : 'f',
              bubbles: true,
            }),
          );
    };
    results.liveMoves = measure(live);
    results.liveMoves.geometryDisposals = disposals;
    results.liveMoves.storageWrites = writes;
    results.liveMoves.serializedChars = bytes;
    results.liveMoves.movesPerRun = 20;
    THREE.BufferGeometry.prototype.dispose = dispose;
    Storage.prototype.setItem = setItem;
    console.info('Measured live moves');
    const { SolveRecorder } = await import('/src/solve-recording.js');
    let time = 0;
    const recorder = new SolveRecorder({}, () => time);
    recorder.arm({ size: 3, scramble: [], view, keyboard: defaultConfig(3) });
    recorder.event('start');
    for (let i = 0; i < 10000; i++) {
      time = i;
      recorder.event('pointer', {
        edge: i ? 'pointermove' : 'pointerdown',
        x: (i % 100) / 100,
        y: 0.5,
        pointerId: 1,
        pointerType: 'touch',
      });
    }
    time = 10000;
    // Seed the next document after the old page has flushed its own state.
    sessionStorage.setItem('benchmark-recording', JSON.stringify(recorder.finish(time, false)));
    window.dispatchEvent(new Event('pagehide'));
    return results;
  });
  await page.addInitScript(() => {
    const record = JSON.parse(sessionStorage.getItem('benchmark-recording'));
    const saved = JSON.parse(localStorage.getItem('master-fto-v1'));
    saved.solves[saved.size].recordings = { last: record };
    localStorage.setItem('master-fto-v1', JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForFunction(() => window.fto?.snapshot().ready);
  results.liveWithRecording = await page.evaluate(() => {
    const recording = window.fto.snapshot().recordings.last;
    if (recording?.events !== 10001) throw Error('Retained recording fixture was not loaded');
    const times = [];
    let writes = 0,
      bytes = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'master-fto-v1') {
        writes++;
        bytes += value.length;
      }
      return setItem.call(this, key, value);
    };
    for (let r = 0; r < 6; r++) {
      const start = performance.now();
      for (let i = 0; i < 20; i++)
        for (const type of ['keydown', 'keyup'])
          window.dispatchEvent(
            new KeyboardEvent(type, {
              code: i % 2 ? 'KeyI' : 'KeyF',
              key: i % 2 ? 'i' : 'f',
              bubbles: true,
            }),
          );
      if (r) times.push(performance.now() - start);
    }
    Storage.prototype.setItem = setItem;
    return {
      retainedEvents: recording.events,
      medianMs: [...times].sort((a, b) => a - b)[2],
      samplesMs: times,
      storageWrites: writes,
      serializedChars: bytes,
      movesPerRun: 20,
    };
  });
  await writeFile(output, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ output, results }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
