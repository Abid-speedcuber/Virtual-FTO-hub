import test from 'node:test';
import assert from 'node:assert/strict';
import { newlyBestAverages, validateAlbumEnvelope } from '../src/recording-album.js';
import { averageWindow } from '../src/solve-statistics.js';
test('only improving ao5 and ao12 windows pin recordings', () => {
  const times = Array.from({ length: 12 }, (_, i) => ({ ms: 1200 - i * 10 }));
  assert.deepEqual(newlyBestAverages(times.slice(0, 4), averageWindow), []);
  assert.deepEqual(newlyBestAverages(times.slice(0, 5), averageWindow), [5]);
  assert.deepEqual(newlyBestAverages(times, averageWindow), [5, 12]);
  const tied = Array.from({ length: 6 }, () => ({ ms: 1000 }));
  assert.deepEqual(newlyBestAverages(tied, averageWindow), []);
});
test('DNF attempts remain in average windows rather than being skipped', () => {
  assert.deepEqual(
    newlyBestAverages(
      [{ ms: 1, dnf: true }, { ms: 1, dnf: true }, { ms: 100 }, { ms: 110 }, { ms: 120 }],
      averageWindow,
    ),
    [],
  );
  assert.deepEqual(
    newlyBestAverages(
      [{ ms: 1, dnf: true }, { ms: 90 }, { ms: 100 }, { ms: 110 }, { ms: 120 }],
      averageWindow,
    ),
    [5],
  );
});
test('old album backups remain valid; malformed rolling-window metadata is rejected', () => {
  assert.doesNotThrow(() =>
    validateAlbumEnvelope({ format: 'fto-recording-album-v1', entries: [] }),
  );
  assert.throws(
    () =>
      validateAlbumEnvelope({
        format: 'fto-recording-album-v1',
        entries: [],
        windows: [{ size: 3, entries: Array(13).fill({ id: null, ms: 1, dnf: true }) }],
      }),
    /recent solve windows/,
  );
});
