import {
  DEFAULT_PROMOTION_TREE,
  MEMBER_RANK_TO_PROMOTION_RANK,
  resolvePromotionRankId,
} from "@/lib/business-engine/rules/promotion";
import {
  DEFAULT_VP_RULES,
  resolveVpTargetAmount,
  VP_TARGET_KEYS,
} from "@/lib/business-engine/rules/vp";
import { getDirectDownline } from "@/lib/business-engine/utils";
import { getMemberDisplayName, getMemberRankLabel } from "@/lib/members/member-service";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { Member } from "@/types/member";
import type {
  OrganizationCenterSnapshot,
  OrganizationMemberView,
  OrganizationNextQualificationView,
  OrganizationTreeNode,
} from "@/types/organization-center";
import type { EntityId } from "@/types";

const ACTIVE_SUPERVISOR_RANK_KEY = "active_supervisor";

export function resolveMonthlyVpTarget(): number | null {
  return resolveVpTargetAmount(
    VP_TARGET_KEYS.QUALIFICATION_WORLD_TEAM_PERSONAL,
    DEFAULT_VP_RULES,
  );
}

export function resolveOrganizationQualificationLabel(
  member: Member,
  metrics: MemberComputedMetrics,
): string {
  if (member.rankKey === ACTIVE_SUPERVISOR_RANK_KEY) {
    return getMemberRankLabel(member.rankKey);
  }

  const promotionRankId = resolvePromotionRankId(member.rankKey);
  if (promotionRankId) {
    const promotionName = metrics.promotionProgress.currentRankName;
    if (promotionName) {
      return promotionName;
    }
    return DEFAULT_PROMOTION_TREE.ranks[promotionRankId]?.name ?? getMemberRankLabel(member.rankKey);
  }

  return getMemberRankLabel(member.rankKey);
}

export function buildOrganizationNextQualificationView(
  metrics: MemberComputedMetrics,
): OrganizationNextQualificationView {
  const promotion = metrics.promotionProgress;

  if (promotion.isMaxRank) {
    return {
      nextRankLabel: null,
      currentSummary: null,
      remainingSummary: null,
    };
  }

  if (!promotion.nextRankName) {
    return {
      nextRankLabel: null,
      currentSummary: null,
      remainingSummary: null,
    };
  }

  if (promotion.isRuleMissing || promotion.target === null || promotion.remaining === null) {
    return {
      nextRankLabel: promotion.nextRankName,
      currentSummary: promotion.description || null,
      remainingSummary: null,
    };
  }

  if (promotion.progressSource === "downline" && promotion.downlineRankName) {
    return {
      nextRankLabel: promotion.nextRankName,
      currentSummary: `${promotion.current} / ${promotion.target} ${promotion.downlineRankName}`,
      remainingSummary: `${promotion.remaining} 位${promotion.downlineRankName}`,
    };
  }

  const primaryGap = promotion.qualificationResult?.gaps[0];
  const unit = primaryGap?.unit ?? "VP";

  return {
    nextRankLabel: promotion.nextRankName,
    currentSummary: `${promotion.current} ${unit}`,
    remainingSummary: `${promotion.remaining} ${unit}`,
  };
}

export function buildOrganizationMemberView(
  member: Member,
  metrics: MemberComputedMetrics,
  allMembers: Member[],
): OrganizationMemberView {
  const monthlyVpTarget = resolveMonthlyVpTarget();
  const monthlyVp = metrics.vp.totalVp;

  return {
    memberId: member.id,
    memberNumber: member.herbalifeMemberId,
    name: getMemberDisplayName(member),
    qualificationLabel: resolveOrganizationQualificationLabel(member, metrics),
    monthlyVp,
    metMonthlyVp2500:
      monthlyVpTarget !== null ? monthlyVp >= monthlyVpTarget : false,
    monthlyVpTarget,
    nextQualification: buildOrganizationNextQualificationView(metrics),
    directDownlineCount: getDirectDownline(allMembers, member.id).length,
    monthlyPoints: metrics.gamification.points.monthlyPoints,
    lifetimePoints: metrics.gamification.points.lifetimePoints,
    availablePoints: metrics.gamification.points.availablePoints,
    streakMultiplier: metrics.gamification.points.streakMultiplier,
  };
}

export function buildOrganizationTreeNode(
  member: Member,
  metrics: MemberComputedMetrics,
  allMembers: Member[],
  metricsByMemberId: Map<EntityId, MemberComputedMetrics>,
): OrganizationTreeNode {
  const children = getDirectDownline(allMembers, member.id)
    .map((child) => {
      const childMetrics = metricsByMemberId.get(child.id);
      if (!childMetrics) {
        return null;
      }
      return buildOrganizationTreeNode(child, childMetrics, allMembers, metricsByMemberId);
    })
    .filter((node): node is OrganizationTreeNode => node !== null)
    .sort((left, right) => left.member.name.localeCompare(right.member.name, "zh-Hant"));

  return {
    member: buildOrganizationMemberView(member, metrics, allMembers),
    children,
  };
}

export function findOrganizationRoots(members: Member[]): Member[] {
  const memberIds = new Set(members.map((member) => member.id));

  return members
    .filter((member) => !member.sponsorMemberId || !memberIds.has(member.sponsorMemberId))
    .sort((left, right) =>
      getMemberDisplayName(left).localeCompare(getMemberDisplayName(right), "zh-Hant"),
    );
}

export function buildViewerOrganizationSnapshot(input: {
  viewer: Member;
  members: Member[];
  metricsByMemberId: Map<EntityId, MemberComputedMetrics>;
  referenceDate: string;
}): OrganizationCenterSnapshot {
  const viewerMetrics = input.metricsByMemberId.get(input.viewer.id);
  if (!viewerMetrics) {
    throw new Error(`Missing metrics for viewer: ${input.viewer.id}`);
  }

  const root = buildOrganizationTreeNode(
    input.viewer,
    viewerMetrics,
    input.members,
    input.metricsByMemberId,
  );

  return {
    referenceDate: input.referenceDate,
    rootMemberId: input.viewer.id,
    roots: [root],
    totalMembers: input.members.length,
    computedAt: new Date().toISOString(),
  };
}

export function buildOrganizationCenterSnapshot(input: {
  members: Member[];
  metricsByMemberId: Map<EntityId, MemberComputedMetrics>;
  rootMemberId: EntityId;
  referenceDate: string;
}): OrganizationCenterSnapshot {
  const roots = findOrganizationRoots(input.members)
    .map((member) => {
      const metrics = input.metricsByMemberId.get(member.id);
      if (!metrics) {
        return null;
      }
      return buildOrganizationTreeNode(
        member,
        metrics,
        input.members,
        input.metricsByMemberId,
      );
    })
    .filter((node): node is OrganizationTreeNode => node !== null);

  return {
    referenceDate: input.referenceDate,
    rootMemberId: input.rootMemberId,
    roots,
    totalMembers: input.members.length,
    computedAt: new Date().toISOString(),
  };
}

export function findMemberSubtree(
  nodes: OrganizationTreeNode[],
  memberId: EntityId,
): OrganizationTreeNode | null {
  for (const node of nodes) {
    if (node.member.memberId === memberId) {
      return node;
    }
    const found = findMemberSubtree(node.children, memberId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function isPromotionRankKey(rankKey: string): boolean {
  return rankKey in MEMBER_RANK_TO_PROMOTION_RANK;
}
