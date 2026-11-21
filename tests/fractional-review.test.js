import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceTimeMatches } from '../src/solve-review.js';
test('admin review accepts the real fractional 22.40 time after PostgreSQL JSON rounding', () => {
  assert.equal(evidenceTimeMatches(22400.40000000596, 22400.400000006), true);
  assert.equal(evidenceTimeMatches(37664.29999999702, 37664.299999997), true);
});
test('review time tolerance rejects missing, nonfinite and actually altered durations', () => {
  for (const claimed of [null, undefined, NaN, Infinity, 0, -1, 22400.401])
    assert.equal(evidenceTimeMatches(22400.40000000596, claimed), false);
  assert.equal(evidenceTimeMatches(null, 22400.4), false);
});
