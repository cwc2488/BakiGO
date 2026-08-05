import { APP_IDS } from "@/lib/config/app-config";
import { createAuthRepository } from "@/lib/repositories/auth-repository";
import { resetSharedCalendarCache } from "@/lib/calendar/shared-calendar-storage";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";

/** 遞增此版本號可在所有使用者下次開啟 App 時清除測試資料 */
export const APP_DATA_RESET_VERSION = 2;

function parseMembers(raw: string | null): Member[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Member[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isTestRecruitMember(member: Member): boolean {
  if (member.herbalifeMemberId.startsWith("RC")) {
    return true;
  }
  if (member.tags.includes("超級聯賽招募")) {
    return true;
  }
  if (/^新會員 \d+$/.test(member.displayName)) {
    return true;
  }
  return false;
}

function purgeTestMembers(storage: StorageAdapter): void {
  const session = createAuthRepository(storage).readSession();
  const keepIds = new Set<EntityId>([
    APP_IDS.virtualUplineMemberId,
    APP_IDS.currentMemberId,
  ]);
  if (session?.memberId) {
    keepIds.add(session.memberId);
  }

  const members = parseMembers(storage.getItem(STORAGE_KEYS.members));
  if (members.length === 0) {
    return;
  }

  const filtered = members.filter(
    (member) => keepIds.has(member.id) || !isTestRecruitMember(member),
  );

  if (filtered.length !== members.length) {
    storage.setItem(STORAGE_KEYS.members, JSON.stringify(filtered));
  }
}

/** 清除快速記錄、名單、行事曆個人資料、統計快取等測試資料；保留登入與正式夥伴檔案 */
export function clearTestAppData(storage: StorageAdapter): void {
  const keysToRemove = [
    STORAGE_KEYS.bakiEvents,
    STORAGE_KEYS.computedMetrics,
    STORAGE_KEYS.retailTransactions,
    STORAGE_KEYS.retailPipelineLeads,
    STORAGE_KEYS.calendarEvents,
    STORAGE_KEYS.calendarSharedAttendance,
    STORAGE_KEYS.sharedCalendarEvents,
    STORAGE_KEYS.promotionCampaigns,
    STORAGE_KEYS.memberInBodyRecords,
    STORAGE_KEYS.memberProgressPhotos,
    STORAGE_KEYS.memberCoachNotes,
    STORAGE_KEYS.eventsMigrated,
  ] as const;

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }

  purgeTestMembers(storage);
  resetSharedCalendarCache(storage);
}

/** 清除本機登入與會員快取（雲端重置後使用） */
export function clearLocalAuthAndMemberCache(storage: StorageAdapter): void {
  storage.removeItem(STORAGE_KEYS.authSession);
  storage.removeItem(STORAGE_KEYS.authAccounts);
  storage.removeItem(STORAGE_KEYS.cloudMembersMode);
  storage.removeItem(STORAGE_KEYS.members);
}

export function runAppDataResetIfNeeded(storage: StorageAdapter): boolean {
  const current = storage.getItem(STORAGE_KEYS.appDataResetVersion);
  if (current === String(APP_DATA_RESET_VERSION)) {
    return false;
  }

  clearTestAppData(storage);
  if (Number(current ?? 0) < 2) {
    clearLocalAuthAndMemberCache(storage);
  }
  storage.setItem(STORAGE_KEYS.appDataResetVersion, String(APP_DATA_RESET_VERSION));
  return true;
}
