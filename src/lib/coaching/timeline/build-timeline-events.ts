import {
  COACHING_DAY_UI_STATUS_LABELS,
  mapCoachingDayUiStatus,
} from "@/lib/coaching/coaching-day-status";
import { COACHING_MEAL_SLOT_LABELS, PRIMARY_MEAL_SLOTS } from "@/types/coaching";
import type { CoachingDailyLogDetail } from "@/types/coaching";
import type { CoachingAiOutputRecord, CoachingInterventionLevel } from "@/types/coaching-ai";
import type { BodyCompositionRecord } from "@/types/customer";
import type { CoachingCoachActionRecord } from "@/types/coaching-coach-actions";
import {
  COACHING_OUTCOME_STATUS_LABELS,
  interpretFatLossOutcome,
  resolveMeasurementStage,
} from "@/lib/coaching/ai/assess-coaching-outcome";
import { buildOutcomeMemoryForProgress } from "@/lib/coaching/ai/build-outcome-memory";
import { coachingJourneyDayNumber } from "@/lib/coaching/list-coaching-recent-day-summaries";
import { buildCoachActionTimelineEvents } from "@/lib/coaching/timeline/build-coach-action-timeline-events";
import type {
  CoachingEvidenceRef,
  CoachingTimelineEvent,
  CoachingTimelineFilter,
  CoachingTimelineMealSlotSummary,
} from "@/types/coaching-timeline";

/** Same-day stable ranks (newest→oldest primary by date; within day higher sortRank first). */
export const TIMELINE_SORT_RANK = {
  body_measurement: 300,
  intervention_change: 200,
  daily_report: 100,
  coach_action: 50,
  missing_streak: 90,
} as const;

