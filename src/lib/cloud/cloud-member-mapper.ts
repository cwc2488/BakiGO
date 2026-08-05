import { APP_IDS } from "@/lib/config/app-config";
import { resolveCloudMemberRole } from "@/lib/cloud/member-levels";
import type { CloudMember, CloudOrganizationRelationship } from "@/types/cloud";
import type { Member } from "@/types/member";

type CloudMemberRow = {
  id: string;
  member_number: string;
  name: string;
  email: string;
  role: string;
  current_level: string;
  sponsor_member_number: string | null;
  created_at: string;
};

type CloudRelationshipRow = {
  id: string;
  parent_member_number: string;
  child_member_number: string;
  created_at: string;
};

export function mapCloudMemberRow(row: CloudMemberRow): CloudMember {
  return {
    id: row.id,
    memberNumber: row.member_number,
    name: row.name,
    email: row.email,
    role: row.role,
    currentLevel: row.current_level,
    sponsorMemberNumber: row.sponsor_member_number,
    createdAt: row.created_at.slice(0, 10),
  };
}

export function mapCloudRelationshipRow(row: CloudRelationshipRow): CloudOrganizationRelationship {
  return {
    id: row.id,
    parentMemberNumber: row.parent_member_number,
    childMemberNumber: row.child_member_number,
    createdAt: row.created_at.slice(0, 10),
  };
}

export function cloudMemberToLocalMember(
  cloudMember: CloudMember,
  membersByNumber: Map<string, CloudMember>,
): Member {
  const sponsor = cloudMember.sponsorMemberNumber
    ? membersByNumber.get(cloudMember.sponsorMemberNumber)
    : undefined;

  return {
    id: cloudMember.id,
    createdAt: cloudMember.createdAt,
    updatedAt: cloudMember.createdAt,
    organizationId: APP_IDS.organizationId,
    herbalifeMemberId: cloudMember.memberNumber,
    displayName: cloudMember.name,
    email: cloudMember.email,
    joinedAt: cloudMember.createdAt,
    sponsorMemberId: sponsor?.id,
    status: "active",
    tags: [],
    rankKey: cloudMember.currentLevel,
    roleKey: cloudMember.role || resolveCloudMemberRole(cloudMember.currentLevel),
  };
}

export function cloudMembersToLocalMembers(cloudMembers: CloudMember[]): Member[] {
  const byNumber = new Map(cloudMembers.map((member) => [member.memberNumber, member]));
  return cloudMembers.map((member) => cloudMemberToLocalMember(member, byNumber));
}
