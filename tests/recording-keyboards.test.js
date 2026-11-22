import test from 'node:test';
import assert from 'node:assert/strict';
import { internKeyboard, hydrateKeyboard } from '../src/recording-keyboards.js';
import { defaultConfig } from '../src/keyboard-engine.js';
test('immutable keyboard snapshots deduplicate binding arrays, preserving old layouts and independent mode preferences', async () => {
  const original = { initial: { keyboard: defaultConfig(3) }, events: [] };
  const first = await internKeyboard(original),
    second = await internKeyboard(original);
  assert.deepEqual(first, second);
  const changed = structuredClone(original);
  changed.initial.keyboard.modes[0].bindings[0].code = 'KeyZ';
  const later = await internKeyboard(changed);
  const rows = new Map(
    [...first.nodes, ...second.nodes, ...later.nodes].map((row) => [row.id, row]),
  );
  assert.deepEqual(await hydrateKeyboard(first.record, (id) => rows.get(id)), original);
  assert.deepEqual(await hydrateKeyboard(later.record, (id) => rows.get(id)), changed);
  assert.ok(rows.size < first.nodes.length + later.nodes.length);
  original.initial.keyboard.modes[0].bindings[0].code = 'KeyX';
  assert.notEqual(
    (await hydrateKeyboard(first.record, (id) => rows.get(id))).initial.keyboard.modes[0]
      .bindings[0].code,
    'KeyX',
  );
  await assert.rejects(
    hydrateKeyboard(first.record, () => null),
    /snapshot is missing/,
  );
});

test('literal marker-shaped legacy fields stay literal and never select another stored layout', async () => {
  const raw = {
    initial: {
      keyboard: {
        __ftoKeyboardSnapshot: 'literal',
        modes: [{ bindings: { __ftoKeyboardSnapshot: 'also-literal' } }],
      },
    },
  };
  const { record, nodes } = await internKeyboard(raw);
  const rows = new Map(nodes.map((row) => [row.id, row]));
  assert.deepEqual(await hydrateKeyboard(record, (id) => rows.get(id)), raw);
});
