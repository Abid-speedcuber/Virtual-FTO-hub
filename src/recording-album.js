import {
  internKeyboard,
  hydrateKeyboard,
  putKeyboards,
  readKeyboard,
} from './recording-keyboards.js';
import { statisticsCache } from './solve-statistics.js';
import { AVERAGE_FORMAT, validateAverage, averageID, makeAverage } from './recording-average.js';
import { encodeRecording, decodeRecording, recordingID } from './recording-codec.js';
export const ALBUM_FORMAT = 'fto-recording-album-v1';
const metadata = ({ payload: _payload, nodes: _nodes, ...entry }) => entry;
export function newlyBestAverages(times) {
  return statisticsCache(times)
    .rows.filter(
      (row) =>
        [5, 12].includes(row.count) &&
        row.best?.end === times.length &&
        Number.isFinite(row.best.value),
    )
    .map((row) => row.count);
}
const metadataStore = 'recording-metadata';
const keyboardStore = 'keyboard-snapshots';
function albumTransaction(db, names, mode) {
  names = typeof names === 'string' ? [names] : [...names];
  if (mode === 'readwrite' && names.includes('recordings'))
    names.push(metadataStore, keyboardStore);
  return db.transaction(names, mode);
}
function putRecording(store, { nodes = [], ...row }) {
  putKeyboards(store.transaction.objectStore(keyboardStore), nodes);
  store.put(row);
  store.transaction.objectStore(metadataStore).put(metadata(row));
}
function deleteRecording(store, id) {
  store.delete(id);
  store.transaction.objectStore(metadataStore).delete(id);
}
const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function validateAlbumEnvelope(data) {
  if (
    !data ||
    data.format !== ALBUM_FORMAT ||
    !Array.isArray(data.entries) ||
    data.entries.length > 20000
  )
    throw Error('Invalid recording album');
  if (data.deleted !== undefined && (!Array.isArray(data.deleted) || data.deleted.length > 20000))
    throw Error('Invalid deleted album entries');
  if (
    data.windows !== undefined &&
    (!Array.isArray(data.windows) ||
      data.windows.length > 3 ||
      new Set(data.windows.map((w) => w?.size)).size !== data.windows.length ||
      data.windows.some(
        (w) =>
          ![2, 3, 4].includes(w?.size) ||
          !Array.isArray(w.entries) ||
          w.entries.length > 12 ||
          w.entries.some(
            (e) =>
              !e ||
              !Number.isFinite(e.ms) ||
              e.ms < 0 ||
              typeof e.dnf !== 'boolean' ||
              (e.id !== null && !/^r-[a-f0-9]{64}$/.test(e.id)),
          ),
      ))
  )
    throw Error('Invalid recent solve windows');
  const ids = new Set();
  for (const row of data.entries) {
    if (
      !row ||
      !/^r-[a-f0-9]{64}$/.test(row.id) ||
      ids.has(row.id) ||
      ![2, 3, 4].includes(row.size) ||
      !Number.isFinite(row.solveMs) ||
      row.solveMs < 0 ||
      typeof row.pb !== 'boolean' ||
      !validDate(row.completedAt) ||
      !validDate(row.savedAt) ||
      typeof row.payload !== 'string'
    )
      throw Error('Invalid album entry');
    if (row.dnf !== undefined && typeof row.dnf !== 'boolean')
      throw Error('Invalid recording result');
    if (
      (row.manual !== undefined && typeof row.manual !== 'boolean') ||
      (row.recent !== undefined && typeof row.recent !== 'boolean') ||
      (row.averagePB !== undefined &&
        (!Array.isArray(row.averagePB) ||
          row.averagePB.some((n) => ![5, 12].includes(n)) ||
          new Set(row.averagePB).size !== row.averagePB.length))
    )
      throw Error('Invalid recording retention flags');
    ids.add(row.id);
  }
  const groupIDs = new Set();
  if (data.groups !== undefined && (!Array.isArray(data.groups) || data.groups.length > 2000))
    throw Error('Invalid saved averages');
  const recordings = new Map(data.entries.map((row) => [row.id, row]));
  for (const group of data.groups ?? []) {
    validateAverage(group);
    if (groupIDs.has(group.id)) throw Error('Duplicate saved average');
    groupIDs.add(group.id);
    for (const member of group.members) {
      if (!member.id) continue;
      const row = recordings.get(member.id);
      if (!row || row.size !== group.size || (!member.dnf && row.solveMs !== member.ms))
        throw Error('Average recording is missing or does not match');
    }
  }
  const deleted = new Set();
  for (const row of data.deleted ?? []) {
    if (
      !row ||
      !/^r-[a-f0-9]{64}$/.test(row.id) ||
      ids.has(row.id) ||
      deleted.has(row.id) ||
      !validDate(row.deletedAt) ||
      typeof row.pb !== 'boolean'
    )
      throw Error('Invalid deleted album entry');
    deleted.add(row.id);
  }
  return data;
}
export async function validateAlbumBackup(data) {
  validateAlbumEnvelope(data);
  for (let i = 0; i < data.entries.length; i += 4)
    await Promise.all(
      data.entries.slice(i, i + 4).map(async (row) => {
        const recording = await decodeRecording(row.payload);
        if (
          recording.size !== row.size ||
          recording.solveMs !== row.solveMs ||
          !!recording.dnf !== !!row.dnf ||
          (await recordingID(recording)) !== row.id
        )
          throw Error('Album entry does not match its recording');
      }),
    );
  for (const group of data.groups ?? [])
    if ((await averageID(group)) !== group.id)
      throw Error('Average identity does not match its members');
  return data;
}
export class RecordingAlbum extends EventTarget {
  constructor(database = globalThis.indexedDB) {
    super();
    this.database = database;
    this.opened = null;
    this.pending = new Set();
    this.retentionChain = Promise.resolve();
  }
  open() {
    if (!this.database) return Promise.reject(Error('Recording album storage is unavailable'));
    return (this.opened ??= new Promise((resolve, reject) => {
      const request = this.database.open('master-fto-album-v1', 6);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(keyboardStore))
          request.result.createObjectStore(keyboardStore, { keyPath: 'id' });
        if (!request.result.objectStoreNames.contains(metadataStore)) {
          const summaries = request.result.createObjectStore(metadataStore, { keyPath: 'id' });
          if (request.result.objectStoreNames.contains('recordings')) {
            const cursor = request.transaction.objectStore('recordings').openCursor();
            cursor.onsuccess = () => {
              if (cursor.result) {
                summaries.put(metadata(cursor.result.value));
                cursor.result.continue();
              }
            };
          }
        }

        if (!request.result.objectStoreNames.contains('average-groups'))
          request.result.createObjectStore('average-groups', { keyPath: 'id' });
        if (!request.result.objectStoreNames.contains('solve-windows'))
          request.result.createObjectStore('solve-windows', { keyPath: 'size' });
        if (!request.result.objectStoreNames.contains('recordings'))
          request.result.createObjectStore('recordings', { keyPath: 'id' });
        if (!request.result.objectStoreNames.contains('deleted-recordings'))
          request.result.createObjectStore('deleted-recordings', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.opened = null;
        };
        this.migrateKeyboards(db).then(() => resolve(db), reject);
      };
      request.onerror = () => {
        this.opened = null;
        reject(request.error ?? Error('Could not open recording album'));
      };
    }));
  }
  async localPayload(recording) {
    const { record, nodes } = await internKeyboard(recording);
    const payload = await new Response(
      new Blob([JSON.stringify(record)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer();
    return { payload, payloadFormat: 'keyboard-v1', nodes };
  }
  async decodeLocal(row, db) {
    if (row.payloadFormat !== 'keyboard-v1') return decodeRecording(row.payload);
    const record = JSON.parse(
      await new Response(
        new Blob([row.payload]).stream().pipeThrough(new DecompressionStream('gzip')),
      ).text(),
    );
    return hydrateKeyboard(record, (id) => readKeyboard(db, keyboardStore, id));
  }
  async portable(row, db) {
    const { payloadFormat: _format, ...entry } = row;
    return { ...entry, payload: await encodeRecording(await this.decodeLocal(row, db)) };
  }
  async migrateKeyboards(db) {
    const read = (key) =>
      new Promise((resolve, reject) => {
        const store = db.transaction('recordings').objectStore('recordings');
        const r = key === undefined ? store.getAllKeys() : store.get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const summaries = await new Promise((resolve, reject) => {
      const r = db.transaction(metadataStore).objectStore(metadataStore).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    for (const { id } of summaries.filter((row) => row.payloadFormat !== 'keyboard-v1')) {
      const old = await read(id);
      if (!old || old.payloadFormat === 'keyboard-v1') continue;
      let local;
      try {
        local = await this.localPayload(await decodeRecording(old.payload));
      } catch {
        continue;
      } // Keep damaged legacy rows available for backup/recovery.
      await new Promise((resolve, reject) => {
        const tx = albumTransaction(db, 'recordings', 'readwrite'),
          store = tx.objectStore('recordings'),
          get = store.get(id);
        get.onsuccess = () => {
          if (get.result?.payload === old.payload) putRecording(store, { ...get.result, ...local });
        };
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
    }
  }
  add(recording, { pb = false, completedAt, shouldSave = () => true, automatic = false } = {}) {
    const promise = this.save(recording, { pb, completedAt, shouldSave, automatic });
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise)).catch(() => {});
    return promise;
  }
  async save(recording, { pb, completedAt, shouldSave, automatic }) {
    const [id, local, db] = await Promise.all([
      recordingID(recording),
      this.localPayload(recording),
      this.open(),
    ]);
    if (!shouldSave()) return null;
    const now = new Date().toISOString(),
      date = completedAt ?? recording.completedAt ?? recording.createdAt;
    const row = {
      id,
      size: recording.size,
      solveMs: recording.solveMs,
      ...(recording.dnf ? { dnf: true } : {}),
      completedAt: validDate(date) ? date : now,
      savedAt: now,
      pb: !!pb,
      manual: !automatic,
      averagePB: [],
      recent: false,
      ...local,
    };
    return new Promise((resolve, reject) => {
      const transaction = albumTransaction(db, ['recordings', 'deleted-recordings'], 'readwrite'),
        store = transaction.objectStore('recordings'),
        deleted = transaction.objectStore('deleted-recordings'),
        getDeleted = deleted.get(id);
      let result = null;
      getDeleted.onsuccess = () => {
        if (automatic && getDeleted.result) return;
        const get = store.get(id);
        get.onsuccess = () => {
          const previous = get.result;
          result = previous
            ? {
                ...previous,
                pb: previous.pb || row.pb,
                manual: (previous.manual ?? true) || row.manual,
              }
            : { ...row, pb: row.pb || !!getDeleted.result?.pb };
          putRecording(store, result);
          deleted.delete(id);
        };
      };
      transaction.oncomplete = () => {
        resolve(result ? metadata(result) : null);
        if (result) this.dispatchEvent(new Event('change'));
      };
      transaction.onabort = () =>
        reject(transaction.error ?? Error('Could not save recording to album'));
    });
  }
  // All memberships refer to the same recording row. Overlapping PB windows
  // only add pin flags; they never copy the payload into a second collection.
  remember(recording, { size = recording?.size, entry, pb = false, averagePB = [] } = {}) {
    if (![2, 3, 4].includes(size)) return Promise.resolve();
    const task = this.retentionChain.then(() =>
      this.rememberNow(recording, { size, entry, pb, averagePB }),
    );
    this.retentionChain = task.catch(() => {});
    this.pending.add(task);
    task.finally(() => this.pending.delete(task)).catch(() => {});
    return task;
  }
  async rememberNow(recording, { size, entry, pb, averagePB }) {
    const db = await this.open(),
      id = recording ? await recordingID(recording) : null,
      local = recording ? await this.localPayload(recording) : null,
      now = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = albumTransaction(
          db,
          ['recordings', 'deleted-recordings', 'solve-windows', 'average-groups'],
          'readwrite',
        ),
        store = tx.objectStore('recordings'),
        windows = tx.objectStore('solve-windows'),
        request = windows.get(size);
      request.onsuccess = () => {
        const previous = request.result?.entries ?? [],
          next = [
            ...previous,
            {
              id,
              ms: entry?.ms ?? recording?.solveMs ?? 0,
              dnf: !!entry?.dnf || !recording,
              at: entry?.at ?? null,
            },
          ].slice(-12);
        const finalize = () => {
          windows.put({ size, entries: next });
          const pins = new Map();
          for (const count of averagePB) {
            if (next.length < count) continue;
            for (const member of next.slice(-count)) {
              if (member.id) pins.set(member.id, [...(pins.get(member.id) ?? []), count]);
            }
          }
          for (const [id, counts] of pins) {
            const get = store.get(id);
            get.onsuccess = () => {
              const row = get.result;
              if (row)
                putRecording(store, {
                  ...row,
                  averagePB: [...new Set([...(row.averagePB ?? []), ...counts])],
                });
            };
          }
          const groups = tx.objectStore('average-groups').getAll();
          groups.onsuccess = () => {
            const groupPins = new Set(groups.result.flatMap((g) => g.members.map((m) => m.id)));
            const keep = new Set(next.map((e) => e.id));
            for (const evicted of new Set(
              previous.map((e) => e.id).filter((id) => id && !keep.has(id)),
            )) {
              const get = store.get(evicted);
              get.onsuccess = () => {
                const row = get.result;
                if (!row) return;
                if (
                  row.pb ||
                  row.manual !== false ||
                  row.averagePB?.length ||
                  groupPins.has(evicted)
                )
                  putRecording(store, { ...row, recent: false });
                else deleteRecording(store, evicted);
              };
            }
          };
        };
        if (!recording) {
          finalize();
          return;
        }
        const removed = tx.objectStore('deleted-recordings').get(id);
        removed.onsuccess = () => {
          if (removed.result) {
            next.at(-1).id = null;
            finalize();
            return;
          }
          const get = store.get(id);
          get.onsuccess = () => {
            const old = get.result;
            putRecording(
              store,
              old
                ? { ...old, pb: old.pb || pb, recent: true }
                : {
                    id,
                    size,
                    solveMs: recording.solveMs,
                    ...(recording.dnf ? { dnf: true } : {}),
                    completedAt: recording.completedAt ?? now,
                    savedAt: now,
                    pb,
                    manual: false,
                    averagePB: [],
                    recent: true,
                    ...local,
                  },
            );
            finalize();
          };
        };
      };
      tx.oncomplete = () => {
        this.dispatchEvent(new Event('change'));
        resolve();
      };
      tx.onabort = () => reject(tx.error ?? Error('Could not retain solve recordings'));
    });
  }
  async flush() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
  async rows(store = 'recordings') {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = albumTransaction(db, store),
        request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async list() {
    await this.flush();
    return (await this.rows(metadataStore)).sort(
      (a, b) =>
        Date.parse(b.completedAt) - Date.parse(a.completedAt) ||
        Date.parse(b.savedAt) - Date.parse(a.savedAt) ||
        a.id.localeCompare(b.id),
    );
  }
  async get(id) {
    const db = await this.open();
    const row = await new Promise((resolve, reject) => {
      const request = albumTransaction(db, 'recordings').objectStore('recordings').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!row) throw Error('Recording is no longer in the album');
    return this.decodeLocal(row, db);
  }
  async has(id) {
    await this.flush();
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = albumTransaction(db, 'recordings').objectStore('recordings').getKey(id);
      request.onsuccess = () => resolve(request.result !== undefined);
      request.onerror = () => reject(request.error);
    });
  }
  async remove(id) {
    return this.removeMany({ recordingIDs: [id] });
  }
  async removeMany({ recordingIDs = [], groupIDs = [] } = {}) {
    if (
      !Array.isArray(recordingIDs) ||
      !Array.isArray(groupIDs) ||
      recordingIDs.length > 20000 ||
      groupIDs.length > 2000 ||
      recordingIDs.some((id) => !/^r-[a-f0-9]{64}$/.test(id)) ||
      groupIDs.some((id) => !/^a-[a-f0-9]{64}$/.test(id))
    )
      throw Error('Invalid album selection');
    const selected = new Set(recordingIDs),
      selectedGroups = new Set(groupIDs);
    await this.flush();
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = albumTransaction(
          db,
          ['recordings', 'deleted-recordings', 'average-groups', 'solve-windows'],
          'readwrite',
        ),
        store = tx.objectStore('recordings'),
        groups = tx.objectStore('average-groups'),
        windows = tx.objectStore('solve-windows');
      let failure,
        allGroups,
        allWindows,
        removed = 0,
        removedGroups = 0;
      const apply = () => {
        if (!allGroups || !allWindows) return;
        const kept = new Set(
          allGroups
            .filter((group) => !selectedGroups.has(group.id))
            .flatMap((group) => group.members.map((member) => member.id)),
        );
        if ([...selected].some((id) => kept.has(id))) {
          failure = Error(
            'This recording belongs to a saved average. Select that average too, or leave its recording unselected.',
          );
          tx.abort();
          return;
        }
        const affected = new Set(selected),
          recent = new Set(allWindows.flatMap((window) => window.entries.map((entry) => entry.id)));
        for (const group of allGroups)
          if (selectedGroups.has(group.id)) {
            groups.delete(group.id);
            removedGroups++;
            for (const member of group.members) if (member.id) affected.add(member.id);
          }
        for (const window of allWindows)
          if (window.entries.some((entry) => selected.has(entry.id)))
            windows.put({
              ...window,
              entries: window.entries.map((entry) =>
                selected.has(entry.id) ? { ...entry, id: null } : entry,
              ),
            });
        for (const id of affected) {
          const get = store.get(id);
          get.onsuccess = () => {
            const row = get.result;
            if (!row) return;
            const explicit = selected.has(id);
            if (
              !explicit &&
              (kept.has(id) ||
                recent.has(id) ||
                row.pb ||
                row.manual !== false ||
                row.averagePB?.length)
            )
              return;
            deleteRecording(store, id);
            removed++;
            if (explicit)
              tx.objectStore('deleted-recordings').put({
                id,
                deletedAt: new Date().toISOString(),
                pb: row.pb,
              });
          };
        }
      };
      const readGroups = groups.getAll();
      readGroups.onsuccess = () => {
        allGroups = readGroups.result;
        apply();
      };
      const readWindows = windows.getAll();
      readWindows.onsuccess = () => {
        allWindows = readWindows.result;
        apply();
      };
      tx.oncomplete = () => {
        resolve({ recordings: removed, groups: removedGroups });
        this.dispatchEvent(new Event('change'));
      };
      tx.onabort = () => reject(failure ?? tx.error ?? Error('Could not delete album selection'));
    });
  }
  async listGroups() {
    await this.flush();
    return (await this.rows('average-groups')).sort(
      (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || a.id.localeCompare(b.id),
    );
  }
  async getGroup(id) {
    await this.flush();
    const db = await this.open();
    const group = await new Promise((resolve, reject) => {
      const request = db.transaction('average-groups').objectStore('average-groups').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!group) throw Error('This average is no longer in the album');
    return group;
  }
  async prepareAverage(size, times, window) {
    await this.flush();
    const count = window.end - window.start;
    if (![5, 12].includes(count) || window.end !== times.length)
      throw Error('Only the latest ao5 and ao12 can be saved from statistics.');
    const db = await this.open();
    const members = await new Promise((resolve, reject) => {
      const tx = albumTransaction(db, ['solve-windows', 'recordings']),
        request = tx.objectStore('solve-windows').get(size);
      let members = [],
        failure;
      request.onsuccess = () => {
        const recent = request.result?.entries ?? [],
          selected = times.slice(window.start, window.end),
          tail = recent.slice(-count);
        if (
          tail.length !== count ||
          selected.some(
            (t, i) =>
              t.ms !== tail[i].ms || !!t.dnf !== tail[i].dnf || (tail[i].at && t.at !== tail[i].at),
          )
        ) {
          failure = Error(
            'The recordings for this average are not available. Only newly recorded averages can be saved.',
          );
          return;
        }
        members = selected.map((entry, i) => ({
          id: tail[i].id,
          ms: entry.ms,
          dnf: !!entry.dnf,
          at: entry.at ?? null,
          scramble: entry.scramble ?? '',
          comment: entry.comment ?? '',
        }));
        for (const member of members) {
          if (!member.id) continue;
          const get = tx.objectStore('recordings').get(member.id);
          get.onsuccess = () => {
            if (!get.result) member.id = null;
          };
        }
      };
      tx.oncomplete = () => (failure ? reject(failure) : resolve(members));
      tx.onabort = () => reject(tx.error ?? Error('Could not read recent recordings'));
    });
    const missing = members.filter((m) => !m.id && !m.dnf).length;
    if (missing)
      throw Error(
        `${missing} of the ${count} solve recordings are no longer available. The average cannot be saved.`,
      );
    return makeAverage(size, members);
  }
  async saveGroup(group) {
    validateAverage(group);
    if ((await averageID(group)) !== group.id) throw Error('Invalid average identity');
    await this.flush();
    const db = await this.open();
    const task = new Promise((resolve, reject) => {
      const tx = albumTransaction(db, ['recordings', 'average-groups'], 'readwrite');
      let failure;
      for (const member of group.members) {
        if (!member.id) continue;
        const get = tx.objectStore('recordings').get(member.id);
        get.onsuccess = () => {
          if (
            !get.result ||
            get.result.size !== group.size ||
            (!member.dnf && get.result.solveMs !== member.ms)
          ) {
            failure = Error('An average recording is no longer available.');
            tx.abort();
          }
        };
      }
      const groups = tx.objectStore('average-groups'),
        get = groups.get(group.id);
      get.onsuccess = () => {
        if (!get.result) groups.put({ ...group, savedAt: new Date().toISOString() });
      };
      tx.oncomplete = () => {
        resolve(group);
        this.dispatchEvent(new Event('change'));
      };
      tx.onabort = () => reject(failure ?? tx.error ?? Error('Could not save average'));
    });
    this.pending.add(task);
    task.finally(() => this.pending.delete(task)).catch(() => {});
    return task;
  }
  async removeGroup(id) {
    return this.removeMany({ groupIDs: [id] });
  }
  async exportGroup(group) {
    await this.flush();
    const db = await this.open(),
      ids = [...new Set(group.members.map((m) => m.id).filter(Boolean))];
    const entries = await new Promise((resolve, reject) => {
      const tx = db.transaction('recordings'),
        found = [];
      for (const id of ids) {
        const request = tx.objectStore('recordings').get(id);
        request.onsuccess = () => {
          if (request.result)
            found.push({
              ...request.result,
              pb: false,
              manual: false,
              averagePB: [],
              recent: false,
            });
        };
      }
      tx.oncomplete = () => resolve(found);
      tx.onabort = () => reject(tx.error ?? Error('Could not read average recordings'));
    });
    for (let i = 0; i < entries.length; i++) entries[i] = await this.portable(entries[i], db);
    await validateAlbumBackup({ format: ALBUM_FORMAT, entries, groups: [group] });
    return { format: AVERAGE_FORMAT, group, entries };
  }
  async importGroup(data, { shouldSave = () => true } = {}) {
    if (data?.format !== AVERAGE_FORMAT) throw Error('Invalid average recording file');
    const ids = new Set(data.group?.members?.map((m) => m.id).filter(Boolean));
    if (
      !Array.isArray(data.entries) ||
      data.entries.length !== ids.size ||
      data.entries.some((row) => !ids.has(row?.id))
    )
      throw Error('Average file must contain exactly its referenced recordings');
    await validateAlbumBackup({
      format: ALBUM_FORMAT,
      entries: data.entries,
      groups: [data.group],
    });
    if (!shouldSave()) return null;
    const localEntries = await Promise.all(
      data.entries.map(async (row) => ({
        ...row,
        ...(await this.localPayload(await decodeRecording(row.payload))),
      })),
    );
    await this.flush();
    const db = await this.open();
    const task = new Promise((resolve, reject) => {
      const tx = albumTransaction(
          db,
          ['recordings', 'average-groups', 'deleted-recordings'],
          'readwrite',
        ),
        store = tx.objectStore('recordings');
      for (const row of localEntries) {
        const get = store.get(row.id);
        get.onsuccess = () => {
          if (!get.result)
            putRecording(store, { ...row, pb: false, manual: false, averagePB: [], recent: false });
          tx.objectStore('deleted-recordings').delete(row.id);
        };
      }
      const groups = tx.objectStore('average-groups'),
        get = groups.get(data.group.id);
      get.onsuccess = () => {
        if (!get.result) groups.put({ ...data.group, savedAt: new Date().toISOString() });
      };
      tx.oncomplete = () => {
        resolve(data.group);
        this.dispatchEvent(new Event('change'));
      };
      tx.onabort = () => reject(tx.error ?? Error('Could not import average'));
    });
    this.pending.add(task);
    task.finally(() => this.pending.delete(task)).catch(() => {});
    return task;
  }
  async export() {
    await this.flush();
    const db = await this.open();
    const data = await new Promise((resolve, reject) => {
      const names = ['recordings', 'deleted-recordings', 'solve-windows', 'average-groups'],
        tx = albumTransaction(db, names),
        values = {};
      for (const name of names) {
        const get = tx.objectStore(name).getAll();
        get.onsuccess = () => {
          values[name] = get.result;
        };
      }
      tx.oncomplete = () =>
        resolve({
          format: ALBUM_FORMAT,
          entries: values.recordings,
          deleted: values['deleted-recordings'],
          windows: values['solve-windows'],
          groups: values['average-groups'],
        });
      tx.onabort = () => reject(tx.error ?? Error('Could not export album'));
    });
    data.entries = await Promise.all(data.entries.map((row) => this.portable(row, db)));
    return data;
  }
  async restoreValidated(data) {
    validateAlbumEnvelope(data);
    const localEntries = await Promise.all(
      data.entries.map(async (row) => ({
        ...row,
        ...(await this.localPayload(await decodeRecording(row.payload))),
      })),
    );
    await this.flush();
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = albumTransaction(
          db,
          ['recordings', 'deleted-recordings', 'solve-windows', 'average-groups'],
          'readwrite',
        ),
        store = tx.objectStore('recordings'),
        deleted = tx.objectStore('deleted-recordings');
      store.clear();
      tx.objectStore(metadataStore).clear();
      deleted.clear();
      const windows = tx.objectStore('solve-windows');
      windows.clear();
      const groups = tx.objectStore('average-groups');
      groups.clear();
      for (const group of data.groups ?? []) groups.put(group);
      for (const row of data.windows ?? []) windows.put(row);
      for (const row of localEntries) putRecording(store, row);
      for (const row of data.deleted ?? []) deleted.put(row);
      tx.oncomplete = () => {
        resolve();
        this.dispatchEvent(new Event('change'));
      };
      tx.onabort = () => reject(tx.error ?? Error('Could not restore album'));
    });
  }
}
