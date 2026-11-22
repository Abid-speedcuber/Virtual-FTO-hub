import {
  internKeyboard,
  hydrateKeyboard,
  putKeyboards,
  readKeyboard,
} from './recording-keyboards.js';
import { FACES, solvedState, applyMove, isSolved } from './puzzle.js';
export const LEGACY_KEY = 'master-fto-v1';
const JOURNAL_PREFIX = 'master-fto-journal-v2:';
const DATABASE = 'master-fto-solves-v2';
const TABLES = ['meta', 'puzzles', 'times', 'recordings', 'recovery', 'keyboards'];
const clone = (value) => structuredClone(value);
const requestValue = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const complete = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? Error('Save transaction failed'));
  });
const uuid = () => crypto.randomUUID();
export function recoverLegacy(raw) {
  const errors = [],
    solves = {};
  let saved;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    errors.push('The legacy save contains damaged JSON.');
  }
  let source = saved?.solves ?? (saved ? { 4: saved } : {});
  if (
    saved?.solves !== undefined &&
    (typeof saved.solves !== 'object' || Array.isArray(saved.solves) || !saved.solves)
  ) {
    errors.push('Invalid puzzle collection. Original data kept for recovery.');
    source = {};
  }
  for (const [key, value] of Object.entries(source)) {
    try {
      const n = Number(key),
        solve = clone(value);
      const valid = (m) =>
        m &&
        FACES.some((f) => f.normal.every((v, i) => v === m.normal?.[i])) &&
        ['outer', 'inner', 'wide', 'ultra', 'slice'].includes(m.layer) &&
        [1, -1].includes(m.dir) &&
        typeof m.name === 'string' &&
        (m.layer !== 'slice' ||
          (Number.isInteger(m.depth) &&
            m.depth >= 1 &&
            m.depth <= n &&
            Number.isInteger(m.count) &&
            m.count >= 1 &&
            m.depth + m.count <= n + 1));
      if (
        !Number.isInteger(n) ||
        n < 2 ||
        n > 20 ||
        !solve ||
        !Array.isArray(solve.history) ||
        !Array.isArray(solve.redo) ||
        !solve.history.every(valid) ||
        !solve.redo.every(valid) ||
        (solve.timer?.times !== undefined && !Array.isArray(solve.timer.times))
      )
        throw Error('Invalid puzzle history');
      if (
        solve.undoFloor !== undefined &&
        (!Number.isInteger(solve.undoFloor) ||
          solve.undoFloor < 0 ||
          solve.undoFloor > solve.history.length)
      )
        throw Error('Invalid scramble boundary');
      if (solve.undoFloor === undefined) {
        const timeline = [...solve.history, ...solve.redo.toReversed()];
        solve.undoFloor = ['scrambling', 'ready', 'running', 'paused', 'finished'].includes(
          solve.timer?.status,
        )
          ? Math.min(timeline.length, Math.max(50, n * 10))
          : 0;
        while (solve.history.length < solve.undoFloor) solve.history.push(solve.redo.pop());
      }
      if (solve.timer?.status === 'finished') {
        if (
          !Number.isInteger(solve.solveEnd) ||
          solve.solveEnd < 0 ||
          solve.solveEnd > solve.history.length
        ) {
          let state = solvedState(n);
          solve.solveEnd = solve.history.length;
          for (let i = 0; i < solve.history.length; i++) {
            state = applyMove(state, solve.history[i]);
            if (i + 1 >= solve.undoFloor && isSolved(state)) {
              solve.solveEnd = i + 1;
              break;
            }
          }
        }
        solve.undoFloor = Math.max(solve.undoFloor, solve.solveEnd);
      }
      if (
        solve.pending !== undefined &&
        (!Array.isArray(solve.pending) ||
          solve.pending.length > 600 ||
          !solve.pending.every(
            (a) =>
              a &&
              (['undo', 'redo'].includes(a.type) || (a.type === 'move' && valid(a.move))) &&
              (a.source === undefined || ['scramble', 'pointer'].includes(a.source)),
          ))
      )
        throw Error('Invalid pending moves');
      solves[n] = solve;
    } catch (error) {
      errors.push(`${key}×${key}: ${error.message}. Original data kept for recovery.`);
    }
  }
  const selected =
    Number.isInteger(saved?.size) && saved.size >= 2 && saved.size <= 20
      ? saved.size
      : saved && !saved.solves
        ? 4
        : 3;
  return {
    size: selected,
    solves,
    pointerMode: saved?.pointerMode === 'legacy' ? 'legacy' : 'swipe',
    errors,
  };
}
function checkpointOf(solve) {
  const { times: _times, ...timer } = solve.timer ?? {};
  const { last: _last, pb: _pb, pbIsLast: _same, ...recordings } = solve.recordings ?? {};
  return { ...solve, timer, recordings };
}
async function pack(original) {
  const { record, nodes } = await internKeyboard(original);
  if (!globalThis.CompressionStream) return { record: clone(record), nodes };
  const bytes = await new Response(
    new Blob([JSON.stringify(record)]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer();
  return { gzip: bytes, nodes };
}
async function unpack(row, db) {
  const record = row.gzip
    ? JSON.parse(
        await new Response(
          new Blob([row.gzip]).stream().pipeThrough(new DecompressionStream('gzip')),
        ).text(),
      )
    : row.record;
  return row.keyboardVersion === 1
    ? hydrateKeyboard(record, (id) => readKeyboard(db, 'keyboards', id))
    : record;
}
export class SolveStorage {
  constructor({
    storage = localStorage,
    database = indexedDB,
    onConflict = () => {},
    onError = () => {},
    getRecovery = () => null,
  } = {}) {
    Object.assign(this, { storage, database, onConflict, onError, getRecovery });
    this.writer = uuid();
    this.sequence = 0;
    this.chain = Promise.resolve();
    this.revisions = new Map();
    this.currentRefs = new Map();
    this.bindings = new Map();
    this.recordIDs = new WeakMap();
    this.known = new Set();
    this.edits = new Map();
    this.frozen = false;
  }
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const r = this.database.open(DATABASE, 2);
      r.onupgradeneeded = () => {
        for (const table of TABLES)
          if (!r.result.objectStoreNames.contains(table))
            r.result.createObjectStore(table, { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(Error('Close an older simulator tab to upgrade storage'));
    });
    this.db.onversionchange = () => {
      this.db.close();
      this.db = null;
      this.available = false;
      this.frozen = true;
      this.onConflict('The site storage was replaced or cleared. Reload before continuing.');
    };
    return this.db;
  }
  async migrateKeyboards() {
    if (
      await requestValue(this.db.transaction('meta').objectStore('meta').get('keyboard-format-v1'))
    )
      return;
    const keys = await requestValue(
      this.db.transaction('recordings').objectStore('recordings').getAllKeys(),
    );
    for (const id of keys) {
      const old = await requestValue(
        this.db.transaction('recordings').objectStore('recordings').get(id),
      );
      if (!old || old.keyboardVersion === 1) continue;
      const { nodes, ...packed } = await pack(await unpack(old, this.db));
      const tx = this.db.transaction(['recordings', 'keyboards'], 'readwrite');
      const get = tx.objectStore('recordings').get(id);
      get.onsuccess = () => {
        if (get.result && !get.result.keyboardVersion) {
          putKeyboards(tx.objectStore('keyboards'), nodes);
          tx.objectStore('recordings').put({ id, ...packed, keyboardVersion: 1 });
        }
      };
      await complete(tx);
    }
    const done = this.db.transaction('meta', 'readwrite');
    done.objectStore('meta').put({ id: 'keyboard-format-v1', migrated: true });
    await complete(done);
  }
  async holdWriterLocks() {
    if (!globalThis.navigator?.locks || this.releaseLocks) return;
    let ready;
    const acquired = new Promise((resolve) => {
      ready = resolve;
    });
    const held = new Promise((resolve) => {
      this.releaseLocks = resolve;
    });
    navigator.locks.request('fto-solves-writers', { mode: 'shared' }, () =>
      navigator.locks.request(`fto-solves-writer:${this.writer}`, async () => {
        ready();
        await held;
      }),
    );
    await acquired;
    globalThis.addEventListener?.('pagehide', () => this.releaseLocks?.(), { once: true });
    globalThis.addEventListener?.('pageshow', (event) => {
      if (event.persisted) {
        this.frozen = true;
        this.onConflict('Reload this restored tab before continuing to use the latest saved data.');
      }
    });
  }
  async collectUnusedRecordings() {
    // Only collect with exclusive access. Another live tab can still hold an
    // old PB in memory or a crash journal referring to that immutable row.
    if (!globalThis.navigator?.locks) return;
    await navigator.locks.request('fto-solves-writers', { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      const tx = this.db.transaction(['puzzles', 'recordings', 'recovery'], 'readwrite');
      const references = new Set(),
        key = (id) => JSON.stringify(id);
      let remaining = 2;
      const collect = () => {
        if (--remaining) return;
        const cursor = tx.objectStore('recordings').openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          if (!references.has(key(row.primaryKey))) row.delete();
          row.continue();
        };
      };
      const puzzles = tx.objectStore('puzzles').getAll();
      puzzles.onsuccess = () => {
        for (const row of puzzles.result)
          for (const id of [row.lastID, row.pbID]) if (id) references.add(key([...row.id, id]));
        collect();
      };
      const recovery = tx.objectStore('recovery').getAll();
      recovery.onsuccess = () => {
        for (const row of recovery.result)
          if (row.journal)
            for (const id of [row.journal.lastID, row.journal.pbID])
              if (id) references.add(key([row.journal.generation, row.journal.size, id]));
        collect();
      };
      // Unreadable journals are archived verbatim, so retain payloads until
      // their contents can be understood rather than guessing their references.
      for (let i = 0; i < this.storage.length; i++)
        if (this.storage.key(i).startsWith(JOURNAL_PREFIX)) {
          const aborted = complete(tx).catch(() => {});
          tx.abort();
          await aborted;
          return;
        }
      await complete(tx);
    });
  }
  async preserveImportBackup(backup, album) {
    await this.flush();
    const tx = this.db.transaction('recovery', 'readwrite');
    tx.objectStore('recovery').put({
      id: `pre-import:${uuid()}`,
      kind: 'pre-import',
      at: new Date().toISOString(),
      backup: {
        format: backup.format,
        createdAt: backup.createdAt,
        entries: backup.entries,
        ...(album ? { album } : {}),
      },
    });
    await complete(tx);
  }
  async root() {
    return requestValue(this.db.transaction('meta').objectStore('meta').get('root'));
  }
  async archiveLegacy(raw, reason) {
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const tx = this.db.transaction('recovery', 'readwrite');
    tx.objectStore('recovery').put({
      id: `legacy:${digest}`,
      kind: 'legacy',
      reason,
      source: raw,
      at: new Date().toISOString(),
    });
    await complete(tx);
  }
  async load(retry = 0) {
    let raw = null;
    try {
      raw = this.storage.getItem(LEGACY_KEY);
    } catch (error) {
      this.journalUnavailable = true;
      this.onError(error);
    }
    const legacy = recoverLegacy(raw);
    try {
      await this.open();
      await this.migrateKeyboards();
      let root = await this.root();
      if (!root) {
        await this.seed(legacy, { legacyRaw: raw });
        root = await this.root();
      }
      const origin = await requestValue(
        this.db.transaction('recovery').objectStore('recovery').get(`migration:${root.generation}`),
      );
      if (!root.verified) {
        const expected = origin?.source ? recoverLegacy(origin.source) : legacy;
        const verified = await this.document(root.generation);
        for (const [size, solve] of Object.entries(expected.solves)) {
          const recovered = verified.solves[size];
          if (
            JSON.stringify(solve.history) !== JSON.stringify(recovered?.history) ||
            JSON.stringify(solve.timer?.times ?? []) !==
              JSON.stringify(recovered?.timer?.times ?? [])
          )
            throw Error('Legacy migration could not be verified');
          for (const kind of ['last', 'pb']) {
            const original =
              kind === 'pb' && solve.recordings?.pbIsLast
                ? solve.recordings.last
                : solve.recordings?.[kind];
            const restored =
              kind === 'pb' && recovered.recordings?.pbIsLast
                ? recovered.recordings.last
                : recovered.recordings?.[kind];
            if (JSON.stringify(original ?? null) !== JSON.stringify(restored ?? null))
              throw Error('Recording migration could not be verified');
          }
        }
        const verification = this.db.transaction('meta', 'readwrite');
        const current = verification.objectStore('meta').get('root');
        current.onsuccess = () => {
          if (current.result?.generation === root.generation)
            verification.objectStore('meta').put({ ...current.result, verified: true });
          else verification.abort();
        };
        await complete(verification);
      }
      if (raw && origin?.source !== raw)
        await this.archiveLegacy(raw, 'Late legacy data preserved');
      this.generation = root.generation;
      if (!this.journalUnavailable) await this.replayJournals();
      const data = await this.document(this.generation, { observe: true });
      // The original bytes have been committed before removing the old key.
      if (raw && this.storage.getItem(LEGACY_KEY) === raw) this.storage.removeItem(LEGACY_KEY);
      await this.collectUnusedRecordings();
      await this.holdWriterLocks();
      this.available = true;
      return { ...data, errors: legacy.errors };
    } catch (error) {
      if (error.message === 'Storage changed during migration' && retry < 1)
        return this.load(retry + 1);
      this.available = false;
      this.error = error;
      this.onError(error);
      return legacy; // Never discard or overwrite the source after a failed migration.
    }
  }
  async seed(data, { legacyRaw = null, previous = null, recovery = [] } = {}) {
    const generation = uuid(),
      prepared = [];
    for (const [size, solve] of Object.entries(data.solves)) {
      const records = [],
        refs = {};
      for (const kind of ['last', 'pb']) {
        const value =
          kind === 'pb' && solve.recordings?.pbIsLast
            ? solve.recordings.last
            : solve.recordings?.[kind];
        if (!value) {
          refs[kind] = null;
          continue;
        }
        if (kind === 'pb' && value === solve.recordings.last) {
          refs.pb = refs.last;
          continue;
        }
        const id = uuid();
        refs[kind] = id;
        records.push({ id: [generation, +size, id], ...(await pack(value)) });
      }
      prepared.push({ size: +size, solve, records, refs });
    }
    const existingRecovery = await requestValue(
      this.db.transaction('recovery').objectStore('recovery').getAll(),
    );
    recovery = recovery.map((row) => {
      const previous = existingRecovery.find((old) => old.id === row.id);
      return previous && JSON.stringify(previous) !== JSON.stringify(row)
        ? { ...row, id: `import:${uuid()}` }
        : row;
    });
    const tx = this.db.transaction(TABLES, 'readwrite');
    const get = tx.objectStore('meta').get('root');
    let failure;
    get.onsuccess = () => {
      if (
        (previous && get.result?.generation !== previous.generation) ||
        (!previous && get.result)
      ) {
        failure = Error('Storage changed during migration');
        tx.abort();
        return;
      }
      for (const { size, solve, records, refs } of prepared) {
        tx.objectStore('puzzles').put({
          id: [generation, size],
          revision: 0,
          checkpoint: checkpointOf(solve),
          timeCount: solve.timer?.times?.length ?? 0,
          lastID: refs.last,
          pbID: refs.pb,
        });
        for (const [index, entry] of (solve.timer?.times ?? []).entries())
          tx.objectStore('times').put({ id: [generation, size, index], entry });
        for (const { nodes, ...record } of records) {
          putKeyboards(tx.objectStore('keyboards'), nodes);
          tx.objectStore('recordings').put({ ...record, keyboardVersion: 1 });
        }
      }
      if (legacyRaw)
        tx.objectStore('recovery').put({
          id: `migration:${generation}`,
          kind: 'legacy',
          source: legacyRaw,
          entries: Object.fromEntries(
            Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i))
              .filter(
                (key) =>
                  key.startsWith('master-fto-') &&
                  key !== LEGACY_KEY &&
                  !key.startsWith(JOURNAL_PREFIX),
              )
              .map((key) => [key, this.storage.getItem(key)]),
          ),
          reason: 'Original legacy save',
          at: new Date().toISOString(),
        });
      if (previous)
        tx.objectStore('recovery').put({
          id: `generation:${previous.generation}`,
          kind: 'generation',
          root: previous,
          reason: 'Data before backup restore',
          at: new Date().toISOString(),
        });
      for (const row of recovery) tx.objectStore('recovery').put(row);
      tx.objectStore('meta').put({
        id: 'root',
        generation,
        size: data.size,
        pointerMode: data.pointerMode ?? 'swipe',
        verified: false,
      });
    };
    try {
      await complete(tx);
    } catch (error) {
      throw failure ?? error;
    }
    return generation;
  }
  async document(generation = this.generation, { observe = false, onlySize = null } = {}) {
    const tx = this.db.transaction(['meta', 'puzzles', 'times']);
    const [root, puzzles, times] = await Promise.all([
      requestValue(tx.objectStore('meta').get('root')),
      requestValue(
        tx
          .objectStore('puzzles')
          .getAll(IDBKeyRange.bound([generation, onlySize ?? 2], [generation, onlySize ?? 20])),
      ),
      requestValue(
        tx
          .objectStore('times')
          .getAll(
            IDBKeyRange.bound(
              [generation, onlySize ?? 2, 0],
              [generation, onlySize ?? 20, Number.MAX_SAFE_INTEGER],
            ),
          ),
      ),
    ]);
    const recordTx = this.db.transaction('recordings');
    const requests = [];
    for (const row of puzzles)
      for (const id of new Set([row.lastID, row.pbID].filter(Boolean)))
        requests.push(
          requestValue(recordTx.objectStore('recordings').get([generation, row.id[1], id])),
        );
    const records = (await Promise.all(requests)).filter(Boolean);
    const decoded = new Map();
    for (const row of puzzles)
      for (const id of [row.lastID, row.pbID])
        if (id && !decoded.has(id)) {
          const record = records.find(
            (record) => record.id[1] === row.id[1] && record.id[2] === id,
          );
          if (record) {
            const value = await unpack(record, this.db);
            decoded.set(id, value);
            this.recordIDs.set(value, id);
            this.known.add(id);
          }
        }
    const solves = {};
    for (const row of puzzles) {
      const size = row.id[1],
        last = decoded.get(row.lastID) ?? null,
        pb = decoded.get(row.pbID) ?? null;
      solves[size] = {
        ...row.checkpoint,
        timer: {
          ...row.checkpoint.timer,
          times: times
            .filter((t) => t.id[1] === size && t.id[2] < row.timeCount)
            .map((t) => t.entry),
        },
        recordings: {
          ...row.checkpoint.recordings,
          last,
          ...(pb && pb === last ? { pbIsLast: true } : { pb }),
        },
      };
      if (observe) {
        this.revisions.set(size, row.revision);
        this.currentRefs.set(size, { last: row.lastID, pb: row.pbID });
      }
    }
    return { size: root.size, pointerMode: root.pointerMode, solves };
  }
  async readSize(size) {
    return (await this.document(this.generation, { onlySize: size, observe: true })).solves[size];
  }
  bind(size, { times, last, pb }) {
    const refs = this.currentRefs.get(size);
    for (const [kind, record] of Object.entries({ last, pb }))
      if (record && refs?.[kind]) {
        this.recordIDs.set(record, refs[kind]);
        this.known.add(refs[kind]);
      }
    this.bindings.set(size, { times, count: times.length, last, pb });
  }
  edit(size, index) {
    if (!this.edits.has(size)) this.edits.set(size, new Set());
    this.edits.get(size).add(index);
  }
  save(size, checkpoint, { times, last, pb }, pointerMode) {
    if (this.frozen) return false;
    const binding = this.bindings.get(size) ?? { count: 0 },
      entries = [];
    for (let i = binding.count; i < times.length; i++)
      entries.push({ index: i, entry: clone(times[i]) });
    for (const index of this.edits.get(size) ?? [])
      if (times[index]) entries.push({ index, entry: clone(times[index]) });
    const records = [],
      refs = {};
    for (const [kind, record] of Object.entries({ last, pb })) {
      if (!record) {
        refs[kind] = null;
        continue;
      }
      let id = this.recordIDs.get(record);
      if (!id) {
        id = uuid();
        this.recordIDs.set(record, id);
      }
      refs[kind] = id;
      if (!this.known.has(id) && !records.some((r) => r.key === id))
        records.push({ key: id, record: clone(record) });
    }
    const journal = {
      id: uuid(),
      writer: this.writer,
      sequence: ++this.sequence,
      generation: this.generation,
      size,
      base: this.revisions.get(size) ?? 0,
      checkpoint: clone(checkpoint),
      entries,
      timeCount: times.length,
      records,
      lastID: refs.last,
      pbID: refs.pb,
      pointerMode,
      at: new Date().toISOString(),
    };
    let journalError;
    try {
      this.storage.setItem(JOURNAL_PREFIX + this.writer, JSON.stringify(journal));
    } catch (error) {
      journalError = error;
      this.onError(error);
    }
    if (!this.available) throw this.error ?? Error('Transactional storage unavailable');
    this.chain = this.chain
      .then(async () => {
        if (this.frozen) return;
        journal.base = this.revisions.get(size) ?? 0;
        const ok = await this.commit(journal);
        if (!ok) return;
        this.bindings.set(size, {
          times,
          count: Math.max(this.bindings.get(size)?.count ?? 0, journal.timeCount),
          last,
          pb,
        });
        for (const row of records) this.known.add(row.key);
        for (const { index } of entries) this.edits.get(size)?.delete(index);
        const current = this.storage.getItem(JOURNAL_PREFIX + this.writer);
        if (current && JSON.parse(current).id === journal.id)
          this.storage.removeItem(JOURNAL_PREFIX + this.writer);
      })
      .catch((error) => {
        this.error = error;
        this.onError(error);
      });
    return !journalError;
  }
  async commit(journal, { replaying = false } = {}) {
    const packed = await Promise.all(
      journal.records.map(async (row) => ({
        id: [journal.generation, journal.size, row.key],
        ...(await pack(row.record)),
      })),
    );
    const tx = this.db.transaction(TABLES, 'readwrite'),
      puzzles = tx.objectStore('puzzles');
    const root = tx.objectStore('meta').get('root'),
      current = puzzles.get([journal.generation, journal.size]);
    let ready = 0,
      conflict = false,
      committedRevision;
    const apply = () => {
      if (++ready < 2) return;
      if (
        root.result?.generation !== journal.generation ||
        ((current.result?.revision ?? 0) !== journal.base &&
          !(
            current.result?.writer === journal.writer && current.result.sequence < journal.sequence
          ))
      ) {
        conflict = true;
        if (!replaying) {
          this.frozen = true;
          this.onConflict(
            'This puzzle changed in another tab. Your work has been preserved; reload to use the latest saved data.',
          );
        }
        const live = !replaying ? this.getRecovery() : null;
        const recovery = tx.objectStore('recovery'),
          existing = recovery.get(`conflict:${journal.id}`);
        existing.onsuccess = () => {
          if (!existing.result)
            recovery.put({
              id: `conflict:${journal.id}`,
              kind: 'conflict',
              journal,
              ...(live ? { document: clone(live) } : {}),
              reason: 'Concurrent tab changes',
              at: journal.at,
            });
        };
        return;
      }
      for (const { nodes, ...row } of packed) {
        putKeyboards(tx.objectStore('keyboards'), nodes);
        tx.objectStore('recordings').put({ ...row, keyboardVersion: 1 });
      }
      for (const { index, entry } of journal.entries)
        tx.objectStore('times').put({ id: [journal.generation, journal.size, index], entry });
      committedRevision = (current.result?.revision ?? 0) + 1;
      puzzles.put({
        id: [journal.generation, journal.size],
        revision: committedRevision,
        writer: journal.writer,
        sequence: journal.sequence,
        checkpoint: journal.checkpoint,
        timeCount: journal.timeCount,
        lastID: journal.lastID,
        pbID: journal.pbID,
      });
      tx.objectStore('meta').put({
        ...root.result,
        size: journal.size,
        pointerMode: journal.pointerMode,
      });
    };
    root.onsuccess = apply;
    current.onsuccess = apply;
    await complete(tx);
    if (!conflict) this.revisions.set(journal.size, committedRevision);
    return !conflict;
  }
  async replayJournals() {
    const keys = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key.startsWith(JOURNAL_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const replay = async () => {
        const raw = this.storage.getItem(key);
        try {
          const journal = JSON.parse(raw);
          // A committed journal left behind by a closed page is already durable.
          const tx = this.db.transaction('puzzles'),
            row = await requestValue(
              tx.objectStore('puzzles').get([journal.generation, journal.size]),
            );
          if (!(row?.writer === journal.writer && row.sequence >= journal.sequence))
            await this.commit(journal, { replaying: true });
          if (this.storage.getItem(key) === raw) this.storage.removeItem(key);
        } catch (error) {
          await this.archiveLegacy(raw, `Unreadable recovery journal: ${error.message}`);
        }
      };
      if (globalThis.navigator?.locks)
        await navigator.locks.request(
          `fto-solves-writer:${key.slice(JOURNAL_PREFIX.length)}`,
          { ifAvailable: true },
          (lock) => (lock ? replay() : undefined),
        );
      else await replay();
    }
  }
  async flush() {
    await this.chain;
    if (this.error) throw this.error;
  }
  async recoveries({ flush = true } = {}) {
    if (flush) await this.flush();
    return requestValue(this.db.transaction('recovery').objectStore('recovery').getAll());
  }
  async recoveryData(options) {
    const rows = await this.recoveries(options);
    for (const row of rows) {
      let document = row.document;
      if (row.kind === 'generation')
        document = {
          ...(await this.document(row.root.generation)),
          size: row.root.size,
          pointerMode: row.root.pointerMode,
        };
      if (!document && row.kind === 'conflict') {
        const j = row.journal;
        document = await this.document(j.generation);
        const times = (document.solves[j.size]?.timer?.times ?? []).slice(0, j.timeCount);
        for (const { index, entry } of j.entries) times[index] = entry;
        const completed = {};
        for (const [kind, id] of Object.entries({ last: j.lastID, pb: j.pbID })) {
          const inline = j.records.find((r) => r.key === id)?.record;
          const saved =
            id && !inline
              ? await requestValue(
                  this.db
                    .transaction('recordings')
                    .objectStore('recordings')
                    .get([j.generation, j.size, id]),
                )
              : null;
          completed[kind] = inline ?? (saved ? await unpack(saved, this.db) : null);
        }
        document.solves[j.size] = {
          ...j.checkpoint,
          timer: { ...j.checkpoint.timer, times },
          recordings: { ...j.checkpoint.recordings, ...completed },
        };
        document.size = j.size;
      }
      if (document || row.source)
        row.backup = {
          format: 'fto-user-data-v1',
          createdAt: row.at,
          entries: {
            ...(row.entries ?? row.root?.entries ?? {}),
            [LEGACY_KEY]: row.source ?? JSON.stringify(document),
          },
        };
    }
    return rows;
  }

  async restore(data, recovery = [], previousEntries = {}) {
    await this.flush();
    const previous = { ...(await this.root()), entries: previousEntries };
    const generation = await this.seed(data, {
      previous,
      recovery,
      legacyRaw: JSON.stringify(data),
    });
    this.generation = generation;
    this.frozen = true;
    return previous;
  }
  async rollbackRestore(previous) {
    const tx = this.db.transaction('meta', 'readwrite'),
      get = tx.objectStore('meta').get('root');
    get.onsuccess = () => {
      if (get.result?.generation === this.generation) {
        const { entries: _entries, ...root } = previous;
        tx.objectStore('meta').put(root);
      } else tx.abort();
    };
    await complete(tx);
    this.generation = previous.generation;
    this.frozen = false;
  }
}
