import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import { clampPercent, isInYearMonth } from "@/lib/business-engine/utils";
import { computeTodayNeeded } from "@/lib/goal-center/projections";
import type { PromotionProgress } from "@/lib/business-engine/calculate-promotion-progress";
import type { VpResult } from "@/lib/business-engine/types";
import type { MonthlyChallengeProgress } from "@/types/monthly-challenge";
import type { RetailTransaction } from "@/types/retail-transaction";
import type { ISODateString, YearMonth } from "@/types";
import type {
  CareerBlueprintView,
  GoalBlueprintResult,
  MemberGoal,
  MemberGoalProgressView,
  MemberGoalType,
} from "@/types/member-goal";
import {
  MEMBER_GOAL_HORIZON_LABELS,
  MEMBER_GOAL_TYPE_LABELS,
  MEMBER_GOAL_TYPE_UNITS,
} from "@/types/member-goal";

export interface MemberGoalMetricsContext {
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  vp: VpResult;
  monthlyChallenge: MonthlyChallengeProgress;
  promotionProgress: PromotionProgress;
}

function resolveGoalCurrentValue(
  type: MemberGoalType,
  metrics: MemberGoalMetricsContext,
  transactions: RetailTransaction[],
): number {
  switch (type) {
    case "monthly_vp":
      return metrics.vp.totalVp;
    case "monthly_income_ntd":
      return transactions
        .filter(
          (transaction) =>
            isInYearMonth(transaction.transactionDate, metrics.yearMonth) &&
            (transaction.transactionTypeKey === RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD ||
              transaction.transactionTypeKey ===
                RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    case "monthly_new_customers": {
      const criterion = metrics.monthlyChallenge.criteria.find(
        (item) => item.criterionKey === RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      );
      if (criterion) {
        return criterion.currentValue;
      }
      return transactions.filter(
        (transaction) =>
          isInYearMonth(transaction.transactionDate, metrics.yearMonth) &&
          transaction.transactionTypeKey === RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
      ).length;
    }
    default:
      return 0;
  }
}

function resolveKpiCategory(type: MemberGoalType): "vp" | "daily_transaction" | "daily_measurement" {
  switch (type) {
    case "monthly_vp":
      return "vp";
    case "monthly_income_ntd":
      return "daily_transaction";
    case "monthly_new_customers":
      return "daily_transaction";
    default:
      return "daily_transaction";
  }
}

function buildGoalTitle(goal: MemberGoal): string {
  const typeLabel = goal.label?.trim() || MEMBER_GOAL_TYPE_LABELS[goal.type];
  const horizonLabel = MEMBER_GOAL_HORIZON_LABELS[goal.horizon];
  return `${horizonLabel} · ${typeLabel}`;
}

export function buildMemberGoalProgressView(
  goal: MemberGoal,
  metrics: MemberGoalMetricsContext,
  transactions: RetailTransaction[],
): MemberGoalProgressView {
  const current = resolveGoalCurrentValue(goal.type, metrics, transactions);
  const target = goal.targetValue;
  const remaining = Math.max(0, target - current);
  const progressPercent = target > 0 ? clampPercent((current / target) * 100) : 0;
  const unit = MEMBER_GOAL_TYPE_UNITS[goal.type];
  const todayNeeded =
    remaining <= 0
      ? 0
      : computeTodayNeeded(
          metrics.referenceDate,
          remaining,
          resolveKpiCategory(goal.type),
        );

  return {
    goalId: goal.id,
    type: goal.type,
    horizon: goal.horizon,
    title: buildGoalTitle(goal),
    description: `目前 ${current.toLocaleString("zh-Hant")} / ${target.toLocaleString("zh-Hant")} ${unit}${
      todayNeeded !== null && remaining > 0 ? ` · 今天建議 ${todayNeeded} ${unit}` : ""
    }`,
    current,
    target,
    remaining,
    progressPercent,
    unit,
    todayNeeded,
    isComplete: remaining <= 0,
    yearMonth: goal.yearMonth,
  };
}

export function buildCareerBlueprintView(
  metrics: MemberGoalMetricsContext,
): CareerBlueprintView | null {
  const progress = metrics.promotionProgress;
  if (
    progress.isMaxRank ||
    progress.isRuleMissing ||
    progress.progressSource !== "downline" ||
    progress.target === null ||
    progress.remaining === null
  ) {
    return null;
  }

  return {
    title: progress.nextRankName
      ? `晉升${progress.nextRankName}`
      : progress.description,
    description: progress.description,
    current: progress.current,
    target: progress.target,
    remaining: progress.remaining,
    progressPercent: progress.progressPercent ?? 0,
    sourceKey: `promotion_${progress.ruleKey ?? progress.currentRankId}`,
    nextRankName: progress.nextRankName,
    ultimateRankName: "總裁",
  };
}

export function buildGoalBlueprint(
  goals: MemberGoal[],
  metrics: MemberGoalMetricsContext,
  transactions: RetailTransaction[],
): GoalBlueprintResult {
  const memberGoals = goals
    .filter((goal) => goal.isActive && goal.yearMonth === metrics.yearMonth)
    .map((goal) => buildMemberGoalProgressView(goal, metrics, transactions))
    .sort((left, right) => {
      const horizonOrder = { short: 0, medium: 1, long: 2 };
      if (horizonOrder[left.horizon] !== horizonOrder[right.horizon]) {
        return horizonOrder[left.horizon] - horizonOrder[right.horizon];
      }
      return left.progressPercent - right.progressPercent;
    });

  const careerGoal = buildCareerBlueprintView(metrics);

  return {
    referenceDate: metrics.referenceDate,
    ultimateGoal: {
      title: "晉升總裁",
      description: careerGoal
        ? `長期路徑：${metrics.promotionProgress.currentRankName} → ${careerGoal.nextRankName ?? "下一階"} → 總裁`
        : "持續擴大組織與業績，邁向總裁組",
    },
    careerGoal,
    memberGoals,
  };
}
