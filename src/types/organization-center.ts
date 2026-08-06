import type { EntityId } from "./common";

export interface OrganizationNextQualificationView {
  nextRankLabel: string | null;
  currentSummary: string | null;
  remainingSummary: string | null;
}

export interface OrganizationMemberView {
  memberId: EntityId;
  memberNumber: string;
  name: string;
  qualificationLabel: string;
  monthlyVp: number;
  metMonthlyVp2500: boolean;
  monthlyVpTarget: number | null;
  nextQualification: OrganizationNextQualificationView;
  directDownlineCount: number;
  monthlyPoints: number;
  lifetimePoints: number;
  availablePoints: number;
  streakMultiplier: number;
}

export interface OrganizationTreeNode {
  member: OrganizationMemberView;
  children: OrganizationTreeNode[];
}

export interface OrganizationCenterSnapshot {
  referenceDate: string;
  rootMemberId: EntityId;
  roots: OrganizationTreeNode[];
  totalMembers: number;
  computedAt: string;
}
