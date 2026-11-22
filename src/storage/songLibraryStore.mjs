import { normalizeFolderPath } from './localStore.mjs';

export const DB_NAME = 'buskero-library';
export const DB_VERSION = 1;
export const STORE_NAME = 'songs';
export const MAX_MIDI_BYTES = 10 * 1024 * 1024; // 10 MB safety limit

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected Uint8Array or ArrayBuffer for MIDI bytes.');
}

function fnv1a64Hex(bytes) {
  const h1 = 0xcbf29ce4n;
  const h2 = 0x84222325n;
  const prime = 0x00000100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = (h1 << 32n) | h2;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export async function computeSongHashId(inputBytes) {
  const bytes = toUint8Array(inputBytes);
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    return `custom:${hex.slice(0, 16)}`;
  }
  return `custom:${fnv1a64Hex(bytes)}`;
}

function createMemorySongStore() {
  const records = new Map();

  return {
    async put(record) {
      records.set(record.id, structuredClone(record));
    },
    async get(id) {
      const found = records.get(id);
      return found ? structuredClone(found) : null;
    },
    async getAll() {
      return Array.from(records.values(), (item) => structuredClone(item));
    },
    async delete(id) {
      records.delete(id);
    },
    async clear() {
      records.clear();
    },
  };
}

function createIndexedDbAdapter(indexedDBRef) {
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDBRef.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error || new Error('Failed to open IndexedDB library store.'));
      };
    });
    return dbPromise;
  }

  async function runTx(mode, handler) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const req = handler(store);
      let result;
      if (req) {
        req.onsuccess = () => {
          result = req.result;
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
    });
  }

  return {
    put: (record) => runTx('readwrite', (store) => store.put(record)),
    get: async (id) => (await runTx('readonly', (store) => store.get(id))) ?? null,
    getAll: async () => (await runTx('readonly', (store) => store.getAll())) ?? [],
    delete: (id) => runTx('readwrite', (store) => store.delete(id)),
    clear: () => runTx('readwrite', (store) => store.clear()),
  };
}

export function createSongLibraryStore({ indexedDBRef } = {}) {
  const idb = indexedDBRef ?? (typeof globalThis !== 'undefined' ? globalThis.indexedDB : null);
  const adapter = idb && typeof idb.open === 'function' ? createIndexedDbAdapter(idb) : createMemorySongStore();

  async function saveCustomSong({
    fileName = 'untitled.mid',
    title = 'Custom Song',
    midiBytes,
    bpm = 120,
    durationSec = 0,
    trackCount = 1,
    folderPath,
  }) {
    const bytes = toUint8Array(midiBytes);
    if (bytes.byteLength === 0) {
      throw new Error('MIDI file is empty.');
    }
    if (bytes.byteLength > MAX_MIDI_BYTES) {
      throw new Error('MIDI file exceeds the 10 MB browser storage limit.');
    }

    const id = await computeSongHashId(bytes);
    const existing = await adapter.get(id);
    const now = Date.now();
    const resolvedFolder = normalizeFolderPath(folderPath !== undefined ? folderPath : (existing?.folderPath ?? ''));

    const record = {
      id,
      fileName: String(fileName || 'custom.mid'),
      title: String(title || 'Custom Song'),
      midiBytes: new Uint8Array(bytes),
      sizeBytes: bytes.byteLength,
      bpm: Number(bpm) || 120,
      durationSec: Number(durationSec) || 0,
      trackCount: Math.max(1, Math.round(Number(trackCount) || 1)),
      folderPath: resolvedFolder,
      addedAt: existing?.addedAt ?? now,
      updatedAt: now,
    };

    try {
      await adapter.put(record);
    } catch (err) {
      if (err?.name === 'QuotaExceededError') {
        throw new Error('Browser storage quota exceeded. Remove older custom songs in Privacy & Legal.', {
          cause: err,
        });
      }
      throw err;
    }

    return {
      id: record.id,
      fileName: record.fileName,
      title: record.title,
      sizeBytes: record.sizeBytes,
      bpm: record.bpm,
      durationSec: record.durationSec,
      trackCount: record.trackCount,
      folderPath: record.folderPath,
      addedAt: record.addedAt,
      updatedAt: record.updatedAt,
    };
  }

  async function listCustomSongs() {
    const all = await adapter.getAll();
    return all
      .map((item) => ({
        id: item.id,
        fileName: item.fileName,
        title: item.title,
        sizeBytes: item.sizeBytes ?? item.midiBytes?.byteLength ?? 0,
        bpm: item.bpm ?? 120,
        durationSec: item.durationSec ?? 0,
        trackCount: item.trackCount ?? 1,
        folderPath: normalizeFolderPath(item.folderPath ?? ''),
        addedAt: item.addedAt ?? 0,
        updatedAt: item.updatedAt ?? 0,
      }))
      .toSorted((a, b) => b.updatedAt - a.updatedAt);
  }

  async function getCustomSong(id) {
    if (!id) return null;
    const item = await adapter.get(id);
    if (!item) return null;
    return {
      ...item,
      folderPath: normalizeFolderPath(item.folderPath ?? ''),
      midiBytes: toUint8Array(item.midiBytes),
    };
  }

  async function updateCustomSongFolder(id, folderPath) {
    if (!id) return null;
    const existing = await adapter.get(id);
    if (!existing) return null;
    const nextRecord = {
      ...existing,
      folderPath: normalizeFolderPath(folderPath ?? ''),
      updatedAt: Date.now(),
    };
    await adapter.put(nextRecord);
    return {
      id: nextRecord.id,
      fileName: nextRecord.fileName,
      title: nextRecord.title,
      sizeBytes: nextRecord.sizeBytes,
      bpm: nextRecord.bpm,
      durationSec: nextRecord.durationSec,
      trackCount: nextRecord.trackCount,
      folderPath: nextRecord.folderPath,
      addedAt: nextRecord.addedAt,
      updatedAt: nextRecord.updatedAt,
    };
  }

  async function clearFolderPrefixFromSongs(folderPath) {
    const prefix = normalizeFolderPath(folderPath ?? '');
    if (!prefix) return;
    const all = await adapter.getAll();
    for (const item of all) {
      const current = normalizeFolderPath(item.folderPath ?? '');
      if (current === prefix || current.startsWith(`${prefix}/`)) {
        await adapter.put({
          ...item,
          folderPath: '',
          updatedAt: Date.now(),
        });
      }
    }
  }

  async function deleteCustomSong(id) {
    if (!id) return;
    await adapter.delete(id);
  }

  async function clearAllCustomSongs() {
    await adapter.clear();
  }

  async function getLibrarySummary() {
    const songs = await listCustomSongs();
    const totalBytes = songs.reduce((sum, s) => sum + (s.sizeBytes || 0), 0);
    return {
      count: songs.length,
      totalBytes,
    };
  }

  return {
    saveCustomSong,
    listCustomSongs,
    getCustomSong,
    updateCustomSongFolder,
    clearFolderPrefixFromSongs,
    deleteCustomSong,
    clearAllCustomSongs,
    getLibrarySummary,
  };
}
