import { todayISODate } from "@/lib/config/app-config";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { getMemberDisplayName as resolveMemberName } from "@/lib/members/member-service";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId } from "@/types";
import {
  getLatestComputedMetrics,
  recalculateMemberMetrics,
  type MemberComputedMetrics,
} from "@/lib/services/recalculate-member-metrics";

export function loadMissionControlMetrics(
  memberId?: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): MemberComputedMetrics {
  const referenceDate = todayISODate();
  const resolvedMemberId = memberId ?? resolveAuthenticatedMemberId(storage);

  return recalculateMemberMetrics(
    {
      memberId: resolvedMemberId,
      referenceDate,
    },
    storage,
  );
}

export function loadMemberMetrics(
  memberId: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): MemberComputedMetrics {
  return loadMissionControlMetrics(memberId, storage);
}

export function readMissionControlMetrics(
  memberId?: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): MemberComputedMetrics | null {
  return getLatestComputedMetrics(memberId ?? resolveAuthenticatedMemberId(storage), storage);
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

export function formatTimeGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
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
  };
  return icons[iconKey] ?? "🎯";
}
