import {
  collectDownlineMemberNumbers,
  getDirectChildMemberNumbers,
} from "@/lib/cloud/build-cloud-organization-tree";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";

export type FivePlusFiveOrgMemberRef = {
  memberId: string;
  memberNumber: string;
  name: string;
  generation: number;
};

/**
 * Collect all descendants with generation depth (1 = direct child).
 * Reuses CURRENT organization edges (relationships ∪ sponsor_member_number).
 */
export function collectDescendantsWithGeneration(
  viewer: CloudMember,
  members: CloudMember[],
  relationships: CloudOrganizationRelationship[],
): FivePlusFiveOrgMemberRef[] {
  const byNumber = new Map(members.map((m) => [m.memberNumber, m]));
  const result: FivePlusFiveOrgMemberRef[] = [];

  function walk(parentNumber: string, generation: number) {
    const children = getDirectChildMemberNumbers(parentNumber, members, relationships);
    for (const childNumber of children) {
      const child = byNumber.get(childNumber);
      if (!child) continue;
      // Guard cycles
      if (result.some((r) => r.memberId === child.id)) continue;
      result.push({
        memberId: child.id,
        memberNumber: child.memberNumber,
        name: child.name,
        generation,
      });
      walk(child.memberNumber, generation + 1);
    }
  }

  walk(viewer.memberNumber, 1);
  return result;
}

export function canViewerAccessMember(input: {
  viewer: CloudMember;
  targetMemberId: string;
  members: CloudMember[];
  relationships: CloudOrganizationRelationship[];
  /** Presidents / super-admins may see all when flagged. */
  canSeeAll?: boolean;
}): boolean {
  if (input.viewer.id === input.targetMemberId) return true;
  if (input.canSeeAll) return true;

  const downlineNumbers = collectDownlineMemberNumbers(
    input.viewer.memberNumber,
    input.members,
    input.relationships,
  );
  const target = input.members.find((m) => m.id === input.targetMemberId);
  if (!target) return false;
  return downlineNumbers.has(target.memberNumber);
}

export function generationLabel(generation: number): string {
  return `第${generation}代`;
}

// Re-export for callers that need direct children only
export { getDirectChildMemberNumbers };
