import { isCloudDatabaseMemberId } from "@/lib/cloud/cloud-member-ids";
import { upsertCloudAppDataRow, fetchCloudAppDataBatch } from "@/lib/cloud/cloud-app-data-service";
import { updateCloudMemberName } from "@/lib/cloud/cloud-member-service";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";

export const MEMBER_PROFILE_DATA_KEY = "baki-go:member-profile";

/** 雲端 members 表沒有的個人頁欄位 — 存 member_app_data。 */
export interface MemberProfileExtension {
  displayName?: string;
  nickname?: string;
  gender?: string;
  birthday?: string;
  phone?: string;
  lineId?: string;
  instagram?: string;
  email?: string;
  goal?: string;
  occupation?: string;
  city?: string;
  notes?: string;
  tags?: string[];
}

const PROFILE_FIELD_KEYS = [
  "displayName",
  "nickname",
  "gender",
  "birthday",
  "phone",
  "lineId",
  "instagram",
  "email",
  "goal",
  "occupation",
  "city",
  "notes",
  "tags",
] as const satisfies ReadonlyArray<keyof MemberProfileExtension>;

function hasValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function extractMemberProfileExtension(member: Member): MemberProfileExtension {
  return {
    displayName: member.displayName,
    nickname: member.nickname,
    gender: member.gender,
    birthday: member.birthday,
    phone: member.phone,
    lineId: member.lineId,
    instagram: member.instagram,
    email: member.email,
    goal: member.goal,
    occupation: member.occupation,
    city: member.city,
    notes: member.notes,
    tags: member.tags,
  };
}

export function applyMemberProfileExtension(
  member: Member,
  extension: Partial<MemberProfileExtension> | null | undefined,
): Member {
  if (!extension) {
    return member;
  }

  return {
    ...member,
    displayName: extension.displayName?.trim() || member.displayName,
    nickname: extension.nickname ?? member.nickname,
    gender: extension.gender ?? member.gender,
    birthday: extension.birthday ?? member.birthday,
    phone: extension.phone ?? member.phone,
    lineId: extension.lineId ?? member.lineId,
    instagram: extension.instagram ?? member.instagram,
    email: extension.email ?? member.email,
    goal: extension.goal ?? member.goal,
    occupation: extension.occupation ?? member.occupation,
    city: extension.city ?? member.city,
    notes: extension.notes ?? member.notes,
    tags: extension.tags ?? member.tags,
  };
}

/** 保留本機已填的個人頁欄位，避免雲端同步覆蓋。 */
export function mergeLocalMemberProfile(incoming: Member, existing: Member | undefined): Member {
  if (!existing) {
    return incoming;
  }

  const patch: Partial<Member> = {};
  for (const key of PROFILE_FIELD_KEYS) {
    const existingValue = existing[key as keyof Member];
    const incomingValue = incoming[key as keyof Member];
    if (hasValue(existingValue) && !hasValue(incomingValue)) {
      (patch as Record<string, unknown>)[key] = existingValue;
    }
  }

  return { ...incoming, ...patch, tags: patch.tags ?? incoming.tags };
}

function parseProfileExtension(payload: unknown): MemberProfileExtension | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as MemberProfileExtension;
}

export async function fetchMemberProfileExtensions(
  memberIds: EntityId[],
): Promise<Map<EntityId, MemberProfileExtension>> {
  const result = new Map<EntityId, MemberProfileExtension>();
  if (!isSupabaseConfigured() || memberIds.length === 0) {
    return result;
  }

  const rows = await fetchCloudAppDataBatch(memberIds, [MEMBER_PROFILE_DATA_KEY]);
  for (const row of rows) {
    const extension = parseProfileExtension(row.payload);
    if (extension) {
      result.set(row.memberId, extension);
    }
  }

  return result;
}

export async function persistMemberProfile(
  memberId: EntityId,
  member: Member,
): Promise<void> {
  if (!isCloudDatabaseMemberId(memberId)) {
    return;
  }

  const extension = extractMemberProfileExtension(member);

  if (isSupabaseConfigured()) {
    await upsertCloudAppDataRow({
      memberId,
      dataKey: MEMBER_PROFILE_DATA_KEY,
      payload: extension,
    });
    await updateCloudMemberName(memberId, member.displayName);
  }
}

export function mergeMembersWithProfileExtensions(
  members: Member[],
  existingMembers: Member[],
  cloudExtensions: Map<EntityId, MemberProfileExtension>,
): Member[] {
  const existingById = new Map(existingMembers.map((member) => [member.id, member]));

  return members.map((member) => {
    const withLocal = mergeLocalMemberProfile(member, existingById.get(member.id));
    const cloudExtension = cloudExtensions.get(member.id);
    return applyMemberProfileExtension(withLocal, cloudExtension);
  });
}
