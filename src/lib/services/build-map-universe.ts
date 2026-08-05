import {
  calculateAchievementEngine,
  calculateLeaderForest,
  calculateMapProgress,
  calculateMonthlyProgress,
  calculateNextSteps,
  calculatePromotionProgress,
  calculateVP,
  toLegacyVpResult,
} from "@/lib/business-engine";
import { calculateMissionEngine } from "@/lib/mission-engine";
import type { ActivityEvent } from "@/lib/business-engine/types";
import {
  buildQualificationContext,
  evaluateAllQualificationRules,
} from "@/lib/business-engine/qualification";
import { DEFAULT_QUALIFICATION_RULES } from "@/lib/business-engine/rules/qualification";
import {
  DEFAULT_PROMOTION_TREE,
  PROMOTION_RANK_IDS,
  resolvePromotionRankId,
  type PromotionRankId,
} from "@/lib/business-engine/rules/promotion";
import type { LeaderForestResult, MapProgressResult } from "@/lib/business-engine/types";
import { isActiveSupervisorDownline } from "@/lib/business-engine/active-supervisor-line";
import { getDirectDownline } from "@/lib/business-engine/utils";
import type { AppMember } from "@/lib/config/app-config";
import { buildMonthlyChallenge } from "@/lib/config/app-config";
import { countDownlineByPromotionRank } from "@/lib/mission-engine";
import { resolvePromotionQualifiedRankIds } from "@/lib/business-engine/promotion/resolve-qualified-ranks";
import type { PresidentAIResult } from "@/types/president-ai";
import type { RetailTransaction } from "@/types/retail-transaction";
import type { EntityId, ISODateString, YearMonth } from "@/types";
import type { LeaderSignal } from "@/lib/business-engine/types";

export type MapUniverseLineStatus = "growing" | "needs_help" | "danger" | "empty";

function resolveSlotCount(map: MapProgressResult, directDownlineCount: number): number {
  if (map.totalLines !== null && !Number.isNaN(map.totalLines)) {
    return map.totalLines;
  }
  return Math.max(directDownlineCount, map.lines.length);
}

export type MapUniverseRankTier = "world_team" | "promotion_group" | "wealth_group" | null;

export interface MapUniverseLine {
  lineIndex: number;
  downlineMemberId: EntityId | null;
  displayName: string | null;
  status: MapUniverseLineStatus;
  rankTier: MapUniverseRankTier;
  rankName: string | null;
  vpTotal: number | null;
  nextRankName: string | null;
  promotionDescription: string | null;
  promotionProgressPercent: number | null;
  presidentSuggestion: string | null;
  recentTransactionLabel: string | null;
  monthlyActive: boolean | null;
  monthlyMissionTitle: string | null;
  isEstablished: boolean;
}

export interface MapUniverseResult {
  layoutSlotCount: number;
  lines: MapUniverseLine[];
  isRuleMissing: boolean;
  computedAt: string;
}

