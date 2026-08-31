import { canViewMember } from "@/lib/auth/organization-access";
import { canViewMemberRecord } from "@/lib/auth/member-management-access";
import type { Member } from "@/types/member";
import type { EntityId } from "@/types";

export type DownlineAccessDecision = "self" | "authorized_downline" | "forbidden";

export function resolveDownlineAccess(
  viewer: Member | null | undefined,
  targetMemberId: EntityId,
  allMembers: Member[],
): DownlineAccessDecision {
  if (!viewer) {
    return "forbidden";
  }

  if (viewer.id === targetMemberId) {
    return "self";
  }

  if (canViewMemberRecord(viewer, targetMemberId, allMembers)) {
    return "authorized_downline";
  }

  if (canViewMember(viewer, targetMemberId, allMembers)) {
    return "authorized_downline";
  }

  return "forbidden";
}

export function canViewDownlineMemberData(
  viewer: Member | null | undefined,
  targetMemberId: EntityId,
  allMembers: Member[],
): boolean {
  const decision = resolveDownlineAccess(viewer, targetMemberId, allMembers);
  return decision === "self" || decision === "authorized_downline";
}
