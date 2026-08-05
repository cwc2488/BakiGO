import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

const DEFAULT_SHOW = true;

export function loadShowSharedCalendar(storage: StorageAdapter): boolean {
  const raw = storage.getItem(STORAGE_KEYS.showSharedCalendar);
  if (raw === null) {
    return DEFAULT_SHOW;
  }
  return raw === "1";
}

export function saveShowSharedCalendar(storage: StorageAdapter, show: boolean): void {
  storage.setItem(STORAGE_KEYS.showSharedCalendar, show ? "1" : "0");
}
