import { createLocalStorageAdapter, type StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

export type HomeDisplayMode = "simple" | "full";

export function getHomeDisplayMode(
  storage: StorageAdapter = createLocalStorageAdapter(),
): HomeDisplayMode {
  const raw = storage.getItem(STORAGE_KEYS.homeDisplayMode);
  return raw === "full" ? "full" : "simple";
}

export function setHomeDisplayMode(
  mode: HomeDisplayMode,
  storage: StorageAdapter = createLocalStorageAdapter(),
): void {
  storage.setItem(STORAGE_KEYS.homeDisplayMode, mode);
}
