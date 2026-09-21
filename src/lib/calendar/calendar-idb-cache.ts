/**
 * Bounded IndexedDB helpers for calendar caches that must not live in localStorage.
 * Personal event write-through still mirrors to member_app_data; this layer is for
 * large shared/range caches with TTL eviction.
 */
const DB_NAME = "baki-go-calendar-cache";
const DB_VERSION = 1;
const STORE = "ranges";
const MAX_RECORDS = 8;
const TTL_MS = 12 * 60 * 60 * 1000;

type RangeRecord = {
  key: string;
  payload: string;
  updatedAt: number;
  expiresAt: number;
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      Promise.resolve(fn(store))
        .then((value) => {
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => resolve(null);
        })
        .catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("idb_error"));
  });
}

export async function idbGetCalendarRange(key: string): Promise<string | null> {
  const result = await withStore("readonly", async (store) => {
    const row = (await idbRequest(store.get(key))) as RangeRecord | undefined;
    if (!row) return null;
    if (Date.now() > row.expiresAt) {
      return null;
    }
    return row.payload;
  });
  return result;
}

export async function idbSetCalendarRange(key: string, payload: string): Promise<boolean> {
  const now = Date.now();
  const ok = await withStore("readwrite", async (store) => {
    const record: RangeRecord = {
      key,
      payload,
      updatedAt: now,
      expiresAt: now + TTL_MS,
    };
    await idbRequest(store.put(record));
    const all = (await idbRequest(store.getAll())) as RangeRecord[];
    if (all.length <= MAX_RECORDS) {
      return true;
    }
    all.sort((a, b) => a.updatedAt - b.updatedAt);
    const overflow = all.slice(0, all.length - MAX_RECORDS);
    for (const row of overflow) {
      await idbRequest(store.delete(row.key));
    }
    return true;
  });
  return Boolean(ok);
}

export async function idbClearExpiredCalendarRanges(): Promise<number> {
  const removed = await withStore("readwrite", async (store) => {
    const all = (await idbRequest(store.getAll())) as RangeRecord[];
    const now = Date.now();
    let count = 0;
    for (const row of all) {
      if (now > row.expiresAt) {
        await idbRequest(store.delete(row.key));
        count += 1;
      }
    }
    return count;
  });
  return removed ?? 0;
}

export const CALENDAR_IDB_MAX_RECORDS = MAX_RECORDS;
export const CALENDAR_IDB_TTL_MS = TTL_MS;
