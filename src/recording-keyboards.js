// References are internal only. Public recordings and backups always contain
// their own immutable keyboard snapshot, never the viewer's current settings.
const marker = '__ftoKeyboardSnapshot';
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
async function node(value, kind, nodes, refs) {
  const json = JSON.stringify(canonical({ kind, value, ...(refs ? { refs } : {}) }));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const id = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
  nodes.set(id, { id, kind, value, ...(refs ? { refs } : {}) });
  return { [marker]: id };
}
export async function internKeyboard(recording) {
  const record = structuredClone(recording),
    nodes = new Map();
  const keyboard = record?.initial?.keyboard;
  if (keyboard && typeof keyboard === 'object' && !Array.isArray(keyboard)) {
    const refs = {};
    for (const [index, mode] of (Array.isArray(keyboard.modes) ? keyboard.modes : []).entries())
      if (Array.isArray(mode?.bindings)) {
        mode.bindings = await node(mode.bindings, 'bindings', nodes);
        refs[index] = mode.bindings[marker];
      }
    record.initial.keyboard = await node(keyboard, 'config', nodes, refs);
  }
  return { record, nodes: [...nodes.values()] };
}
export function putKeyboards(store, nodes) {
  for (const row of nodes) {
    const get = store.getKey(row.id);
    get.onsuccess = () => {
      if (get.result === undefined) store.put(row);
    };
  }
}
export async function hydrateKeyboard(recording, read) {
  const record = structuredClone(recording);
  const reference = record?.initial?.keyboard?.[marker];
  if (reference) {
    const row = await read(reference);
    if (!row || row.kind !== 'config') throw Error('The recording keyboard snapshot is missing');
    const keyboard = structuredClone(row.value);
    // Older internal nodes predate the explicit reference map. New nodes
    // never interpret marker-shaped fields supplied by an imported recording.
    const refs =
      row.refs ??
      Object.fromEntries(
        (Array.isArray(keyboard.modes) ? keyboard.modes : []).flatMap((mode, i) =>
          mode?.bindings?.[marker] ? [[i, mode.bindings[marker]]] : [],
        ),
      );
    for (const [index, id] of Object.entries(refs)) {
      const bindings = await read(id);
      if (!bindings || bindings.kind !== 'bindings')
        throw Error('The recording keyboard snapshot is missing');
      keyboard.modes[index].bindings = structuredClone(bindings.value);
    }
    record.initial.keyboard = keyboard;
  }
  return record;
}
export function readKeyboard(db, name, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
