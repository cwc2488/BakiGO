import { isPromotionCoveredByNextSteps } from "@/lib/business-engine/next-step/promotion-step-dedupe";
import type { NextStep } from "@/lib/business-engine/next-step/types";
import type { PromotionProgress } from "@/lib/business-engine/calculate-promotion-progress";
import type { QualificationGap } from "@/lib/business-engine/qualification/types";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { formatPriorityCategoryLabel } from "@/lib/president-ai/display-labels";
import type { Mission } from "@/types/mission";
import type { Priority } from "@/types/president-ai";
import {
  GOAL_KPI_DEFINITIONS,
  type GoalCard,
  type GoalCenterResult,
  type GoalKpiCategory,
} from "@/types/goal-center";
import {
  kpiColor,
  kpiIconKey,
  resolveKpiCategoryFromQualificationMetric,
  resolveKpiCategoryFromStepKey,
} from "./kpi-mapping";
import { computeTodayNeeded, estimateCompletionDate } from "./projections";

function findKpiLabel(category: GoalKpiCategory): string {
  return GOAL_KPI_DEFINITIONS.find((item) => item.key === category)?.label ?? category;
}

function findPriorityCategory(category: GoalKpiCategory) {
  return GOAL_KPI_DEFINITIONS.find((item) => item.key === category)?.priorityCategory ?? "QUALIFICATION";
}

function buildGoalCard(input: {
  id: string;
  kpiCategory: GoalKpiCategory;
  title: string;
  description: string;
  current: number;
  target: number;
  remaining: number;
  progressPercent: number;
  unit: string;
  priority: number;
  rewardXP: number;
  sourceKey: string;
  referenceDate: string;
  isRuleMissing?: boolean;
}): GoalCard {
  const kpiCategory = input.kpiCategory;

  return {
    id: input.id,
    kpiCategory,
    kpiLabel: findKpiLabel(kpiCategory),
    title: input.title,
    description: input.description,
    current: input.current,
    target: input.target,
    remaining: input.remaining,
    progressPercent: input.progressPercent,
    unit: input.unit,
    todayNeeded: input.isRuleMissing
      ? null
      : computeTodayNeeded(input.referenceDate, input.remaining, kpiCategory),
    estimatedCompletionDate: input.isRuleMissing
      ? null
      : estimateCompletionDate(
          input.referenceDate,
          input.current,
          input.remaining,
          kpiCategory,
        ),
    priority: input.priority,
    rewardXP: input.rewardXP,
    isRuleMissing: input.isRuleMissing ?? false,
    sourceKey: input.sourceKey,
  };
}

function buildGoalFromNextStep(step: NextStep, referenceDate: string): GoalCard {
  const kpiCategory = resolveKpiCategoryFromStepKey(step.stepKey);

  return buildGoalCard({
    id: step.stepKey,
    kpiCategory,
    title: step.title,
    description: step.description,
    current: step.current,
    target: step.target,
    remaining: step.remaining,
    progressPercent: step.progressPercent,
    unit: inferUnit(step),
    priority: step.priority,
    rewardXP: step.rewardXP,
    sourceKey: step.stepKey,
    referenceDate,
  });
}

function buildGoalFromGap(gap: QualificationGap, referenceDate: string): GoalCard {
  const kpiCategory = resolveKpiCategoryFromQualificationMetric(gap.metric);

  return buildGoalCard({
    id: `gap_${gap.gapKey}`,
    kpiCategory,
    title: gap.label,
    description: `${gap.targetRankName} · 目前 ${gap.current} / ${gap.target} ${gap.unit}`,
    current: gap.current,
    target: gap.target,
    remaining: gap.remaining,
    progressPercent: gap.progressPercent,
    unit: gap.unit,
    priority: 0,
    rewardXP: 0,
    sourceKey: gap.gapKey,
    referenceDate,
  });
}

function buildGoalFromPromotion(
  promotion: PromotionProgress,
  referenceDate: string,
): GoalCard | null {
  if (
    promotion.isMaxRank ||
    promotion.isRuleMissing ||
    promotion.target === null ||
    promotion.remaining === null ||
    promotion.progressPercent === null
  ) {
    return null;
  }

  return buildGoalCard({
    id: `promotion_${promotion.nextRankId ?? promotion.ruleKey ?? "unknown"}`,
    kpiCategory: "qualification",
    title: promotion.nextRankName ?? promotion.description,
    description: promotion.description,
    current: promotion.current,
    target: promotion.target,
    remaining: promotion.remaining,
    progressPercent: promotion.progressPercent,
    unit: "位",
    priority: 1,
    rewardXP: 0,
    sourceKey: `promotion_${promotion.nextRankId ?? "progress"}`,
    referenceDate,
  });
}

