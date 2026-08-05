import type { NextStep } from "@/lib/business-engine/next-step/types";
import type { QualificationConditionResult } from "@/lib/business-engine/qualification/types";
import {
  PROMOTION_RANK_IDS,
  resolvePromotionRankId,
  type PromotionRankId,
} from "@/lib/business-engine/rules/promotion";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import {
  PRESIDENT_ROAD_NODE_DEFINITIONS,
  PRESIDENT_ROAD_STATUS_LABELS,
  PRESIDENT_ROAD_STATUS_SYMBOLS,
  type PresidentRoadNode,
  type PresidentRoadNodeKey,
  type PresidentRoadNodeStatus,
  type PresidentRoadProgressLine,
  type PresidentRoadSnapshot,
} from "@/types/president-road";

const RANK_ROAD_INDEX: Record<string, number> = {
  [RANK_KEYS.NEW_MEMBER]: 0,
  member: 0,
  [RANK_KEYS.SUPERVISOR]: 2,
  [RANK_KEYS.ACTIVE_SUPERVISOR]: 3,
  [RANK_KEYS.WORLD_TEAM]: 4,
  promotion_group: 5,
  wealth_group: 6,
  [RANK_KEYS.PRESIDENT]: 7,
};

const NEXT_RANK_TO_ROAD_INDEX: Partial<Record<PromotionRankId, number>> = {
  [PROMOTION_RANK_IDS.SUPERVISOR]: 2,
  [PROMOTION_RANK_IDS.WORLD_TEAM]: 4,
  [PROMOTION_RANK_IDS.PROMOTION_GROUP]: 5,
  [PROMOTION_RANK_IDS.WEALTH_GROUP]: 6,
  [PROMOTION_RANK_IDS.PRESIDENT]: 7,
};

function getRankRoadIndex(rankKey: string): number {
  return RANK_ROAD_INDEX[rankKey] ?? 0;
}

function findNextStep(metrics: MemberComputedMetrics, stepKey: string): NextStep | null {
  return metrics.nextSteps.find((step) => step.stepKey === stepKey) ?? null;
}

function findConditionResult(
  node: QualificationConditionResult,
  conditionKey: string,
): QualificationConditionResult | null {
  if (node.conditionKey === conditionKey) {
    return node;
  }
  if (!node.children) {
    return null;
  }
  for (const child of node.children) {
    const found = findConditionResult(child, conditionKey);
    if (found) {
      return found;
    }
  }
  return null;
}

function formatStatus(status: PresidentRoadNodeStatus): Pick<
  PresidentRoadNode,
  "status" | "statusLabel" | "statusSymbol"
> {
  return {
    status,
    statusLabel: PRESIDENT_ROAD_STATUS_LABELS[status],
    statusSymbol: PRESIDENT_ROAD_STATUS_SYMBOLS[status],
  };
}

function isNodeCompleted(
  nodeKey: PresidentRoadNodeKey,
  rankKey: string,
  metrics: MemberComputedMetrics,
): boolean {
  const rankIndex = getRankRoadIndex(rankKey);

  switch (nodeKey) {
    case "member":
      return true;
    case "map":
      return rankIndex >= 2;
    case "supervisor":
      return rankIndex >= 2;
    case "active_supervisor":
      return rankIndex >= 3;
    case "world_team":
      return (
        rankIndex >= 4 ||
        metrics.qualificationResults.some(
          (result) => result.ruleKey === "qualification_world_team" && result.isQualified,
        )
      );
    case "promotion_group":
      return rankIndex >= 5;
    case "wealth_group":
      return rankIndex >= 6;
    case "president":
      return rankIndex >= 7 || metrics.promotionProgress.isMaxRank;
    default:
      return false;
  }
}

function resolveActiveMilestoneIndex(rankKey: string, metrics: MemberComputedMetrics): number {
  if (metrics.promotionProgress.isMaxRank) {
    return 7;
  }

  const nextRankId = metrics.promotionProgress.nextRankId;
  if (nextRankId && NEXT_RANK_TO_ROAD_INDEX[nextRankId] !== undefined) {
    const targetIndex = NEXT_RANK_TO_ROAD_INDEX[nextRankId] as number;
    if (nextRankId === PROMOTION_RANK_IDS.SUPERVISOR && getRankRoadIndex(rankKey) <= 0) {
      return 1;
    }
    if (nextRankId === PROMOTION_RANK_IDS.WORLD_TEAM && getRankRoadIndex(rankKey) <= 3) {
      return rankKey === RANK_KEYS.ACTIVE_SUPERVISOR ? 4 : Math.max(2, getRankRoadIndex(rankKey));
    }
    return targetIndex;
  }

  return Math.min(getRankRoadIndex(rankKey) + 1, 7);
}