function priorYearMonth(yearMonth: YearMonth): YearMonth {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` as YearMonth;
}

function mapSignalToStatus(
  signal: LeaderSignal | undefined,
  isEstablished: boolean,
): MapUniverseLineStatus {
  if (!isEstablished) {
    return "empty";
  }

  switch (signal) {
    case "improving":
    case "deserves_recognition":
      return "growing";
    case "falling_behind":
      return "danger";
    case "needs_help":
    default:
      return "needs_help";
  }
}

function resolveLineVisualStatus(
  isActiveSupervisor: boolean,
  lineSignal: LeaderSignal | undefined,
  isEstablished: boolean,
): MapUniverseLineStatus {
  if (!isEstablished) {
    return "empty";
  }
  if (isActiveSupervisor) {
    return "growing";
  }
  return mapSignalToStatus(lineSignal, true);
}

function resolveRankTier(promotionRankId: PromotionRankId | null): MapUniverseRankTier {
  switch (promotionRankId) {
    case PROMOTION_RANK_IDS.WORLD_TEAM:
      return "world_team";
    case PROMOTION_RANK_IDS.PROMOTION_GROUP:
      return "promotion_group";
    case PROMOTION_RANK_IDS.WEALTH_GROUP:
      return "wealth_group";
    default:
      return null;
  }
}

function formatRecentTransaction(transaction: RetailTransaction): string {
  if (transaction.currencyCode === "VP" || transaction.transactionTypeKey.includes("_vp")) {
    return `${transaction.customerName} ${transaction.amount} VP`;
  }
  return `${transaction.customerName} NT$${transaction.amount.toLocaleString("zh-Hant")}`;
}

function resolveLineSignal(
  leaderForest: LeaderForestResult,
  downlineMemberId: EntityId,
): LeaderSignal | undefined {
  const directLine = leaderForest.directLines.find(
    (line) => line.rootMemberId === downlineMemberId,
  );
  return directLine?.members.find((member) => member.memberId === downlineMemberId)?.signal;
}

export interface BuildMapUniverseInput {
  leaderMemberId: EntityId;
  organizationId: EntityId;
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  map: MapProgressResult;
  members: AppMember[];
  activities: ActivityEvent[];
  transactions: RetailTransaction[];
  presidentAI: PresidentAIResult;
  retailHouseKey: string | null;
}

/**
 * Assembles MAP Universe render model from existing Engine outputs.
 * Not a Business Engine — orchestrates calculateLeaderForest + per-line Engine calls.
 */
export function buildMapUniverse(input: BuildMapUniverseInput): MapUniverseResult {
  const directDownline = getDirectDownline(input.members, input.leaderMemberId);
  const slotCount = resolveSlotCount(input.map, directDownline.length);
  const challenge = buildMonthlyChallenge(input.yearMonth);
  const priorMonth = priorYearMonth(input.yearMonth);

  const leaderForest = calculateLeaderForest({
    leaderMemberId: input.leaderMemberId,
    yearMonth: input.yearMonth,
    priorYearMonth: priorMonth,
    members: input.members,
    activities: input.activities,
    challenges: [
      {
        ...challenge,
        criteria: challenge.criteria.flatMap((criterion) =>
          criterion.targetValue === null || criterion.targetValue === undefined
            ? []
            : [
                {
                  criterionKey: criterion.criterionKey,
                  label: criterion.label,
                  targetValue: criterion.targetValue,
                  weight: criterion.weight,
                },
              ],
        ),
      },
    ],
  });

  const lines: MapUniverseLine[] = Array.from({ length: slotCount }, (_, lineIndex) => {
    const engineLine = input.map.lines[lineIndex];
    const downlineMemberId =
      engineLine?.downlineMemberId ?? directDownline[lineIndex]?.id ?? null;

    if (!downlineMemberId) {
      return {
        lineIndex,
        downlineMemberId: null,
        displayName: null,
        status: "empty",
        rankTier: null,
        rankName: null,
        vpTotal: null,
        nextRankName: null,
        promotionDescription: null,
        promotionProgressPercent: null,
        presidentSuggestion: null,
        recentTransactionLabel: null,
        monthlyActive: null,
        monthlyMissionTitle: null,
        isEstablished: false,
      };
    }

    const member = input.members.find((item) => item.id === downlineMemberId);
    if (!member) {
      return {
        lineIndex,
        downlineMemberId,
        displayName: null,
        status: "empty",
        rankTier: null,
        rankName: null,
        vpTotal: null,
        nextRankName: null,
        promotionDescription: null,
        promotionProgressPercent: null,
        presidentSuggestion: null,
        recentTransactionLabel: null,
        monthlyActive: engineLine?.isActive ?? null,
        monthlyMissionTitle: null,
        isEstablished: false,
      };
    }

    const memberActivities = input.activities.filter(
      (activity) => activity.memberId === downlineMemberId,
    );
    const vpEngineResult = calculateVP({
      memberId: downlineMemberId,
      organizationId: input.organizationId,
      referenceDate: input.referenceDate,
      yearMonth: input.yearMonth,
      retailHouseKey: input.retailHouseKey,
      transactions: input.transactions.map((transaction) => ({
        id: transaction.id,
        memberId: transaction.memberId,
        transactionDate: transaction.transactionDate,
        transactionTypeKey: transaction.transactionTypeKey,
        amount: transaction.amount,
        productKey: transaction.productKey ?? null,
        retailHouseKey: transaction.retailHouseKey,
      })),
      members: input.members,
    });
    const vp = toLegacyVpResult(vpEngineResult);

    const lineMap = calculateMapProgress({
      memberId: downlineMemberId,
      yearMonth: input.yearMonth,
      members: input.members,
      activities: input.activities,
    });

    const qualificationContext = buildQualificationContext({
      memberId: downlineMemberId,
      referenceDate: input.referenceDate,
      yearMonth: input.yearMonth,
      members: input.members,
      activities: memberActivities,
      vpTransactions: vpEngineResult.transactions,
      vpTotal: vpEngineResult.snapshot.buckets.qualification.amount,
      organizationVpTotal: vpEngineResult.snapshot.buckets.organization.amount,
      mapProgressPercent: lineMap.progressPercent,
      mapTarget: lineMap.totalLines,
      activeLines: lineMap.activeLines,
      activeLineTarget: lineMap.totalLines,
    });
    const qualificationResults = evaluateAllQualificationRules(
      qualificationContext,
      DEFAULT_QUALIFICATION_RULES,
      member.rankKey,
    );

    const promotionProgress = calculatePromotionProgress({
      member: { id: downlineMemberId, rankKey: member.rankKey },
      organization: {
        organizationId: input.organizationId,
        members: input.members,
      },
      qualificationResults,
    });

    const monthlyChallenge = calculateMonthlyProgress({
      memberId: downlineMemberId,
      yearMonth: input.yearMonth,
      challenge,
      activities: memberActivities,
      transactions: input.transactions.map((transaction) => ({
        memberId: transaction.memberId,
        transactionDate: transaction.transactionDate,
        transactionTypeKey: transaction.transactionTypeKey,
        amount: transaction.amount,
      })),
      vpTransactions: vpEngineResult.transactions,
    });

    const { nextSteps } = calculateNextSteps({
      referenceDate: input.referenceDate,
      activities: memberActivities,
      vp,
      map: lineMap,
      monthlyChallenge,
      promotionProgress,
      qualificationResults,
    });

    const downlinePromotionRankCounts = countDownlineByPromotionRank(
      input.members,
      downlineMemberId,
    );
    const promotionQualifiedRankIds = resolvePromotionQualifiedRankIds(
      member.rankKey,
      undefined,
      qualificationResults,
    );

    const gamification = calculateAchievementEngine({
      memberId: downlineMemberId,
      referenceDate: input.referenceDate,
      yearMonth: input.yearMonth,
      currentRankKey: member.rankKey,
      activities: memberActivities,
      transactions: input.transactions
        .filter((transaction) => transaction.memberId === downlineMemberId)
        .map((transaction) => ({
          transactionDate: transaction.transactionDate,
          transactionTypeKey: transaction.transactionTypeKey,
          amount: transaction.amount,
        })),
      vpTotal: vp.totalVp,
      mapActiveLines: lineMap.activeLines,
      monthlyChallengePercent: monthlyChallenge.overallProgressPercent,
      downlineRankCounts: downlinePromotionRankCounts,
      qualificationResults,
    });

    const missions = calculateMissionEngine({
      memberId: downlineMemberId,
      referenceDate: input.referenceDate,
      nextSteps,
      monthlyChallenge,
      gamification,
      promotionProgress,
      qualificationResults,
      activities: memberActivities,
      transactions: input.transactions
        .filter((transaction) => transaction.memberId === downlineMemberId)
        .map((transaction) => ({
          transactionDate: transaction.transactionDate,
          transactionTypeKey: transaction.transactionTypeKey,
          amount: transaction.amount,
        })),
      vpTotal: vp.totalVp,
      mapActiveLines: lineMap.activeLines,
      currentRankKey: member.rankKey,
      qualifiedRankKeys: gamification.qualifiedRankKeys,
      downlineRankCounts: downlinePromotionRankCounts,
      promotionQualifiedRankIds,
    });

    const recentTransaction = input.transactions
      .filter((transaction) => transaction.memberId === downlineMemberId)
      .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))[0];

    const promotionRankId = resolvePromotionRankId(member.rankKey);
    const rankName =
      promotionRankId !== null
        ? DEFAULT_PROMOTION_TREE.ranks[promotionRankId]?.name ?? member.rankKey
        : member.rankKey;

    const lineSignal = resolveLineSignal(leaderForest, downlineMemberId);
    const isActiveSupervisor = isActiveSupervisorDownline(
      member.rankKey,
      qualificationResults,
    );
    const presidentSuggestion =
      input.presidentAI.topPriorities.find((priority) =>
        priority.sourceKey.includes(String(downlineMemberId)),
      )?.title ??
      nextSteps[0]?.title ??
      input.presidentAI.topPriorities[0]?.title ??
      promotionProgress.description;

    return {
      lineIndex,
      downlineMemberId,
      displayName: member.nickname ?? member.displayName,
      status: resolveLineVisualStatus(isActiveSupervisor, lineSignal, true),
      rankTier: resolveRankTier(promotionRankId),
      rankName,
      vpTotal: vp.totalVp,
      nextRankName: promotionProgress.nextRankName,
      promotionDescription: promotionProgress.description,
      promotionProgressPercent: promotionProgress.progressPercent,
      presidentSuggestion,
      recentTransactionLabel: recentTransaction
        ? formatRecentTransaction(recentTransaction)
        : null,
      monthlyActive: isActiveSupervisor,
      monthlyMissionTitle: missions.dailyMissionSet.missions[0]?.title ?? null,
      isEstablished: true,
    };
  });

  return {
    layoutSlotCount: slotCount,
    lines,
    isRuleMissing: false,
    computedAt: new Date().toISOString(),
  };
}
