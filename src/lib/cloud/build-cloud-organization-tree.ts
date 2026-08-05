import { getCloudMemberLevelLabel } from "@/lib/cloud/member-levels";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";
import type { OrganizationMemberView, OrganizationTreeNode } from "@/types/organization-center";

function buildMemberView(
  member: CloudMember,
  childCount: number,
): OrganizationMemberView {
  return {
    memberId: member.id,
    name: member.name,
    qualificationLabel: getCloudMemberLevelLabel(member.currentLevel),
    monthlyVp: 0,
    metMonthlyVp2500: false,
    monthlyVpTarget: null,
    nextQualification: {
      nextRankLabel: null,
      currentSummary: null,
      remainingSummary: null,
    },
    directDownlineCount: childCount,
    monthlyPoints: 0,
    lifetimePoints: 0,
    availablePoints: 0,
    streakMultiplier: 1,
  };
}

function getDirectChildMemberNumbers(
  parentMemberNumber: string,
  members: CloudMember[],
  relationships: CloudOrganizationRelationship[],
): string[] {
  const fromRelationships = relationships
    .filter((relationship) => relationship.parentMemberNumber === parentMemberNumber)
    .map((relationship) => relationship.childMemberNumber);

  const fromSponsorField = members
    .filter((member) => member.sponsorMemberNumber === parentMemberNumber)
    .map((member) => member.memberNumber);

  return Array.from(new Set([...fromRelationships, ...fromSponsorField]));
}

export function buildCloudOrganizationTreeNode(
  memberNumber: string,
  membersByNumber: Map<string, CloudMember>,
  relationships: CloudOrganizationRelationship[],
  members: CloudMember[],
): OrganizationTreeNode | null {
  const member = membersByNumber.get(memberNumber);
  if (!member) {
    return null;
  }

  const childNumbers = getDirectChildMemberNumbers(memberNumber, members, relationships);
  const children = childNumbers
    .map((childNumber) =>
      buildCloudOrganizationTreeNode(childNumber, membersByNumber, relationships, members),
    )
    .filter((node): node is OrganizationTreeNode => node !== null)
    .sort((left, right) => left.member.name.localeCompare(right.member.name, "zh-Hant"));

  return {
    member: buildMemberView(member, children.length),
    children,
  };
}

export function buildViewerCloudOrganizationSnapshot(input: {
  viewerMemberNumber: string;
  members: CloudMember[];
  relationships: CloudOrganizationRelationship[];
  referenceDate: string;
}): {
  roots: OrganizationTreeNode[];
  totalMembers: number;
  rootMemberId: string;
  referenceDate: string;
  computedAt: string;
} {
  const membersByNumber = new Map(input.members.map((member) => [member.memberNumber, member]));
  const viewer = membersByNumber.get(input.viewerMemberNumber);
  if (!viewer) {
    throw new Error(`Viewer member not found: ${input.viewerMemberNumber}`);
  }

  const root = buildCloudOrganizationTreeNode(
    input.viewerMemberNumber,
    membersByNumber,
    input.relationships,
    input.members,
  );

  if (!root) {
    throw new Error(`Unable to build organization tree for ${input.viewerMemberNumber}`);
  }

  return {
    referenceDate: input.referenceDate,
    rootMemberId: viewer.id,
    roots: [root],
    totalMembers: input.members.length,
    computedAt: new Date().toISOString(),
  };
}
