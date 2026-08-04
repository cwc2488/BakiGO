import { DEFAULT_BUSINESS_RULES, RANK_KEYS } from "@/lib/business-engine";
import type { EntityId, ISODateString, YearMonth } from "@/types";

/** Application-level identifiers — swap when auth is introduced. */
export const APP_IDS = {
  organizationId: "org-default",
  currentMemberId: "member-default",
  defaultRetailHouseKey: "retail-house-default",
} as const;

export interface AppMember {
  id: EntityId;
  displayName: string;
  nickname?: string;
  rankKey: string;
  sponsorMemberId?: EntityId;
  joinedAt?: ISODateString;
}

export function getAppMembers(): AppMember[] {
  return [
    {
      id: APP_IDS.currentMemberId,
      displayName: "巴其哥",
      nickname: "巴其哥",
      rankKey: RANK_KEYS.NEW_MEMBER,
      joinedAt: "2026-01-15",
    },
  ];
}

export function getMemberById(memberId: EntityId): AppMember | undefined {
  return getAppMembers().find((member) => member.id === memberId);
}

export function getMemberProfileIdentity() {
  const member = getMemberById(APP_IDS.currentMemberId);
  const sponsor = member?.sponsorMemberId
    ? getMemberById(member.sponsorMemberId)
    : undefined;

  return {
    displayName: member?.nickname ?? member?.displayName ?? "",
    joinedAt: member?.joinedAt ?? null,
    sponsorName: sponsor?.nickname ?? sponsor?.displayName ?? null,
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

export function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
