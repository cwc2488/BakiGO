import { LocalStorageAdapter } from "./local-storage-adapter";
import { createSyncingStorageAdapter } from "./syncing-storage-adapter";

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export { LocalStorageAdapter } from "./local-storage-adapter";

export function createLocalStorageAdapter(): StorageAdapter {
  return createSyncingStorageAdapter(new LocalStorageAdapter());
}
