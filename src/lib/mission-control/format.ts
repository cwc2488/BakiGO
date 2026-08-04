import { APP_IDS, getAppMembers, todayISODate } from "@/lib/config/app-config";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import {
  getLatestComputedMetrics,
  recalculateMemberMetrics,
  type MemberComputedMetrics,
} from "@/lib/services/recalculate-member-metrics";

export function loadMissionControlMetrics(): MemberComputedMetrics {
  const storage = createLocalStorageAdapter();
  const referenceDate = todayISODate();

  return recalculateMemberMetrics(
    {
      memberId: APP_IDS.currentMemberId,
      referenceDate,
    },
    storage,
  );
}

export function readMissionControlMetrics(): MemberComputedMetrics | null {
  const storage = createLocalStorageAdapter();
  return getLatestComputedMetrics(APP_IDS.currentMemberId, storage);
}

export function getMemberDisplayName(): string {
  const member = getAppMembers().find((item) => item.id === APP_IDS.currentMemberId);
  return member?.nickname ?? member?.displayName ?? "";
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
    return "早安";
  }
  if (hour < 18) {
    return "午安";
  }
  return "晚安";
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
