import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { collectDownlineIds } from "@/lib/business-engine/utils";
import { APP_IDS } from "@/lib/config/app-config";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";

export function isPresidentMember(member: Member): boolean {
  return member.rankKey === RANK_KEYS.PRESIDENT;
}

export function getVisibleMembers(viewer: Member, allMembers: Member[]): Member[] {
  if (isPresidentMember(viewer)) {
    return allMembers;
  }

  const downlineIds = collectDownlineIds(allMembers, viewer.id);
  return allMembers.filter(
    (member) => member.id === viewer.id || downlineIds.has(member.id),
  );
}

export function canViewMember(
  viewer: Member,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  return getVisibleMembers(viewer, allMembers).some((member) => member.id === targetMemberId);
}

export function isDownlineMember(
  viewerId: EntityId,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  if (viewerId === targetMemberId) {
    return false;
  }
  return collectDownlineIds(allMembers, viewerId).has(targetMemberId);
}

/** 推廣組、富豪組、總裁組可調整第一代下線位階。 */
export function canAdjustDownlineRank(
  viewer: Member,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  if (!isCareerRankAtOrAbove(viewer.rankKey, RANK_KEYS.PROMOTION_GROUP)) {
    return false;
  }
  return isDownlineMember(viewer.id, targetMemberId, allMembers);
}

export function resolveSponsorHerbalifeMemberId(
  member: Member | undefined,
  allMembers: Member[],
): string | null {
  if (!member?.sponsorMemberId) {
    return null;
  }

  const sponsor = allMembers.find((item) => item.id === member.sponsorMemberId);
  return sponsor?.herbalifeMemberId ?? null;
}

export function getOrganizationId(): EntityId {
  return APP_IDS.organizationId;
}
