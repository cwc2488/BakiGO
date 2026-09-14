import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

/** Soft copy — only for confirmed quota failures after recovery. */
export const STORAGE_QUOTA_SOFT_USER_MESSAGE =
  "暫存資料空間不足，部分離線功能可能暫時無法使用。";

/** @deprecated Prefer STORAGE_QUOTA_SOFT_USER_MESSAGE; kept for older assertions. */
export const STORAGE_QUOTA_USER_MESSAGE = STORAGE_QUOTA_SOFT_USER_MESSAGE;

/**
 * Disposable local caches that can be rebuilt from server / recomputed.
 * Never includes auth, personal calendar events, customers, or syncable user content.
 */
export const DISPOSABLE_LOCAL_CACHE_KEYS: readonly string[] = [
  STORAGE_KEYS.sharedCalendarEvents,
  STORAGE_KEYS.sharedCalendarCacheMeta,
  STORAGE_KEYS.calendarReminderQueue,
  STORAGE_KEYS.computedMetrics,
];

function readErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name ?? "");
  }
  return "";
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

function readErrorCode(error: unknown): number | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "number" ? code : null;
  }
  return null;
}

/**
 * True only for confirmed browser quota / storage-full signals.
 * Does NOT treat InvalidStateError, AbortError, UnknownError, etc. as quota.
 */
export function isStorageQuotaError(error: unknown): boolean {
  const name = readErrorName(error);
  const message = readErrorMessage(error).toLowerCase();
  const code = readErrorCode(error);

  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }

  // Spec: DOMException.QUOTA_EXCEEDED_ERR === 22, but only trust with matching name/message.
  if (
    error instanceof DOMException &&
    code === 22 &&
    (name === "QuotaExceededError" || message.includes("quota"))
  ) {
    return true;
  }

  if (
    message.includes("quotaexceeded") ||
    message.includes("quota exceeded") ||
    message.includes("storage quota") ||
    message.includes("the quota has been exceeded") ||
    message.includes("ns_error_dom_quota_reached")
  ) {
    return true;
  }

  return false;
}

export function toStorageUserError(error: unknown): Error {
  if (isStorageQuotaError(error)) {
    return new Error(STORAGE_QUOTA_SOFT_USER_MESSAGE);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error("儲存失敗，請稍後再試");
}

export function rethrowStorageUserError(error: unknown): never {
  throw toStorageUserError(error);
}

/** Clear rebuildable Baki Go caches only. Returns how many keys were removed. */
export function reclaimDisposableLocalCaches(
  storage: Pick<{ getItem(key: string): string | null; removeItem(key: string): void }, "getItem" | "removeItem"> = {
    getItem: (key) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
    removeItem: (key) => {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
      }
    },
  },
): number {
  let removed = 0;
  for (const key of DISPOSABLE_LOCAL_CACHE_KEYS) {
    try {
      if (storage.getItem(key) != null) {
        storage.removeItem(key);
        removed += 1;
      }
    } catch (error) {
      console.warn("[storage] failed to reclaim disposable cache", key, error);
    }
  }
  return removed;
}

/**
 * Write to window.localStorage with one reclaim+retry on true quota errors.
 * Non-quota errors are rethrown without claiming "space full".
 */
export function setLocalStorageItemWithQuotaRecovery(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
    return;
  } catch (error) {
    console.warn("[storage] localStorage.setItem failed", { key, error });

    if (!isStorageQuotaError(error)) {
      rethrowStorageUserError(error);
    }

    const reclaimed = reclaimDisposableLocalCaches();
    console.warn("[storage] quota exceeded — reclaimed disposable caches", {
      key,
      reclaimed,
    });

    try {
      window.localStorage.setItem(key, value);
      return;
    } catch (retryError) {
      console.warn("[storage] localStorage.setItem retry failed after reclaim", {
        key,
        error: retryError,
      });
      throw toStorageUserError(retryError);
    }
  }
}
