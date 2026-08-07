import { isCloudDatabaseMemberId, filterCloudDatabaseMemberIds } from "@/lib/cloud/cloud-member-ids";
import { SYNCABLE_STORAGE_KEYS } from "@/lib/cloud/syncable-storage-keys";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { EntityId } from "@/types";

export interface CloudAppDataRow {
  memberId: EntityId;
  dataKey: string;
  payload: unknown;
  updatedAt: string;
}

interface MemberAppDataDbRow {
  member_id: string;
  data_key: string;
  payload: unknown;
  updated_at: string;
}

function mapRow(row: MemberAppDataDbRow): CloudAppDataRow {
  return {
    memberId: row.member_id,
    dataKey: row.data_key,
    payload: row.payload,
    updatedAt: row.updated_at,
  };
}

export async function fetchCloudAppData(memberId: EntityId): Promise<CloudAppDataRow[]> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(memberId)) {
    return [];
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("member_app_data")
    .select("member_id, data_key, payload, updated_at")
    .eq("member_id", memberId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRow(row as MemberAppDataDbRow));
}

export async function fetchCloudAppDataBatch(
  memberIds: EntityId[],
  dataKeys?: string[],
): Promise<CloudAppDataRow[]> {
  const cloudMemberIds = filterCloudDatabaseMemberIds(memberIds);
  if (!isSupabaseConfigured() || cloudMemberIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseBrowserClient();
  let query = supabase
    .from("member_app_data")
    .select("member_id, data_key, payload, updated_at")
    .in("member_id", cloudMemberIds);

  if (dataKeys && dataKeys.length > 0) {
    query = query.in("data_key", dataKeys);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRow(row as MemberAppDataDbRow));
}

export async function upsertCloudAppDataRow(input: {
  memberId: EntityId;
  dataKey: string;
  payload: unknown;
}): Promise<void> {
  if (!isSupabaseConfigured() || !isCloudDatabaseMemberId(input.memberId)) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("member_app_data").upsert(
    {
      member_id: input.memberId,
      data_key: input.dataKey,
      payload: input.payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id,data_key" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function pushCloudAppDataKeys(input: {
  memberId: EntityId;
  entries: Array<{ dataKey: string; rawValue: string }>;
}): Promise<void> {
  if (!isSupabaseConfigured() || input.entries.length === 0) {
    return;
  }

  await Promise.all(
    input.entries.map(async (entry) => {
      let payload: unknown = [];
      try {
        payload = JSON.parse(entry.rawValue) as unknown;
      } catch {
        payload = entry.rawValue;
      }

      await upsertCloudAppDataRow({
        memberId: input.memberId,
        dataKey: entry.dataKey,
        payload,
      });
    }),
  );
}

export async function pushAllLocalAppData(input: {
  memberId: EntityId;
  readKey: (key: string) => string | null;
}): Promise<void> {
  const entries = SYNCABLE_STORAGE_KEYS.flatMap((key) => {
    const rawValue = input.readKey(key);
    if (!rawValue) {
      return [];
    }
    return [{ dataKey: key, rawValue }];
  });

  await pushCloudAppDataKeys({ memberId: input.memberId, entries });
}

export function serializeCloudPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }
  return JSON.stringify(payload ?? []);
}

export function localHasSyncableData(readKey: (key: string) => string | null): boolean {
  return SYNCABLE_STORAGE_KEYS.some((key) => {
    const value = readKey(key);
    if (!value) {
      return false;
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed);
    } catch {
      return true;
    }
  });
}
