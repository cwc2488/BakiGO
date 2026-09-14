import {
  SHARED_CALENDAR_CACHE_VERSION,
  type SharedCalendarCacheSnapshot,
} from "@/lib/calendar/shared-calendar-session-cache";

const DB_NAME = "baki-go-cache";
const DB_VERSION = 1;
const STORE_NAME = "shared-calendar";

export type SharedCalendarIdbBackend = {
  get(memberId: string): Promise<SharedCalendarCacheSnapshot | null>;
  set(snapshot: SharedCalendarCacheSnapshot): Promise<void>;
  delete(memberId: string): Promise<void>;
};

function isValidSnapshot(value: unknown): value is SharedCalendarCacheSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Partial<SharedCalendarCacheSnapshot>;
  return (
    typeof row.memberId === "string" &&
    Array.isArray(row.events) &&
    typeof row.syncedAt === "string" &&
    typeof row.rangeStart === "string" &&
    typeof row.rangeEnd === "string"
  );
}

function openSharedCalendarDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "memberId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function createBrowserIdbBackend(): SharedCalendarIdbBackend {
  return {
    async get(memberId) {
      try {
        const db = await openSharedCalendarDb();
        try {
          const row = await new Promise<unknown>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const request = tx.objectStore(STORE_NAME).get(memberId);
            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(request.error ?? new Error("IndexedDB get failed"));
          });
          return isValidSnapshot(row)
            ? {
                ...row,
                version: row.version || SHARED_CALENDAR_CACHE_VERSION,
                events: row.events.slice(),
              }
            : null;
        } finally {
          db.close();
        }
      } catch (error) {
        console.warn("[calendar] IndexedDB shared-calendar read failed", error);
        return null;
      }
    },
    async set(snapshot) {
      try {
        const db = await openSharedCalendarDb();
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
            tx.objectStore(STORE_NAME).put({
              memberId: snapshot.memberId,
              events: snapshot.events,
              syncedAt: snapshot.syncedAt,
              rangeStart: snapshot.rangeStart,
              rangeEnd: snapshot.rangeEnd,
              version: snapshot.version || SHARED_CALENDAR_CACHE_VERSION,
            });
          });
        } finally {
          db.close();
        }
      } catch (error) {
        console.warn("[calendar] IndexedDB shared-calendar write failed", error);
      }
    },
    async delete(memberId) {
      try {
        const db = await openSharedCalendarDb();
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
            tx.objectStore(STORE_NAME).delete(memberId);
          });
        } finally {
          db.close();
        }
      } catch (error) {
        console.warn("[calendar] IndexedDB shared-calendar delete failed", error);
      }
    },
  };
}

let backend: SharedCalendarIdbBackend = createBrowserIdbBackend();

export function __setSharedCalendarIdbBackendForTests(
  next: SharedCalendarIdbBackend | null,
): void {
  backend = next ?? createBrowserIdbBackend();
}

export async function readSharedCalendarIdbCache(
  memberId: string,
): Promise<SharedCalendarCacheSnapshot | null> {
  try {
    return await backend.get(memberId);
  } catch (error) {
    console.warn("[calendar] IndexedDB shared-calendar read failed", error);
    return null;
  }
}

export async function writeSharedCalendarIdbCache(
  snapshot: SharedCalendarCacheSnapshot,
): Promise<void> {
  try {
    await backend.set(snapshot);
  } catch (error) {
    console.warn("[calendar] IndexedDB shared-calendar write failed", error);
  }
}

export async function deleteSharedCalendarIdbCache(memberId: string): Promise<void> {
  try {
    await backend.delete(memberId);
  } catch (error) {
    console.warn("[calendar] IndexedDB shared-calendar delete failed", error);
  }
}
