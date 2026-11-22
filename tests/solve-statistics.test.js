import test from 'node:test';
import assert from 'node:assert/strict';
import { SolveTimer, averageOf5, formatTime } from '../src/solve-timer.js';
import {
  AVERAGE_SIZES,
  averageWindow,
  statistics,
  statisticsReport,
  statisticsCSV,
  scrambleText,
} from '../src/solve-statistics.js';
test('abandoning a started solve records one DNF, retains its scramble, and never changes PB', () => {
  let now = 0;
  const timer = new SolveTimer({}, () => now);
  assert.equal(timer.dnf(), false);
  timer.scramble();
  timer.arm();
  assert.equal(timer.dnf(), false);
  timer.scrambleText = 'U R';
  timer.start();
  now = 2500;
  timer.finish();
  const pb = timer.bestMs;
  timer.scramble();
  timer.arm();
  timer.scrambleText = "F U'";
  timer.start();
  now += 4000;
  timer.pause();
  now += 50000;
  assert.equal(timer.dnf(), true);
  assert.equal(timer.dnf(), false);
  assert.equal(timer.bestMs, pb);
  assert.equal(timer.times.length, 2);
  assert.equal(timer.times[1].ms, 4000);
  assert.equal(timer.times[1].dnf, true);
  assert.equal(timer.times[1].scramble, "F U'");
  assert.equal(timer.newBest, false);
  timer.times[1].comment = 'Interrupted';
  const loaded = new SolveTimer(JSON.parse(JSON.stringify(timer.serialize())));
  assert.deepEqual(loaded.times, timer.times);
  assert.equal(loaded.lastDnf, true);
});
test('csTimer averages trim ceil(5%) at each end and handle DNFs', () => {
  const times = [1000, 2000, 3000, 4000, 5000].map((ms) => ({ ms }));
  assert.equal(averageWindow(times, 5).value, 3000);
  times[4].dnf = true;
  assert.equal(averageWindow(times, 5).value, 3000);
  assert.equal(averageOf5(times), 3000);
  times[3].dnf = true;
  assert.equal(averageWindow(times, 5).value, Infinity);
  assert.equal(averageOf5(times), Infinity);
  assert.equal(formatTime(Infinity), 'DNF');
  for (const count of AVERAGE_SIZES) {
    const entries = Array.from({ length: count }, (_, i) => ({ ms: (i + 1) * 100 })),
      window = averageWindow(entries, count);
    assert.equal(window.trim, Math.ceil(count * 0.05));
    assert.equal(window.excluded.length, 2 * Math.ceil(count * 0.05));
    assert.equal(window.value, (count + 1) * 50);
    assert.equal(averageWindow(entries.slice(1), count), null);
  }
});
test('rolling current and PB averages match independently evaluated windows, including all DNF', () => {
  const times = Array.from({ length: 1050 }, (_, i) => ({
      ms: 1000 + ((i * 7919) % 21000),
      ...(i % 47 === 0 ? { dnf: true } : {}),
    })),
    rows = statistics(times);
  for (const row of rows.slice(1)) {
    const windows = [];
    for (let end = row.count; end <= times.length; end++)
      windows.push(averageWindow(times, row.count, end));
    assert.equal(row.current.value, windows.at(-1).value);
    assert.equal(row.best.value, Math.min(...windows.map((w) => w.value)));
    assert.equal(averageWindow(times, row.count, row.best.end).value, row.best.value);
  }
  assert.equal(
    statistics(Array.from({ length: 5 }, () => ({ ms: 1000, dnf: true })))[1].best.value,
    Infinity,
  );
});
test('reports mark trimmed solves, include comments, and omit scrambles when requested', () => {
  const times = Array.from({ length: 5 }, (_, i) => ({
      ms: (i + 1) * 1000,
      scramble: `U R${i}`,
      comment: i === 2 ? 'hello, "world"' : '',
    })),
    window = averageWindow(times, 5),
    report = statisticsReport(times, window, { date: new Date('2026-11-16') });
  assert.match(report, /avg of 5: 3.00/);
  assert.match(report, /1\. \(1.00\)/);
  assert.match(report, /5\. \(5.00\)/);
  assert.match(report, /U R2/);
  assert.match(report, /hello, "world"/);
  assert.doesNotMatch(statisticsReport(times, window, { scrambles: false }), /U R/);
  const csv = statisticsCSV(times, window, { scrambles: false });
  assert.doesNotMatch(csv, /Scramble|U R/);
  assert.match(csv, /hello, ""world""/);
  assert.equal(
    scrambleText([
      { name: 'U', dir: -1, layer: 'outer' },
      { name: 'BR', dir: 1, layer: 'slice', depth: 2, count: 1 },
      { name: 'F', dir: 1, depth: 1, count: 3 },
    ]),
    "U' 2BR 3Fw",
  );
});

test('reports without scrambles use a compact time list and exported windows number from one', () => {
  const times = Array.from({ length: 8 }, (_, i) => ({ ms: (i + 1) * 1000, scramble: 'U F' })),
    window = averageWindow(times, 5);
  const compact = statisticsReport(times, window, { scrambles: false });
  assert.match(compact, /Time List:\n\(4.00\), 5.00, 6.00, 7.00, \(8.00\)$/);
  assert.equal(compact.split('\n').length, 5);
  const detailed = statisticsReport(times, window);
  assert.match(detailed, /\n1\. \(4.00\)/);
  assert.match(detailed, /\n5\. \(8.00\)/);
  assert.doesNotMatch(detailed, /\n8\./);
  assert.match(statisticsCSV(times, window), /\r\n"1","4.00"/);
});

test('incremental statistics match the reference for appended ties and DNFs and reset on replacement', async () => {
  const { StatisticsCache } = await import('../src/solve-statistics.js');
  const cache = new StatisticsCache(),
    times = [];
  for (let i = 0; i < 1050; i++) {
    times.push({ ms: 1000 + ((i * 7919) % 31000), dnf: i % 19 === 0 });
    if ([0, 4, 11, 24, 99, 299, 999, 1049].includes(i))
      assert.deepEqual(cache.update(times).rows, statistics(times));
  }
  times.pop();
  assert.deepEqual(cache.update(times).rows, statistics(times));
  assert.deepEqual(cache.update(times.slice(-12)).rows, statistics(times.slice(-12)));
});
