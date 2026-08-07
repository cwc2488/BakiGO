import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

export interface CalendarGoogleDeletionTombstone {
  googleEventId: string;
  googleCalendarId: string;
  deletedAt: string;
}

function parseTombstones(raw: string | null): CalendarGoogleDeletionTombstone[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as CalendarGoogleDeletionTombstone[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readCalendarGoogleDeletionTombstones(
  storage: StorageAdapter,
): CalendarGoogleDeletionTombstone[] {
  return parseTombstones(storage.getItem(STORAGE_KEYS.calendarGoogleDeletionTombstones));
}

export function isCalendarGoogleEventDeleted(
  storage: StorageAdapter,
  googleEventId: string | undefined,
  googleCalendarId: string | undefined,
): boolean {
  if (!googleEventId || !googleCalendarId) {
    return false;
  }

  return readCalendarGoogleDeletionTombstones(storage).some(
    (tombstone) =>
      tombstone.googleEventId === googleEventId &&
      tombstone.googleCalendarId === googleCalendarId,
  );
}

export function addCalendarGoogleDeletionTombstone(
  storage: StorageAdapter,
  googleEventId: string,
  googleCalendarId: string,
): void {
  const current = readCalendarGoogleDeletionTombstones(storage);
  if (
    current.some(
      (tombstone) =>
        tombstone.googleEventId === googleEventId &&
        tombstone.googleCalendarId === googleCalendarId,
    )
  ) {
    return;
  }

  storage.setItem(
    STORAGE_KEYS.calendarGoogleDeletionTombstones,
    JSON.stringify([
      ...current,
      { googleEventId, googleCalendarId, deletedAt: new Date().toISOString() },
    ]),
  );
}

export function removeCalendarGoogleDeletionTombstone(
  storage: StorageAdapter,
  googleEventId: string,
  googleCalendarId: string,
): void {
  const next = readCalendarGoogleDeletionTombstones(storage).filter(
    (tombstone) =>
      !(
        tombstone.googleEventId === googleEventId &&
        tombstone.googleCalendarId === googleCalendarId
      ),
  );
  storage.setItem(STORAGE_KEYS.calendarGoogleDeletionTombstones, JSON.stringify(next));
}

export function markDeletedGoogleCalendarEvent(
  storage: StorageAdapter,
  event: { googleEventId?: string; googleCalendarId?: string },
): void {
  if (!event.googleEventId || !event.googleCalendarId) {
    return;
  }

  addCalendarGoogleDeletionTombstone(storage, event.googleEventId, event.googleCalendarId);
}

export async function tryDeleteGoogleCalendarEvent(
  storage: StorageAdapter,
  event: { googleEventId?: string; googleCalendarId?: string },
  deleteFromGoogle: () => Promise<void>,
): Promise<string | null> {
  if (!event.googleEventId || !event.googleCalendarId) {
    return null;
  }

  markDeletedGoogleCalendarEvent(storage, event);

  try {
    await deleteFromGoogle();
    removeCalendarGoogleDeletionTombstone(storage, event.googleEventId, event.googleCalendarId);
    return null;
  } catch (caught) {
    return caught instanceof Error ? caught.message : "Google 日曆同步失敗";
  }
}
