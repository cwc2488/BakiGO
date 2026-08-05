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
