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
  avatarUrl?: string | null;
  qualificationLabel: string;
  monthlyVp: number;
  /**
   * ready = authoritative total available (may be 0)
   * empty = no RH rows for month
   * error = read/calc failed (UI must not present as a real 0)
   */
  productVpStatus?: "ready" | "empty" | "error";
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