export type TimelineBuildInput = {
  enrollmentId: string;
  enrollmentStartedAt: string;
  baselineBodyRecordId: string | null;
  asOfLogDate: string;
  /** Inclusive journey start date (usually enrollment start date). */
  journeyStartDate: string;
  logs: CoachingDailyLogDetail[];
  aiOutputs: CoachingAiOutputRecord[];
  bodyRecords: BodyCompositionRecord[];
  /** Phase 3d — persisted coach actions (internal memory). */
  coachActions?: CoachingCoachActionRecord[];
  /** Current attention evidence dates (from Command Center) — marks attentionLinked. */
  focusDates?: string[];
  reasonCodes?: string[];
};

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}-${String(anchor.getUTCDate()).padStart(2, "0")}`;
}

function listDatesInclusive(fromDate: string, toDate: string): string[] {
  if (fromDate > toDate) return [];
  const out: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    out.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return out;
}

function dayNumber(startedAt: string, logDate: string): number | null {
  return coachingJourneyDayNumber({ enrollmentStartedAt: startedAt, logDate });
}

function mealSummaries(log: CoachingDailyLogDetail): CoachingTimelineMealSlotSummary[] {
  return PRIMARY_MEAL_SLOTS.map((slot) => {
    const meal = log.meals.find((item) => item.mealSlot === slot) ?? null;
    return {
      mealSlot: slot,
      mealSlotLabel: COACHING_MEAL_SLOT_LABELS[slot],
      textNote: meal?.textNote?.trim() || null,
      hasPhoto: Boolean(meal?.photo?.storagePath),
      photoStoragePath: meal?.photo?.storagePath ?? null,
      mealEntryId: meal?.id ?? null,
    };
  });
}

function buildDailyReportEvent(input: {
  enrollmentId: string;
  enrollmentStartedAt: string;
  log: CoachingDailyLogDetail;
  ai: CoachingAiOutputRecord | null;
  focusSet: Set<string>;
}): CoachingTimelineEvent {
  const status = mapCoachingDayUiStatus({
    hasLog: true,
    submittedAt: input.log.submittedAt,
    aiStatus: input.ai?.status ?? "missing",
  });
  const note = input.log.customerNote?.trim() || null;
  const focus = input.ai?.outputJson?.customer.tomorrow_focus?.trim() || null;
  const summaryParts = [COACHING_DAY_UI_STATUS_LABELS[status]];
  if (focus) summaryParts.push(`今日焦點：${focus}`);
  if (note) summaryParts.push(`Customer：「${note.slice(0, 40)}${note.length > 40 ? "…" : ""}」`);

  const evidenceRefs: CoachingEvidenceRef[] = [
    { kind: "daily_log", logDate: input.log.logDate, sourceId: input.log.id },
  ];
  if (note) {
    evidenceRefs.push({
      kind: "customer_note",
      logDate: input.log.logDate,
      sourceId: input.log.id,
      displayValue: note,
    });
  }
  if (input.log.sleepBedtime) {
    evidenceRefs.push({
      kind: "sleep",
      logDate: input.log.logDate,
      metricKey: "sleep_bedtime",
      displayValue: input.log.sleepBedtime,
    });
  }

  return {
    id: `daily_report:${input.log.logDate}`,
    enrollmentId: input.enrollmentId,
    type: "daily_report",
    occurredAt: input.log.submittedAt ?? input.log.updatedAt ?? `${input.log.logDate}T12:00:00.000Z`,
    logDate: input.log.logDate,
    dayNumber: dayNumber(input.enrollmentStartedAt, input.log.logDate),
    title: `${formatShort(input.log.logDate)}${dayNumber(input.enrollmentStartedAt, input.log.logDate) != null ? ` · Day ${dayNumber(input.enrollmentStartedAt, input.log.logDate)}` : ""}`,
    summary: summaryParts.join(" · "),
    evidenceRefs,
    sortRank: TIMELINE_SORT_RANK.daily_report,
    attentionLinked: input.focusSet.has(input.log.logDate),
    payload: {
      kind: "daily_report",
      dayStatus: status,
      dayStatusLabel: COACHING_DAY_UI_STATUS_LABELS[status],
      customerReport: {
        waterMl: input.log.waterMl,
        sleepBedtime: input.log.sleepBedtime,
        sleepWakeTime: input.log.sleepWakeTime,
        sleepDuration: input.log.sleepDuration,
        exerciseNote: input.log.exerciseNote,
        bowelMovementCount: input.log.bowelMovementCount,
        customerNote: note,
        meals: mealSummaries(input.log),
      },
      aiCustomer:
        input.ai?.status === "completed" && input.ai.outputJson
          ? {
              todayFeedback: input.ai.outputJson.customer.today_feedback ?? null,
              tomorrowFocus: input.ai.outputJson.customer.tomorrow_focus ?? null,
              adjustmentPriorities: input.ai.outputJson.customer.adjustment_priorities ?? [],
              encouragement: input.ai.outputJson.customer.encouragement ?? null,
            }
          : input.ai?.status === "failed"
            ? {
                todayFeedback: null,
                tomorrowFocus: null,
                adjustmentPriorities: [],
                encouragement: null,
              }
            : null,
      coachBrief:
        input.ai?.status === "completed" && input.ai.outputJson
          ? {
              dailySummary: input.ai.outputJson.coach.daily_summary ?? null,
              recurringIssue: input.ai.outputJson.coach.recurring_issue ?? null,
              improvedIssue: input.ai.outputJson.coach.improved_issue ?? null,
              attentionReason: input.ai.outputJson.coach.attention_reason ?? null,
              evidence: input.ai.outputJson.coach.evidence ?? [],
            }
          : null,
      interventionLevel: input.ai?.finalInterventionLevel ?? null,
      aiStatus: input.ai?.status ?? null,
    },
  };
}

function buildMissingStreakEvent(input: {
  enrollmentId: string;
  enrollmentStartedAt: string;
  dates: string[];
  focusSet: Set<string>;
}): CoachingTimelineEvent {
  const dates = [...input.dates].sort();
  const end = dates[dates.length - 1]!;
  const start = dates[0]!;
  const evidenceRefs: CoachingEvidenceRef[] = dates.map((logDate) => ({
    kind: "missing_day" as const,
    logDate,
    displayValue: "missing",
    reasonCode: "non_reporting",
  }));
  return {
    id: `missing_streak:${start}:${end}`,
    enrollmentId: input.enrollmentId,
    type: "daily_report",
    occurredAt: `${end}T23:59:59.000Z`,
    logDate: end,
    dayNumber: dayNumber(input.enrollmentStartedAt, end),
    title:
      dates.length === 1
        ? `${formatShort(end)} · 未回報`
        : `${formatShort(start)}–${formatShort(end)} · 連續 ${dates.length} 天未完成回報`,
    summary: `連續 ${dates.length} 天未完成回報`,
    evidenceRefs,
    sortRank: TIMELINE_SORT_RANK.missing_streak,
    attentionLinked: dates.some((date) => input.focusSet.has(date)),
    payload: {
      kind: "missing_streak",
      dayStatus: "not_started",
      dayStatusLabel: COACHING_DAY_UI_STATUS_LABELS.not_started,
      missingDates: dates,
      customerReport: null,
      aiCustomer: null,
      coachBrief: null,
      interventionLevel: null,
      aiStatus: null,
    },
  };
}

function formatShort(logDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(logDate);
  if (!match) return logDate;
  return `${Number(match[2])}/${Number(match[3])}`;
}

function outcomeLabel(status: string | null): string | null {
  if (!status) return null;
  return (COACHING_OUTCOME_STATUS_LABELS as Record<string, string>)[status] ?? status;
}

export function buildMeasurementTimelineEvents(input: {
  enrollmentId: string;
  enrollmentStartedAt: string;
  baselineBodyRecordId: string | null;
  bodyRecords: BodyCompositionRecord[];
  focusSet: Set<string>;
}): CoachingTimelineEvent[] {
  const sortedAsc = [...input.bodyRecords].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
  const events: CoachingTimelineEvent[] = [];

  for (let index = 0; index < sortedAsc.length; index += 1) {
    const current = sortedAsc[index]!;
    const previous = index > 0 ? sortedAsc[index - 1]! : null;
    const subset = sortedAsc.slice(0, index + 1).reverse();
    const memory = buildOutcomeMemoryForProgress({
      bodyRecords: subset,
      baselineBodyRecordId: input.baselineBodyRecordId,
    });
    const stage = resolveMeasurementStage({
      baseline: memory.baselineMeasurement,
      latest: memory.latestMeasurement,
      measurementCount: memory.measurementCount,
      daysBetweenMeasurements: memory.daysBetweenMeasurements,
    });

    if (!previous || stage === "baseline_only" || memory.measurementCount <= 1) {
      events.push({
        id: `body_measurement:${current.id}`,
        enrollmentId: input.enrollmentId,
        type: "body_measurement",
        occurredAt: typeof current.createdAt === "string" && current.createdAt
          ? current.createdAt
          : `${current.recordDate}T12:00:00.000Z`,
        logDate: current.recordDate,
        dayNumber: dayNumber(input.enrollmentStartedAt, current.recordDate),
        title: `${formatShort(current.recordDate)} · 起始量測（Baseline）`,
        summary: "已建立起始量測。完成下一次回測後才能比較身體變化。",
        evidenceRefs: [
          {
            kind: "body_measurement",
            logDate: current.recordDate,
            sourceId: current.id,
            metricKey: "baseline",
            displayValue: current.recordDate,
          },
        ],
        sortRank: TIMELINE_SORT_RANK.body_measurement,
        attentionLinked: input.focusSet.has(current.recordDate),
        payload: {
          kind: "baseline",
          measurementId: current.id,
          recordDate: current.recordDate,
          outcomeStatus: "not_yet_measurable",
          outcomeLabel: outcomeLabel("not_yet_measurable"),
          summary: "起始量測（Baseline）。不得視為 flat 或 0 change。",
          metrics: [
            { key: "weightKg", label: "體重", unit: "kg", previous: null, current: current.weightKg, delta: null },
            {
              key: "bodyFatPercent",
              label: "體脂",
              unit: "%",
              previous: null,
              current: current.bodyFatPercent,
              delta: null,
            },
            {
              key: "skeletalMuscleKg",
              label: "肌肉",
              unit: "kg",
              previous: null,
              current: current.skeletalMuscleKg,
              delta: null,
            },
          ],
        },
      });
      continue;
    }

    const deltas = memory.trendDeltas;
    const interpreted = interpretFatLossOutcome(deltas);
    events.push({
      id: `body_measurement:${current.id}`,
      enrollmentId: input.enrollmentId,
      type: "body_measurement",
      occurredAt: typeof current.createdAt === "string" && current.createdAt
          ? current.createdAt
          : `${current.recordDate}T12:00:00.000Z`,
      logDate: current.recordDate,
      dayNumber: dayNumber(input.enrollmentStartedAt, current.recordDate),
      title: `${formatShort(current.recordDate)} · 第 ${index + 1} 次量測`,
      summary: interpreted.reasons[0] ?? `Outcome：${interpreted.status}`,
      evidenceRefs: [
        {
          kind: "body_measurement",
          logDate: current.recordDate,
          sourceId: current.id,
          metricKey: "outcome",
          displayValue: interpreted.status,
          reasonCode: "body_outcome",
        },
      ],
      sortRank: TIMELINE_SORT_RANK.body_measurement,
      attentionLinked: input.focusSet.has(current.recordDate),
      payload: {
        kind: "comparison",
        measurementId: current.id,
        recordDate: current.recordDate,
        outcomeStatus: interpreted.status,
        outcomeLabel: outcomeLabel(interpreted.status),
        summary: interpreted.reasons.join(" ") || memory.trendSummary || "身體組成相較前次量測出現變化。",
        metrics: [
          {
            key: "weightKg",
            label: "體重",
            unit: "kg",
            previous: previous.weightKg,
            current: current.weightKg,
            delta:
              previous.weightKg != null && current.weightKg != null
                ? Math.round((current.weightKg - previous.weightKg) * 10) / 10
                : null,
          },
          {
            key: "bodyFatPercent",
            label: "體脂",
            unit: "%",
            previous: previous.bodyFatPercent,
            current: current.bodyFatPercent,
            delta:
              previous.bodyFatPercent != null && current.bodyFatPercent != null
                ? Math.round((current.bodyFatPercent - previous.bodyFatPercent) * 10) / 10
                : null,
          },
          {
            key: "skeletalMuscleKg",
            label: "肌肉",
            unit: "kg",
            previous: previous.skeletalMuscleKg,
            current: current.skeletalMuscleKg,
            delta:
              previous.skeletalMuscleKg != null && current.skeletalMuscleKg != null
                ? Math.round((current.skeletalMuscleKg - previous.skeletalMuscleKg) * 10) / 10
                : null,
          },
        ],
      },
    });
  }

  return events;
}

/**
 * Derive intervention_change only when consecutive completed AI days have different
 * final_intervention_level. Does not invent history when outputs are missing.
 */
export function buildInterventionChangeEvents(input: {
  enrollmentId: string;
  enrollmentStartedAt: string;
  aiOutputs: CoachingAiOutputRecord[];
  focusSet: Set<string>;
}): CoachingTimelineEvent[] {
  const completed = input.aiOutputs
    .filter((row) => row.status === "completed" && row.finalInterventionLevel)
    .sort((a, b) => a.logDate.localeCompare(b.logDate));

  const events: CoachingTimelineEvent[] = [];
  for (let i = 1; i < completed.length; i += 1) {
    const prev = completed[i - 1]!;
    const curr = completed[i]!;
    if (prev.finalInterventionLevel === curr.finalInterventionLevel) continue;
    const fromLevel = prev.finalInterventionLevel as CoachingInterventionLevel;
    const toLevel = curr.finalInterventionLevel as CoachingInterventionLevel;
    events.push({
      id: `intervention_change:${curr.logDate}:${fromLevel}->${toLevel}`,
      enrollmentId: input.enrollmentId,
      type: "intervention_change",
      occurredAt: curr.completedAt ?? `${curr.logDate}T12:00:00.000Z`,
      logDate: curr.logDate,
      dayNumber: dayNumber(input.enrollmentStartedAt, curr.logDate),
      title: `介入等級 ${fromLevel} → ${toLevel}`,
      summary: `依 ${curr.logDate} 的 deterministic final_intervention_level 相對前次 ${prev.logDate} 變化。`,
      evidenceRefs: [
        {
          kind: "intervention",
          logDate: curr.logDate,
          sourceId: curr.id,
          metricKey: "final_intervention_level",
          displayValue: `${fromLevel}->${toLevel}`,
        },
        {
          kind: "intervention",
          logDate: prev.logDate,
          sourceId: prev.id,
          metricKey: "previous_final_intervention_level",
          displayValue: fromLevel,
        },
      ],
      sortRank: TIMELINE_SORT_RANK.intervention_change,
      attentionLinked: input.focusSet.has(curr.logDate),
      payload: {
        fromLevel,
        toLevel,
        reason: `persisted_ai_output_level_change:${prev.logDate}->${curr.logDate}`,
        evidenceRefs: [
          {
            kind: "intervention",
            logDate: curr.logDate,
            sourceId: curr.id,
            displayValue: toLevel,
          },
        ],
      },
    });
  }
  return events;
}

export function compareTimelineEventsNewestFirst(a: CoachingTimelineEvent, b: CoachingTimelineEvent): number {
  const dateA = a.logDate ?? a.occurredAt.slice(0, 10);
  const dateB = b.logDate ?? b.occurredAt.slice(0, 10);
  if (dateA !== dateB) return dateB.localeCompare(dateA);
  if (a.sortRank !== b.sortRank) return b.sortRank - a.sortRank;
  return a.id.localeCompare(b.id);
}

/**
 * Build full normalized timeline events for an enrollment journey window.
 * Missing days are consolidated into streak cards; evidenceRefs retain every date.
 */
export function buildCoachingTimelineEvents(input: TimelineBuildInput): CoachingTimelineEvent[] {
  const focusSet = new Set(input.focusDates ?? []);
  const logByDate = new Map(input.logs.map((log) => [log.logDate, log]));
  const aiByDate = new Map(input.aiOutputs.map((row) => [row.logDate, row]));

  const journeyDates = listDatesInclusive(input.journeyStartDate, input.asOfLogDate);
  const events: CoachingTimelineEvent[] = [];

  let missingRun: string[] = [];
  const flushMissing = () => {
    if (missingRun.length === 0) return;
    events.push(
      buildMissingStreakEvent({
        enrollmentId: input.enrollmentId,
        enrollmentStartedAt: input.enrollmentStartedAt,
        dates: missingRun,
        focusSet,
      }),
    );
    missingRun = [];
  };

  for (const logDate of journeyDates) {
    const log = logByDate.get(logDate) ?? null;
    const hasDraftContent =
      log != null &&
      (log.meals.some((meal) => Boolean(meal.textNote?.trim()) || Boolean(meal.photo)) ||
        log.waterMl != null ||
        Boolean(log.customerNote?.trim()) ||
        Boolean(log.sleepBedtime) ||
        Boolean(log.exerciseNote?.trim()));
    const isMissing = !log || (!log.submittedAt && !hasDraftContent);
    if (isMissing) {
      missingRun.push(logDate);
      continue;
    }

    flushMissing();
    events.push(
      buildDailyReportEvent({
        enrollmentId: input.enrollmentId,
        enrollmentStartedAt: input.enrollmentStartedAt,
        log: log!,
        ai: aiByDate.get(logDate) ?? null,
        focusSet,
      }),
    );
  }
  flushMissing();

  events.push(
    ...buildMeasurementTimelineEvents({
      enrollmentId: input.enrollmentId,
      enrollmentStartedAt: input.enrollmentStartedAt,
      baselineBodyRecordId: input.baselineBodyRecordId,
      bodyRecords: input.bodyRecords,
      focusSet,
    }),
  );
  events.push(
    ...buildInterventionChangeEvents({
      enrollmentId: input.enrollmentId,
      enrollmentStartedAt: input.enrollmentStartedAt,
      aiOutputs: input.aiOutputs,
      focusSet,
    }),
  );

  events.push(
    ...buildCoachActionTimelineEvents({
      enrollmentId: input.enrollmentId,
      enrollmentStartedAt: input.enrollmentStartedAt,
      actions: input.coachActions ?? [],
      focusSet,
      reasonCodes: input.reasonCodes,
    }),
  );

  return events.sort(compareTimelineEventsNewestFirst);
}

export function filterTimelineEvents(
  events: CoachingTimelineEvent[],
  filter: CoachingTimelineFilter,
): CoachingTimelineEvent[] {
  if (filter === "all") return events;
  if (filter === "attention") {
    return events.filter((event) => event.attentionLinked);
  }
  if (filter === "coach_action") {
    return events.filter((event) => event.type === "coach_action");
  }
  return events.filter((event) => event.type === filter);
}

export function paginateTimelineEvents(input: {
  events: CoachingTimelineEvent[];
  cursor: string | null;
  limit: number;
}): { events: CoachingTimelineEvent[]; nextCursor: string | null; hasMore: boolean } {
  const limit = Math.max(1, Math.min(input.limit, 50));
  let start = 0;
  if (input.cursor) {
    const idx = input.events.findIndex((event) => event.id === input.cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const slice = input.events.slice(start, start + limit);
  const last = slice[slice.length - 1] ?? null;
  const hasMore = start + limit < input.events.length;
  return {
    events: slice,
    nextCursor: hasMore && last ? last.id : null,
    hasMore,
  };
}

export function extractFocusDatesFromAttentionEvidence(input: {
  evidenceItems?: Array<{ key: string; value: string | number | boolean | null }>;
  evidenceBlocks?: Array<{ type: string; items: Array<{ key: string; value: string | number | boolean | null }>; date?: string | null }>;
  consecutiveMissedCompletedDays?: number;
  asOfLogDate?: string;
}): string[] {
  const dates = new Set<string>();
  for (const block of input.evidenceBlocks ?? []) {
    if (block.date) dates.add(block.date);
    for (const item of block.items) {
      if (item.key === "missed_dates" && typeof item.value === "string") {
        for (const part of item.value.split(",")) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(part)) dates.add(part);
        }
      }
      if (item.key === "hunger_dates" && typeof item.value === "string") {
        for (const part of item.value.split(",")) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(part)) dates.add(part);
        }
      }
      if (item.key === "late_sleep_dates" && typeof item.value === "string") {
        for (const part of item.value.split(",")) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(part)) dates.add(part);
        }
      }
      if (typeof item.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.value)) {
        dates.add(item.value);
      }
    }
  }
  for (const item of input.evidenceItems ?? []) {
    if (typeof item.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.value)) {
      dates.add(item.value);
    }
  }
  return [...dates].sort();
}
