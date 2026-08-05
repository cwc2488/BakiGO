import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { APP_IDS } from "@/lib/config/app-config";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member, MemberStatus } from "@/types/member";
import type { EntityId } from "@/types";
import { isVirtualUplineMember } from "@/lib/members/virtual-upline";

export type MemberSortKey = "name" | "joinDate" | "status";

export function getMemberDisplayName(
  member: Member | undefined,
): string {
  if (!member) {
    return "";
  }
  return member.nickname ?? member.displayName;
}

export function getMemberRankLabel(rankKey: string): string {
  return DEFAULT_BUSINESS_RULES.ranks.labels[rankKey] ?? rankKey;
}

export function getReferrerName(
  member: Member,
  members: Member[],
): string | null {
  if (!member.sponsorMemberId) {
    return null;
  }
  const referrer = members.find((item) => item.id === member.sponsorMemberId);
  return referrer ? getMemberDisplayName(referrer) : null;
}

export function getCoachName(member: Member, members: Member[]): string | null {
  if (!member.coachId) {
    return null;
  }
  const coach = members.find((item) => item.id === member.coachId);
  return coach ? getMemberDisplayName(coach) : null;
}

export function searchMembers(members: Member[], query: string): Member[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return members;
  }

  return members.filter((member) => {
    const haystack = [
      member.displayName,
      member.nickname,
      member.phone,
      member.email,
      member.city,
      member.lineId,
      member.instagram,
      ...member.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(trimmed);
  });
}

export function sortMembers(
  members: Member[],
  sortKey: MemberSortKey,
): Member[] {
  const sorted = [...members];

  switch (sortKey) {
    case "joinDate":
      return sorted.sort((left, right) => right.joinedAt.localeCompare(left.joinedAt));
    case "status":
      return sorted.sort((left, right) => left.status.localeCompare(right.status));
    case "name":
    default:
      return sorted.sort((left, right) =>
        getMemberDisplayName(left).localeCompare(getMemberDisplayName(right), "zh-Hant"),
      );
  }
}

export function loadAllMembers(storage: StorageAdapter = createLocalStorageAdapter()): Member[] {
  return createMemberRepository(storage).getAll();
}

export function loadOperationalMembers(
  storage: StorageAdapter = createLocalStorageAdapter(),
): Member[] {
  return loadAllMembers(storage).filter((member) => !isVirtualUplineMember(member));
}

export function loadMemberById(
  memberId: EntityId,
  storage: StorageAdapter = createLocalStorageAdapter(),
): Member | undefined {
  return createMemberRepository(storage).getById(memberId);
}

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: "使用中",
  inactive: "停用",
  archived: "封存",
};

export function getMemberProfileFields(
  member: Member,
  members: Member[],
) {
  return {
    displayName: getMemberDisplayName(member),
    joinedAt: member.joinedAt,
    referrerName: getReferrerName(member, members),
    coachName: getCoachName(member, members),
    retailHouseKey: APP_IDS.defaultRetailHouseKey,
    rankLabel: getMemberRankLabel(member.rankKey),
    statusLabel: MEMBER_STATUS_LABELS[member.status],
  };
}
