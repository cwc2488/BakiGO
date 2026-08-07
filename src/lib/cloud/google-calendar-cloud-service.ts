import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { GoogleCalendarConnection } from "@/types/calendar-event";
import type { EntityId } from "@/types";

interface GoogleCalendarConnectionRow {
  member_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  email: string | null;
  selected_calendar_id: string | null;
  selected_calendar_name: string | null;
  updated_at: string;
}

function mapRow(row: GoogleCalendarConnectionRow): GoogleCalendarConnection {
  return {
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: new Date(row.expires_at).getTime(),
    email: row.email ?? undefined,
    selectedCalendarId: row.selected_calendar_id ?? undefined,
    selectedCalendarName: row.selected_calendar_name ?? undefined,
  };
}

function toRow(memberId: EntityId, connection: GoogleCalendarConnection): GoogleCalendarConnectionRow {
  return {
    member_id: memberId,
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken ?? null,
    expires_at: new Date(connection.expiresAt).toISOString(),
    email: connection.email ?? null,
    selected_calendar_id: connection.selectedCalendarId ?? null,
    selected_calendar_name: connection.selectedCalendarName ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchGoogleCalendarConnectionFromCloud(
  memberId: EntityId,
): Promise<GoogleCalendarConnection | null> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(memberId)) {
    return null;
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("member_google_calendar_connections")
    .select("*")
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapRow(data as GoogleCalendarConnectionRow) : null;
}

export async function pushGoogleCalendarConnectionToCloud(
  memberId: EntityId,
  connection: GoogleCalendarConnection,
): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(memberId)) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("member_google_calendar_connections")
    .upsert(toRow(memberId, connection), { onConflict: "member_id" });

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteGoogleCalendarConnectionFromCloud(memberId: EntityId): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(memberId)) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("member_google_calendar_connections")
    .delete()
    .eq("member_id", memberId);

  if (error) {
    throw new Error(error.message);
  }
}

function resolveMemberId(storage: StorageAdapter): EntityId | null {
  return createAuthRepository(storage).readSession()?.memberId ?? null;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingConnection: GoogleCalendarConnection | null | undefined;
let pendingMemberId: EntityId | null = null;
let pendingDelete = false;

const PUSH_DEBOUNCE_MS = 800;

function scheduleCloudPush(
  memberId: EntityId,
  connection: GoogleCalendarConnection | null,
  deleteFromCloud: boolean,
): void {
  if (!isSupabaseConfigured()) {
    return;
  }

  pendingMemberId = memberId;
  pendingConnection = connection;
  pendingDelete = deleteFromCloud;

  if (pushTimer) {
    clearTimeout(pushTimer);
  }

  pushTimer = setTimeout(() => {
    pushTimer = null;
    const targetMemberId = pendingMemberId;
    const targetConnection = pendingConnection;
    const shouldDelete = pendingDelete;
    pendingMemberId = null;
    pendingConnection = undefined;
    pendingDelete = false;

    if (!targetMemberId) {
      return;
    }

    if (shouldDelete) {
      void deleteGoogleCalendarConnectionFromCloud(targetMemberId).catch((error) => {
        console.error("Google calendar cloud delete failed:", error);
      });
      return;
    }

    if (targetConnection) {
      void pushGoogleCalendarConnectionToCloud(targetMemberId, targetConnection).catch((error) => {
        console.error("Google calendar cloud push failed:", error);
      });
    }
  }, PUSH_DEBOUNCE_MS);
}

export function scheduleGoogleCalendarCloudPush(
  storage: StorageAdapter,
  connection: GoogleCalendarConnection,
): void {
  const memberId = resolveMemberId(storage);
  if (!memberId) {
    return;
  }
  scheduleCloudPush(memberId, connection, false);
}

export function scheduleGoogleCalendarCloudDelete(storage: StorageAdapter): void {
  const memberId = resolveMemberId(storage);
  if (!memberId) {
    return;
  }
  scheduleCloudPush(memberId, null, true);
}

/** Pull cloud connection on login; upload local when cloud is empty. */
export async function syncGoogleCalendarConnectionOnLogin(
  storage: StorageAdapter,
  memberId: EntityId,
): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(memberId)) {
    return;
  }

  const cloudConnection = await fetchGoogleCalendarConnectionFromCloud(memberId);
  const localRaw = storage.getItem(STORAGE_KEYS.googleCalendarAuth);
  const localConnection = localRaw
    ? (JSON.parse(localRaw) as GoogleCalendarConnection)
    : null;

  if (cloudConnection) {
    storage.setItem(STORAGE_KEYS.googleCalendarAuth, JSON.stringify(cloudConnection));
    return;
  }

  if (localConnection) {
    await pushGoogleCalendarConnectionToCloud(memberId, localConnection);
  }
}

export async function flushGoogleCalendarCloudSync(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  const memberId = pendingMemberId;
  const connection = pendingConnection;
  const shouldDelete = pendingDelete;
  pendingMemberId = null;
  pendingConnection = undefined;
  pendingDelete = false;

  if (!memberId) {
    return;
  }

  if (shouldDelete) {
    await deleteGoogleCalendarConnectionFromCloud(memberId);
    return;
  }

  if (connection) {
    await pushGoogleCalendarConnectionToCloud(memberId, connection);
  }
}