function resolveNodeStatus(
  nodeKey: PresidentRoadNodeKey,
  nodeIndex: number,
  rankKey: string,
  metrics: MemberComputedMetrics,
  activeIndex: number,
): PresidentRoadNodeStatus {
  if (isNodeCompleted(nodeKey, rankKey, metrics)) {
    return "completed";
  }
  if (nodeIndex === activeIndex) {
    return "in_progress";
  }
  if (nodeIndex < activeIndex) {
    return "completed";
  }
  return "not_started";
}

function buildMemberNode(
  rankKey: string,
  metrics: MemberComputedMetrics,
  activeIndex: number,
): PresidentRoadNode {
  const status = resolveNodeStatus("member", 0, rankKey, metrics, activeIndex);

  return {
    key: "member",
    title: "會員",
    ...formatStatus(status),
    progressPercent: status === "completed" ? 100 : 0,
    lines: [{ label: "狀態", value: "已加入組織" }],
    remainingSummary: null,
  };
}

function buildMapNode(
  rankKey: string,
  metrics: MemberComputedMetrics,
  activeIndex: number,
): PresidentRoadNode {
  const status = resolveNodeStatus("map", 1, rankKey, metrics, activeIndex);
  const vpStep = findNextStep(metrics, "world_team_vp");
  const lines: PresidentRoadProgressLine[] = [];

  if (vpStep) {
    lines.push({
      label: "VP",
      value: `${vpStep.current} / ${vpStep.target} VP`,
      remaining: vpStep.remaining > 0 ? `還差 ${vpStep.remaining} VP` : null,
    });
  }

  const progressPercent =
    vpStep?.progressPercent ??
    (status === "completed" ? 100 : status === "not_started" ? 0 : null);

  return {
    key: "map",
    title: "MAP",
    ...formatStatus(status),
    progressPercent,
    lines,
    remainingSummary:
      vpStep && vpStep.remaining > 0 ? `還差 ${vpStep.remaining} VP` : null,
  };
}

function buildRankMilestoneNode(input: {
  key: PresidentRoadNodeKey;
  title: string;
  nodeIndex: number;
  rankKey: string;
  metrics: MemberComputedMetrics;
  activeIndex: number;
}): PresidentRoadNode {
  const status = resolveNodeStatus(
    input.key,
    input.nodeIndex,
    input.rankKey,
    input.metrics,
    input.activeIndex,
  );

  return {
    key: input.key,
    title: input.title,
    ...formatStatus(status),
    progressPercent: status === "completed" ? 100 : status === "in_progress" ? 50 : 0,
    lines:
      status === "completed"
        ? [{ label: "狀態", value: "已達成" }]
        : [{ label: "狀態", value: input.metrics.promotionProgress.description }],
    remainingSummary: null,
  };
}

function buildWorldTeamNode(
  rankKey: string,
  metrics: MemberComputedMetrics,
  activeIndex: number,
): PresidentRoadNode {
  const status = resolveNodeStatus("world_team", 4, rankKey, metrics, activeIndex);
  const lines: PresidentRoadProgressLine[] = [];

  if (status === "completed") {
    lines.push({ label: "狀態", value: "已達成" });
  } else {
    const qualification = metrics.qualificationResults.find(
      (result) => result.ruleKey === "qualification_world_team",
    );

    if (qualification) {
      const consecutive = findConditionResult(
        qualification.root,
        "world_team_consecutive_months",
      );

      if (consecutive && consecutive.current !== null && consecutive.target !== null) {
        lines.push({
          label: "連續月份",
          value: `${consecutive.current} / ${consecutive.target}`,
          remaining:
            consecutive.remaining !== null && consecutive.remaining > 0
              ? `還需要 ${consecutive.remaining} 個月`
              : null,
        });
      }

      lines.push({
        label: "本月 VP",
        value: `${metrics.vp.totalVp}`,
      });
    } else {
      lines.push({ label: "本月 VP", value: `${metrics.vp.totalVp}` });
    }
  }

  const qualification = metrics.qualificationResults.find(
    (result) => result.ruleKey === "qualification_world_team",
  );

  const progressPercent =
    status === "completed"
      ? 100
      : (qualification?.overallProgressPercent ??
        metrics.promotionProgress.progressPercent ??
        0);

  const primaryGap = status === "completed" ? undefined : qualification?.gaps[0];

  return {
    key: "world_team",
    title: "世界組",
    ...formatStatus(status),
    progressPercent,
    lines,
    remainingSummary: primaryGap
      ? `還差 ${primaryGap.remaining} ${primaryGap.unit}`
      : null,
  };
}

