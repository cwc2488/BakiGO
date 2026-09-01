import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";

/** Local storage keys mirrored to Supabase for cross-device sync. */
export const SYNCABLE_STORAGE_KEYS = [
  STORAGE_KEYS.bakiEvents,
  /** Legacy Retail House rows — still authoritative for pre-event-migration Production data. */
  STORAGE_KEYS.retailTransactions,
  STORAGE_KEYS.retailTransactionDeletionTombstones,
  STORAGE_KEYS.retailPipelineLeads,
  STORAGE_KEYS.calendarEvents,
  STORAGE_KEYS.calendarEventDeletionTombstones,
  STORAGE_KEYS.calendarGoogleDeletionTombstones,
  STORAGE_KEYS.calendarSharedAttendance,
  STORAGE_KEYS.calendarAllianceEventParticipants,
  STORAGE_KEYS.promotionCampaigns,
  STORAGE_KEYS.memberInBodyRecords,
  STORAGE_KEYS.memberProgressPhotos,
  STORAGE_KEYS.memberCoachNotes,
  STORAGE_KEYS.pointRedemptions,
  STORAGE_KEYS.superLeagueEntries,
] as const;

export type SyncableStorageKey = (typeof SYNCABLE_STORAGE_KEYS)[number];

const SYNCABLE_KEY_SET = new Set<string>(SYNCABLE_STORAGE_KEYS);

export function isSyncableStorageKey(key: string): key is SyncableStorageKey {
  return SYNCABLE_KEY_SET.has(key);
}
