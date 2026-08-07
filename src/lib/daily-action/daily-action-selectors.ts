import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { ACTIVITY_KEYS, RANK_KEYS } from "@/lib/business-engine/rules/keys";
import type { NextStep } from "@/lib/business-engine/next-step/types";
import {
  clampPercent,
  countActivitiesByKey,
  criterionProgress,
  filterActivitiesByMember,
  filterActivitiesByYearMonth,
} from "@/lib/business-engine/utils";
import { projectEventsForEngines } from "@/lib/event-center/project-events";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import { createEventRepository } from "@/lib/repositories/event-repository";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { loadMemberSuperLeagueEntries } from "@/lib/daily-action/super-league-entries";
import {
  buildSuperLeagueMetricView,
  calculateSuperLeagueCompletion,
} from "@/lib/daily-action/super-league-selectors";
import type {
  DailyActionMetricView,
  DailyActionSnapshot,
  DailyActionSuperLeagueView,
} from "@/types/daily-action";

function findNextStep(metrics: MemberComputedMetrics, stepKey: string): NextStep | undefined {
  return metrics.nextSteps.find((step) => step.stepKey === stepKey);
}

function toMetricViewFromStep(step: NextStep | undefined): DailyActionMetricView | null {
  if (!step) {
    return null;
  }

  return {
    current: step.current,
    target: step.target,
    progressPercent: step.progressPercent,
    isRuleMissing: false,
  };
}

function countMonthlyActivities(
  metrics: MemberComputedMetrics,
  activityKey: string,
  storage: StorageAdapter,
): number {
  const projected = projectEventsForEngines(createEventRepository(storage).getAll());
  const periodActivities = filterActivitiesByYearMonth(
    filterActivitiesByMember(projected.activities, metrics.memberId),
    metrics.yearMonth,
  );
  return countActivitiesByKey(periodActivities, activityKey);
}

function resolveMonthlyActivityMetric(
  metrics: MemberComputedMetrics,
  activityKey: string,
  stepKey: string,
  storage: StorageAdapter,
): DailyActionMetricView {
  const fromStep = toMetricViewFromStep(findNextStep(metrics, stepKey));
  if (fromStep) {
    return fromStep;
  }

  const current = countMonthlyActivities(metrics, activityKey, storage);
  const criterion = DEFAULT_BUSINESS_RULES.rankQualification[RANK_KEYS.NEW_MEMBER]?.criteria.find(
    (item) => item.criterionKey === activityKey,
  );
  const target = criterion?.targetValue ?? null;

  if (target === null) {
    return {
      current,
      target: null,
      progressPercent: null,
      isRuleMissing: true,
    };
  }

  return {
    current,
    target,
    progressPercent: criterionProgress(current, target),
    isRuleMissing: false,
  };
}

function buildSuperLeagueView(
  metrics: MemberComputedMetrics,
  storage: StorageAdapter,
): DailyActionSuperLeagueView {
  const year = new Date(`${metrics.missions.referenceDate}T12:00:00`).getFullYear();
  const entries = loadMemberSuperLeagueEntries(storage, metrics.memberId, year);
  const rules = DEFAULT_BUSINESS_RULES.superLeague;

  const firstGeneration = buildSuperLeagueMetricView(entries.length, rules.firstGenerationTarget);
  const supervisor = buildSuperLeagueMetricView(
    entries.filter((entry) => entry.isSupervisor).length,
    rules.supervisorTarget,
  );

  return {
    firstGeneration,
    supervisor,
    completionPercent: calculateSuperLeagueCompletion(firstGeneration, supervisor),
    entries: entries.map((entry) => ({
      id: entry.id,
      displayName: entry.displayName,
      isSupervisor: entry.isSupervisor,
    })),
  };
}

export function buildDailyActionSnapshot(
  metrics: MemberComputedMetrics,
  storage: StorageAdapter,
): DailyActionSnapshot {
  const topPriority = metrics.presidentAI.topPriorities[0];

  return {
    referenceDate: metrics.missions.referenceDate,
    yearMonth: metrics.yearMonth,
    monthlyMeasurement: resolveMonthlyActivityMetric(
      metrics,
      ACTIVITY_KEYS.MEASUREMENT,
      "monthly_criterion_measurement",
      storage,
    ),
    monthlyConsultation: resolveMonthlyActivityMetric(
      metrics,
      ACTIVITY_KEYS.CONSULTATION,
      "monthly_criterion_consultation",
      storage,
    ),
    superLeague: buildSuperLeagueView(metrics, storage),
    presidentAiTitle:
      topPriority?.title ?? metrics.presidentAI.focusMode.label ?? "今日尚無建議",
    presidentAiDescription: topPriority?.description ?? null,
    topPriority: topPriority ?? null,
  };
}

export function formatDailyActionProgress(
  current: number,
  target: number | null,
): string {
  if (target === null) {
    return `${current.toLocaleString("zh-Hant")} / —`;
  }
  return `${current.toLocaleString("zh-Hant")} / ${target.toLocaleString("zh-Hant")}`;
}

export function formatDailyActionPercent(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `${clampPercent(value)}%`;
}