function inferUnit(step: NextStep): string {
  if (step.stepKey.includes("vp")) {
    return "VP";
  }
  if (step.stepKey.includes("map")) {
    return "位";
  }
  if (step.stepKey === "daily_measurement" || step.stepKey === "daily_consultation") {
    return "位";
  }
  return "次";
}

function dedupeGoals(goals: GoalCard[]): GoalCard[] {
  const seen = new Set<string>();
  return goals.filter((goal) => {
    if (seen.has(goal.id)) {
      return false;
    }
    seen.add(goal.id);
    return true;
  });
}

function collectGoals(metrics: MemberComputedMetrics): GoalCard[] {
  const referenceDate = metrics.missions.referenceDate;
  const fromNextSteps = metrics.nextSteps.map((step) => buildGoalFromNextStep(step, referenceDate));

  const fromGaps = metrics.qualificationResults.flatMap((result) =>
    result.gaps.map((gap) => buildGoalFromGap(gap, referenceDate)),
  );

  const fromPromotion = isPromotionCoveredByNextSteps(metrics.nextSteps, metrics.promotionProgress)
    ? null
    : buildGoalFromPromotion(metrics.promotionProgress, referenceDate);

  const combined = dedupeGoals([
    ...fromNextSteps,
    ...fromGaps,
    ...(fromPromotion ? [fromPromotion] : []),
  ]);

  return combined.sort((left, right) => left.priority - right.priority);
}

function buildPriorities(goals: GoalCard[]): Priority[] {
  return goals.slice(0, 3).map((goal) => ({
    title: goal.title,
    description: goal.description,
    score: goal.progressPercent,
    category: findPriorityCategory(goal.kpiCategory),
    expectedImpact: goal.remaining,
    sourceKey: goal.sourceKey,
  }));
}

function buildMissions(goals: GoalCard[], referenceDate: string): Mission[] {
  return goals.slice(0, 5).map((goal, index) => ({
    id: `goal-mission-${goal.id}`,
    title: goal.title,
    subtitle: goal.kpiLabel,
    description: goal.description,
    category: goal.kpiCategory,
    priority: goal.priority || index + 1,
    difficulty: "standard",
    icon: kpiIconKey(goal.kpiCategory),
    color: kpiColor(goal.kpiCategory),
    current: goal.current,
    target: goal.target,
    remaining: goal.remaining,
    progress: goal.progressPercent,
    xp: goal.rewardXP,
    rewards: [],
    deadline: referenceDate,
    status: goal.remaining > 0 ? "in_progress" : "completed",
    sourceKey: "goal_center",
    sourceId: goal.sourceKey,
  }));
}

function buildReasoning(priorities: Priority[]): string[] {
  if (priorities.length === 0) {
    return ["目標中心尚無可排序目標，請先記錄成交或完成活動。"];
  }

  const reasoning = [
    `今日最高優先：${priorities[0].title}（${formatPriorityCategoryLabel(priorities[0].category)}，完成度 ${priorities[0].score}%）`,
  ];

  if (priorities.length > 1) {
    reasoning.push(
      `次要優先：${priorities
        .slice(1)
        .map((item) => item.title)
        .join("、")}`,
    );
  }

  return reasoning;
}

export function buildGoalCenter(metrics: MemberComputedMetrics): GoalCenterResult {
  const goals = collectGoals(metrics);
  const topPriorities = buildPriorities(goals);
  const dailyMissions = buildMissions(goals, metrics.missions.referenceDate);

  return {
    memberId: metrics.memberId,
    referenceDate: metrics.missions.referenceDate,
    goals,
    topPriorities,
    dailyMissions,
    nextSteps: goals,
    reasoning: buildReasoning(topPriorities),
    computedAt: new Date().toISOString(),
  };
}

export function loadGoalCenter(
  metrics: MemberComputedMetrics,
): GoalCenterResult {
  return buildGoalCenter(metrics);
}
