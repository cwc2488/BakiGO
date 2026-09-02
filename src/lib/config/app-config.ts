import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine";
import { resolveAuthenticatedMemberId } from "@/lib/auth/auth-service";
import { resolveSponsorHerbalifeMemberId } from "@/lib/auth/organization-access";
import {
  getMemberRankLabel,
  MEMBER_STATUS_LABELS,
} from "@/lib/members/member-service";
import { toEngineMember } from "@/lib/members/to-engine-member";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId, ISODateString, YearMonth } from "@/types";

/** Application-level identifiers — swap when auth is introduced. */
export const APP_IDS = {
  organizationId: "org-default",
  currentMemberId: "member-default",
  defaultRetailHouseKey: "retail-house-default",
  virtualUplineMemberId: "member-virtual-upline",
  virtualUplineHerbalifeMemberId: "00000",
} as const;

export interface AppMember {
  id: EntityId;
  displayName: string;
  nickname?: string;
  rankKey: string;
  sponsorMemberId?: EntityId;
  joinedAt?: ISODateString;
}

export function getAppMembers(
  storage: StorageAdapter = createLocalStorageAdapter(),
): AppMember[] {
  const repository = createMemberRepository(storage);
  return repository.getAll().map(toEngineMember);
}

export function getMemberById(
  memberId: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): AppMember | undefined {
  const member = createMemberRepository(storage).getById(memberId);
  return member ? toEngineMember(member) : undefined;
}

export function getMemberProfileIdentity(
  memberId?: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
) {
  const repository = createMemberRepository(storage);
  const resolvedMemberId = memberId ?? resolveAuthenticatedMemberId(storage);
  const member = repository.getById(resolvedMemberId);
  const allMembers = repository.getAll();
  const sponsor = member?.sponsorMemberId
    ? repository.getById(member.sponsorMemberId)
    : undefined;

  return {
    displayName: member?.nickname ?? member?.displayName ?? "",
    herbalifeMemberId: member?.herbalifeMemberId ?? null,
    sponsorHerbalifeMemberId: resolveSponsorHerbalifeMemberId(member, allMembers),
    qualificationLabel: member ? getMemberRankLabel(member.rankKey) : null,
    joinedAt: member?.joinedAt ?? null,
    statusLabel: member ? MEMBER_STATUS_LABELS[member.status] : null,
    sponsorName: sponsor?.nickname ?? sponsor?.displayName ?? null,
    avatarUrl: member?.avatarUrl ?? null,
    retailHouseKey: APP_IDS.defaultRetailHouseKey,
  };
}

export function getRetailHouseKeys(): string[] {
  return [APP_IDS.defaultRetailHouseKey];
}

export function buildMonthlyChallenge(yearMonth: YearMonth) {
  const template = DEFAULT_BUSINESS_RULES.monthlyChallenge;

  return {
    id: `challenge-${yearMonth}`,
    yearMonth,
    title: template.title,
    criteria: template.criteria,
  };
}

export function toYearMonthFromDate(date: string): YearMonth {
  return date.slice(0, 7);
}

/** Product day/month boundaries follow Taiwan local time. */
export const APP_TIMEZONE = "Asia/Taipei" as const;

/**
 * Calendar date (YYYY-MM-DD) in Asia/Taipei.
 * Do not use browser/UTC `getDate()` — that rolls over hours late for Taiwan.
 */
export function todayISODate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Hour 0–23 in Asia/Taipei (for greetings / day-part UI). */
export function currentAppHour(now: Date = new Date()): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: APP_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour === 24) {
    return 0;
  }
  return Number.isFinite(hour) ? hour : 0;
}

/**
 * Milliseconds until the next Asia/Taipei calendar-day boundary.
 * Used so Home/KPI can roll over without an app restart.
 */
export function millisecondsUntilNextAppMidnight(now: Date = new Date()): number {
  const today = todayISODate(now);
  let low = now.getTime();
  let high = low + 36 * 60 * 60 * 1000;
  while (high - low > 250) {
    const mid = Math.floor((low + high) / 2);
    if (todayISODate(new Date(mid)) === today) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.max(250, high - now.getTime());
}
