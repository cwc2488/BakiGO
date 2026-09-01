import { currentAppHour, todayISODate } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { getMemberAvatarUrl as resolveMemberAvatarUrl, getMemberDisplayName as resolveMemberName } from "@/lib/members/member-service";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import type { BakiEvent } from "@/types/baki-event";
import {
  getComputedMetricsForReferenceDate,
  recalculateMemberMetrics,
  type MemberComputedMetrics,
} from "@/lib/services/recalculate-member-metrics";

export function loadMissionControlMetrics(
  memberId?: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
  supplementalEvents?: BakiEvent[],
  options?: { includeMapUniverse?: boolean },
): MemberComputedMetrics {
  const referenceDate = todayISODate();
  const resolvedMemberId = memberId ?? resolveAuthenticatedMemberId(storage);

  return recalculateMemberMetrics(
    {
      memberId: resolvedMemberId,
      referenceDate,
      supplementalEvents,
      includeMapUniverse: options?.includeMapUniverse,
    },
    storage,
  );
}

export function loadMemberMetrics(
  memberId: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
  supplementalEvents?: BakiEvent[],
): MemberComputedMetrics {
  return loadMissionControlMetrics(memberId, storage, supplementalEvents);
}

/**
 * Cached metrics are only usable for the current Asia/Taipei calendar day.
 * Stale day/month snapshots must not paint Home after midnight rollover.
 */
export function readMissionControlMetrics(
  memberId?: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): MemberComputedMetrics | null {
  const resolvedMemberId = memberId ?? resolveAuthenticatedMemberId(storage);
  const today = todayISODate();
  return getComputedMetricsForReferenceDate(resolvedMemberId, today, storage);
}

export function getMemberDisplayName(
  memberId?: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): string {
  const member = createMemberRepository(storage).getById(
    memberId ?? resolveAuthenticatedMemberId(storage),
  );
  return resolveMemberName(member);
}

export function getMemberAvatarUrl(
  memberId?: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): string | null {
  const member = createMemberRepository(storage).getById(
    memberId ?? resolveAuthenticatedMemberId(storage),
  );
  return resolveMemberAvatarUrl(member);
}

export function formatJoinedDate(joinedAt: string): string {
  const date = new Date(`${joinedAt}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("zh-Hant", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return formatter.format(date);
}

export function formatShortDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("zh-Hant", {
    month: "short",
    day: "numeric",
  });
  return formatter.format(parsed);
}

export function formatDisplayDate(referenceDate: string): string {
  const date = new Date(`${referenceDate}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("zh-Hant", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return formatter.format(date);
}

export function formatPlainTimeGreeting(date: Date = new Date()): string {
  const hour = currentAppHour(date);
  if (hour < 12) {
    return "早安";
  }
  if (hour < 18) {
    return "午安";
  }
  return "晚安";
}

export function formatTimeGreeting(date: Date = new Date()): string {
  const hour = currentAppHour(date);
  if (hour < 12) {
    return "🌅 早安";
  }
  if (hour < 18) {
    return "🌤️ 午安";
  }
  return "🌙 晚安";
}

export function formatIcon(iconKey: string): string {
  const icons: Record<string, string> = {
    calendar: "📅",
    flame: "🔥",
    globe: "🌍",
    tree: "🌳",
    target: "🎯",
    star: "⭐",
    bolt: "⚡",
    measurement: "📏",
    sale: "💰",
    member: "👤",
    supervisor: "🎖️",
    active: "🔥",
    world: "🌏",
    promotion: "📣",
    wealth: "💎",
    president: "👑",
    map: "🗺️",
    xp: "🏆",
    streak: "🔥",
    challenge: "🎯",
    consultation: "💬",
    recruit: "🤝",
    measurement_gold: "📏",
    sale_gold: "💰",
    vp: "💎",
    rank: "🎖️",
    rank_gold: "👑",
  };
  if (icons[iconKey]) {
    return icons[iconKey];
  }
  if (/^[\p{Extended_Pictographic}]/u.test(iconKey)) {
    return iconKey;
  }
  return "🏅";
}
