import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import {
  canViewMember,
  isDownlineMember,
} from "@/lib/auth/organization-access";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { loadAllMembers } from "@/lib/members/member-service";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";

/** 督導及以上可進入夥伴關懷後台。 */
export function canAccessMemberManagement(viewer: Member | null | undefined): boolean {
  if (!viewer) {
    return false;
  }

  return isCareerRankAtOrAbove(viewer.rankKey, RANK_KEYS.SUPERVISOR);
}

export function getPartnerCareMembers(viewer: Member, allMembers: Member[]): Member[] {
  return allMembers.filter(
    (member) =>
      member.id !== viewer.id &&
      isDownlineMember(viewer.id, member.id, allMembers) &&
      canViewMember(viewer, member.id, allMembers),
  );
}

export function canViewMemberRecord(
  viewer: Member | null | undefined,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  if (!viewer) {
    return false;
  }

  if (viewer.id === targetMemberId) {
    return true;
  }

  if (!canAccessMemberManagement(viewer)) {
    return canViewMember(viewer, targetMemberId, allMembers);
  }

  return isDownlineMember(viewer.id, targetMemberId, allMembers);
}

export function canEditMemberRecord(
  viewer: Member | null | undefined,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  if (!viewer || !canAccessMemberManagement(viewer)) {
    return false;
  }

  return isDownlineMember(viewer.id, targetMemberId, allMembers);
}

export function canDeleteMemberRecord(
  viewer: Member | null | undefined,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  return canEditMemberRecord(viewer, targetMemberId, allMembers);
}

export function loadPartnerCareMembers(
  viewer: Member,
  storage: StorageAdapter,
): Member[] {
  return getPartnerCareMembers(viewer, loadAllMembers(storage));
}
