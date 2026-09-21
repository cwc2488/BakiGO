import {
  rethrowStorageUserError,
  setLocalStorageItemWithQuotaRecovery,
} from "./storage-quota-error";
import type { StorageAdapter } from "./storage-adapter";

export class LocalStorageAdapter implements StorageAdapter {
  getItem(key: string): string | null {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") {
      return;
    }
    try {
      setLocalStorageItemWithQuotaRecovery(key, value);
    } catch (error) {
      // setLocalStorageItemWithQuotaRecovery already mapped quota → soft user error.
      rethrowStorageUserError(error);
    }
  }

  removeItem(key: string): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(key);
  }
}