function buildDownlinePromotionNode(input: {
  key: PresidentRoadNodeKey;
  title: string;
  nodeIndex: number;
  targetNextRank: PromotionRankId;
  rankKey: string;
  metrics: MemberComputedMetrics;
  activeIndex: number;
}): PresidentRoadNode {
  const status = resolveNodeStatus(
    input.key,
    input.nodeIndex,
    input.rankKey,
    input.metrics,
    input.activeIndex,
  );
  const promotion = input.metrics.promotionProgress;
  const lines: PresidentRoadProgressLine[] = [];

  if (
    promotion.nextRankId === input.targetNextRank &&
    promotion.progressSource === "downline" &&
    promotion.downlineRankName &&
    promotion.target !== null
  ) {
    lines.push({
      label: promotion.downlineRankName,
      value: `${promotion.current} / ${promotion.target}`,
      remaining:
        promotion.remaining !== null && promotion.remaining > 0
          ? `還差 ${promotion.remaining} 位${promotion.downlineRankName}`
          : null,
    });
  } else if (status === "completed") {
    lines.push({ label: input.title.replace("組", ""), value: "已達成" });
  }

  return {
    key: input.key,
    title: input.title,
    ...formatStatus(status),
    progressPercent:
      promotion.nextRankId === input.targetNextRank
        ? promotion.progressPercent
        : status === "completed"
          ? 100
          : 0,
    lines,
    remainingSummary:
      promotion.nextRankId === input.targetNextRank &&
      promotion.remaining !== null &&
      promotion.downlineRankName
        ? `還差 ${promotion.remaining} 位${promotion.downlineRankName}`
        : null,
  };
}

function calculatePresidentProgress(nodes: PresidentRoadNode[]): number {
  if (nodes.length === 0) {
    return 0;
  }

  const total = nodes.reduce((sum, node) => {
    if (node.status === "completed") {
      return sum + 100;
    }
    if (node.status === "in_progress") {
      return sum + (node.progressPercent ?? 0);
    }
    return sum;
  }, 0);

  return Math.round(total / nodes.length);
}

function buildDistanceToPresidentSummary(
  metrics: MemberComputedMetrics,
  activeIndex: number,
): string | null {
  if (metrics.promotionProgress.isMaxRank) {
    return "已達總裁組";
  }

  const promotion = metrics.promotionProgress;
  if (promotion.nextRankName && promotion.remaining !== null) {
    if (promotion.progressSource === "downline" && promotion.downlineRankName) {
      return `距離${promotion.nextRankName}還差 ${promotion.remaining} 位${promotion.downlineRankName}`;
    }
    return `距離${promotion.nextRankName}還差 ${promotion.remaining}`;
  }

  const remainingNodes = PRESIDENT_ROAD_NODE_DEFINITIONS.length - 1 - activeIndex;
  if (remainingNodes > 0) {
    return `距離總裁組還有 ${remainingNodes} 個階段`;
  }

  return null;
}

export function buildPresidentRoad(
  metrics: MemberComputedMetrics,
  rankKey: string,
): PresidentRoadSnapshot {
  const activeIndex = resolveActiveMilestoneIndex(rankKey, metrics);

  const nodes: PresidentRoadNode[] = [
    buildMemberNode(rankKey, metrics, activeIndex),
    buildMapNode(rankKey, metrics, activeIndex),
    buildRankMilestoneNode({
      key: "supervisor",
      title: "督導",
      nodeIndex: 2,
      rankKey,
      metrics,
      activeIndex,
    }),
    buildRankMilestoneNode({
      key: "active_supervisor",
      title: "活躍督導",
      nodeIndex: 3,
      rankKey,
      metrics,
      activeIndex,
    }),
    buildWorldTeamNode(rankKey, metrics, activeIndex),
    buildDownlinePromotionNode({
      key: "promotion_group",
      title: "推廣組",
      nodeIndex: 5,
      targetNextRank: PROMOTION_RANK_IDS.PROMOTION_GROUP,
      rankKey,
      metrics,
      activeIndex,
    }),
    buildDownlinePromotionNode({
      key: "wealth_group",
      title: "富豪組",
      nodeIndex: 6,
      targetNextRank: PROMOTION_RANK_IDS.WEALTH_GROUP,
      rankKey,
      metrics,
      activeIndex,
    }),
    buildDownlinePromotionNode({
      key: "president",
      title: "總裁組",
      nodeIndex: 7,
      targetNextRank: PROMOTION_RANK_IDS.PRESIDENT,
      rankKey,
      metrics,
      activeIndex,
    }),
  ];

  return {
    referenceDate: metrics.missions.referenceDate,
    presidentProgressPercent: calculatePresidentProgress(nodes),
    distanceToPresidentSummary: buildDistanceToPresidentSummary(metrics, activeIndex),
    nodes,
    presidentAI: metrics.presidentAI,
    todayNextStep: metrics.presidentAI.topPriorities[0] ?? null,
    computedAt: new Date().toISOString(),
  };
}

export function resolvePresidentRoadRankKey(
  memberRankKey: string,
  metrics: MemberComputedMetrics,
): string {
  if (memberRankKey in RANK_ROAD_INDEX) {
    return memberRankKey;
  }

  const promotionRankId = resolvePromotionRankId(memberRankKey);
  if (promotionRankId) {
    return memberRankKey;
  }

  return metrics.promotionProgress.currentRankId ?? memberRankKey;
}
