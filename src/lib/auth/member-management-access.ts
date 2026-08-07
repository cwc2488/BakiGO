import {
  isDownlineMember,
} from "@/lib/auth/organization-access";
import { loadAllMembers } from "@/lib/members/member-service";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";

/** 是否有下線夥伴可管理（夥伴關懷的前提）。 */
export function hasPartnerCareDownline(viewer: Member, allMembers: Member[]): boolean {
  return getPartnerCareMembers(viewer, allMembers).length > 0;
}

/** 夥伴關懷後台：有下線夥伴才開放。 */
export function canAccessMemberManagement(
  viewer: Member | null | undefined,
  allMembers: Member[] = [],
): boolean {
  if (!viewer) {
    return false;
  }

  if (allMembers.length === 0) {
    return false;
  }

  return hasPartnerCareDownline(viewer, allMembers);
}

export function getPartnerCareMembers(viewer: Member, allMembers: Member[]): Member[] {
  return allMembers.filter(
    (member) =>
      member.id !== viewer.id &&
      isDownlineMember(viewer.id, member.id, allMembers),
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

  return isDownlineMember(viewer.id, targetMemberId, allMembers);
}

export function canEditMemberRecord(
  viewer: Member | null | undefined,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  if (!viewer) {
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
