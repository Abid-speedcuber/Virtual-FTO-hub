import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FACES } from '../src/puzzle.js';
import {
  FRAMES,
  frameForRotationPair,
  snappedViewRotation,
  frameForCamera,
  transformedNormal,
} from '../src/orientation.js';
import {
  ROTATION_PAIRS,
  validRotationPair,
  normalizeActionSearch,
  rotationPairForMove,
} from '../src/rotation-actions.js';
import { defaultConfig, validateConfig, KeyboardEngine } from '../src/keyboard-engine.js';
import { bindingCatalog } from '../src/binding-catalog.js';

test('all 47 face-pair rotations reach the requested hold from every CIF and EIF frame', () => {
  assert.equal(ROTATION_PAIRS.length, 47);
  for (const start of FRAMES) {
    const reached = new Set();
    for (const pair of ROTATION_PAIRS) {
      const target = frameForRotationPair(start, pair);
      assert.ok(target);
      reached.add(`${target.up},${target.front}`);
      const camera = new THREE.PerspectiveCamera();
      camera.quaternion.copy(snappedViewRotation(target).invert());
      assert.equal(frameForCamera(camera), target);
      for (const [i, name] of pair.entries())
        assert.deepEqual(
          target.normals[i ? 2 : 0],
          transformedNormal(FACES.find((f) => f.name === name).normal, start),
        );
    }
    assert.equal(reached.size, 47);
    assert.ok(!reached.has(`${start.up},${start.front}`));
  }
});

test('pair bindings survive JSON, validate, and resolve correctly', () => {
  const config = defaultConfig(4);
  config.modes[0].bindings = [
    {
      id: 'pair',
      trigger: 'F8',
      action: { type: 'rotate', face: 'F', dir: 1, kind: 'outer', depth: 1, pair: ['F', 'D'] },
    },
  ];
  const restored = JSON.parse(JSON.stringify(config));
  validateConfig(restored);
  const engine = new KeyboardEngine(restored);
  assert.deepEqual(engine.resolve(restored.modes[0].bindings[0].action, { size: 4 }).pair, [
    'F',
    'D',
  ]);
  for (const pair of [['U', 'D'], ['R', 'R'], ['U'], ['X', 'F'], null]) {
    assert.equal(validRotationPair(pair), false);
    restored.modes[0].bindings[0].action.pair = pair;
    assert.throws(() => validateConfig(restored));
  }
});

test('the default catalog exposes T, all explicit pairs, and searchable legacy aliases', () => {
  const rows = bindingCatalog(4, defaultConfig(4));
  assert.equal(rows.filter((r) => r.action.pair).length, 47);
  assert.equal(rows.filter((r) => r.category === 'rotations' && r.action.vertex).length, 2);
  const half = rows.find(
    (r) => r.action.angle === 60 && r.action.face === 'U' && r.action.dir === 1,
  );
  assert.ok(normalizeActionSearch(half.detail).includes(normalizeActionSearch('{U, R}')));
  const t = rows.find((r) => r.action.vertex && r.action.dir === 1);
  assert.ok(t.detail.includes('{L,R}'));
});

test('T and T prime use the requested face pairs in all EIF holds and retain CIF axes', () => {
  for (const frame of FRAMES)
    for (const dir of [1, -1]) {
      const pair = rotationPairForMove({ vertex: true, dir }, frame.notation);
      if (frame.notation === 'CIF') {
        assert.equal(pair, null);
        continue;
      }
      assert.deepEqual(pair, dir === 1 ? ['BL', 'L'] : ['BR', 'R']);
      const target = frameForRotationPair(frame, pair);
      pair.forEach((face, i) =>
        assert.deepEqual(
          target.normals[i ? 2 : 0],
          transformedNormal(FACES.find((f) => f.name === face).normal, frame),
        ),
      );
    }
  const rows = bindingCatalog(3, defaultConfig(3)).filter((row) => row.action.vertex);
  assert.match(rows.find((row) => row.action.dir === 1).detail, /\{BL,L\} in EIF/);
  assert.match(rows.find((row) => row.action.dir === -1).detail, /\{BR,R\} in EIF/);
  assert.deepEqual(rotationPairForMove({ vertex: true, dir: 1, pair: ['F', 'D'] }, 'EIF'), [
    'F',
    'D',
  ]);
});
