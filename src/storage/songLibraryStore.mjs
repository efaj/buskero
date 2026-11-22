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
