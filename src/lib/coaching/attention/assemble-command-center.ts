import {
  assessCoachAttention,
  compareCommandCenterCardsByRank,
} from "@/lib/coaching/attention/assess-coach-attention";
import { buildDenseSubmissionCalendar } from "@/lib/coaching/attention/build-dense-submission-calendar";
import {
  coachingJourneyDayNumberInWindow,
  coachingJourneyDayTotal,
  resolveEnrollmentPlannedEndDate,
  resolveEnrollmentStartDate,
} from "@/lib/coaching/enrollment-window";
import { formatAttentionEvidenceSummary,
  formatOutcomeStatusLabel,
  formatRecommendedActionLabel,
} from "@/lib/coaching/attention/command-center-copy";
import { COACHING_NON_REPORTING_POLICY } from "@/lib/coaching/attention/coach-attention-policy";
import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { buildCoachingDecisionContext } from "@/lib/coaching/ai/coaching-signal-engine";
import { buildCoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";
import type { CoachingAiOutputRecord, CoachingInterventionLevel } from "@/types/coaching-ai";
import type {
  CoachingCommandCenterCard,
  CoachingCommandCenterFilter,
} from "@/types/coaching-attention";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";

export type CommandCenterBatchCustomer = {
  enrollment: CoachingEnrollment;
  displayName: string;
  phone: string | null;
  logs: CoachingDailyLogDetail[];
  bodyRecords: BodyCompositionRecord[];
  /** Latest completed AI output for intervention authority (may be null). */
  latestAiOutput: CoachingAiOutputRecord | null;
  /** Today's AI output (any status) — presentation for report state only. */
  todayAiOutput?: CoachingAiOutputRecord | null;
  /** Phase 3d — recent coach actions for ack / suppress. */
  recentCoachActions?: import("@/types/coaching-attention").CoachingRecentCoachAction[];
};

export type AssembleCommandCenterInput = {
  ownerMemberId: string;
  asOfLogDate: string;
  asOfHourTaipei: number;
  customers: CommandCenterBatchCustomer[];
};

export type CoachingCommandCenterResult = {
  asOfLogDate: string;
  asOfHourTaipei: number;
  counts: {
    needsAttention: number;
    watch: number;
    measurementDue: number;
    positiveProgress: number;
    routine: number;
    total: number;
  };
  sections: {
    needsAttention: CoachingCommandCenterCard[];
    watch: CoachingCommandCenterCard[];
    measurementDue: CoachingCommandCenterCard[];
    positiveProgress: CoachingCommandCenterCard[];
    allActive: CoachingCommandCenterCard[];
  };
  /** Audit helper — OpenAI must never be true for Command Center. */
  meta: {
    openaiCalled: false;
    customerCount: number;
    derivation: "deterministic_batch";
  };
};

function emptyTodayLog(enrollment: CoachingEnrollment, logDate: string): CoachingDailyLogDetail {
  return {
    id: `missing-${enrollment.id}-${logDate}`,
    enrollmentId: enrollment.id,
    customerId: enrollment.customerId,
    ownerMemberId: enrollment.ownerMemberId,
    logDate,
    waterMl: null,
    exerciseNote: null,
    bowelMovementCount: null,
    sleepDuration: null,
    sleepBedtime: null,
    sleepWakeTime: null,
    customerNote: null,
    submittedAt: null,
    createdAt: `${logDate}T00:00:00.000Z`,
    updatedAt: `${logDate}T00:00:00.000Z`,
    meals: [],
  };
}

function pickPersistedIntervention(ai: CoachingAiOutputRecord | null): CoachingInterventionLevel | undefined {
  if (!ai || ai.status !== "completed") return undefined;
  return ai.finalInterventionLevel ?? undefined;
}

export function buildCommandCenterCard(input: {
  customer: CommandCenterBatchCustomer;
  asOfLogDate: string;
  asOfHourTaipei: number;
}): CoachingCommandCenterCard {
  const { customer, asOfLogDate, asOfHourTaipei } = input;
  const sortedLogs = [...customer.logs].sort((a, b) => b.logDate.localeCompare(a.logDate));
  const todayLog =
    sortedLogs.find((log) => log.logDate === asOfLogDate) ?? emptyTodayLog(customer.enrollment, asOfLogDate);

  const generationInput = buildCoachingGenerationInput({
    enrollment: customer.enrollment,
    customer: {
      displayName: customer.displayName,
      heightCm: undefined,
      sex: undefined,
      region: undefined,
      occupation: undefined,
    },
    logDate: asOfLogDate,
    todayLog,
    recentLogs: sortedLogs.length > 0 ? sortedLogs : [todayLog],
    bodyRecords: customer.bodyRecords,
    builtAt: `${asOfLogDate}T12:00:00.000Z`,
  });

  const persistedLevel = pickPersistedIntervention(customer.latestAiOutput);
  const decisionContext = buildCoachingDecisionContext({
    generationInput,
    customerVoice: extractCustomerVoiceSignals(generationInput.todayContext.customerNote),
    finalInterventionLevelOverride: persistedLevel,
  });

  const denseCalendar = buildDenseSubmissionCalendar({
    asOfLogDate,
    windowDays: COACHING_NON_REPORTING_POLICY.rollingWindowDays,
    logs: sortedLogs.map((log) => ({
      logDate: log.logDate,
      submitted: Boolean(log.submittedAt),
    })),
    enrollmentStartDate: resolveEnrollmentStartDate(customer.enrollment.startedAt),
    enrollmentPlannedEndDate: resolveEnrollmentPlannedEndDate({
      startedAt: customer.enrollment.startedAt,
      plannedEndAt: customer.enrollment.plannedEndAt,
    }),
  });

  const historicalNotes = sortedLogs.map((log) => ({
    logDate: log.logDate,
    customerNote: log.customerNote,
  }));

  const coachAttention =
    customer.latestAiOutput?.status === "completed" &&
    customer.latestAiOutput.outputJson?.coach.coach_attention_required
      ? {
          required: true as const,
          reason: customer.latestAiOutput.outputJson.coach.attention_reason ?? "persisted_coach_attention",
          evidence: (customer.latestAiOutput.outputJson.coach.evidence ?? []).map((item) => ({
            key: "persisted_evidence",
            value: item,
          })),
        }
      : decisionContext.coachAttention;

  const assessment = assessCoachAttention({
    asOfLogDate,
    asOfHourTaipei,
    daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
    finalInterventionLevel: decisionContext.finalInterventionLevel,
    coachAttention,
    signals: decisionContext.signals,
    outcomeAssessment: decisionContext.outcomeAssessment,
    rollingMemory: generationInput.rollingMemory,
    submissionCalendar: denseCalendar,
    todayCustomerNote: generationInput.todayContext.customerNote,
    historicalCustomerNotes: historicalNotes,
    recentCoachActions: customer.recentCoachActions,
  });

  const progress = buildCoachingProgressView({
    enrollment: customer.enrollment,
    bodyRecords: customer.bodyRecords,
    logDate: asOfLogDate,
  });

  return {
    enrollmentId: customer.enrollment.id,
    customerId: customer.enrollment.customerId,
    customerDisplayName: customer.displayName,
    customerPhone: customer.phone,
    goal: customer.enrollment.goal,
    dayNumber: coachingJourneyDayNumberInWindow({
      startedAt: customer.enrollment.startedAt,
      plannedEndAt: customer.enrollment.plannedEndAt,
      logDate: asOfLogDate,
    }),
    dayTotal: coachingJourneyDayTotal({
      startedAt: customer.enrollment.startedAt,
      plannedEndAt: customer.enrollment.plannedEndAt,
    }),
    outcomeStatus: progress.outcomeStatus,
    outcomeStatusLabel: formatOutcomeStatusLabel(progress.outcomeStatus),
    measurementStage: progress.measurementStage,
    daysSinceLatestMeasurement: progress.daysSinceLatestMeasurement,
    latestMeasurementDate: progress.latestDate,
    assessment,
    evidenceSummary: formatAttentionEvidenceSummary(assessment),
    recommendedActionLabel: formatRecommendedActionLabel(assessment.recommendedActionType),
    detailHref: `/coaching/${customer.enrollment.id}`,
    todaySubmitted: Boolean(todayLog.submittedAt),
    todayAiStatus: customer.todayAiOutput?.status ?? null,
  };
}

export function assembleCommandCenter(input: AssembleCommandCenterInput): CoachingCommandCenterResult {
  // Hard ownership boundary — never assemble another owner's enrollments.
  const owned = input.customers.filter(
    (customer) => customer.enrollment.ownerMemberId === input.ownerMemberId,
  );

  const cards = owned
    .map((customer) =>
      buildCommandCenterCard({
        customer,
        asOfLogDate: input.asOfLogDate,
        asOfHourTaipei: input.asOfHourTaipei,
      }),
    )
    .sort(compareCommandCenterCardsByRank);

  const needsAttention = cards.filter((card) => card.assessment.commandCenterSection === "needs_attention");
  const watch = cards.filter((card) => card.assessment.commandCenterSection === "watch");
  const measurementDue = cards.filter((card) => card.assessment.commandCenterSection === "measurement_due");
  const positiveProgress = cards.filter((card) => card.assessment.commandCenterSection === "positive_progress");
  const routine = cards.filter((card) => card.assessment.commandCenterSection === "routine");

  return {
    asOfLogDate: input.asOfLogDate,
    asOfHourTaipei: input.asOfHourTaipei,
    counts: {
      needsAttention: needsAttention.length,
      watch: watch.length,
      measurementDue: measurementDue.length,
      positiveProgress: positiveProgress.length,
      routine: routine.length,
      total: cards.length,
    },
    sections: {
      needsAttention,
      watch,
      measurementDue,
      positiveProgress,
      allActive: cards,
    },
    meta: {
      openaiCalled: false,
      customerCount: cards.length,
      derivation: "deterministic_batch",
    },
  };
}

export function filterCommandCenterCards(
  cards: CoachingCommandCenterCard[],
  filter: CoachingCommandCenterFilter,
): CoachingCommandCenterCard[] {
  if (filter === "all") return cards;
  return cards.filter((card) => card.assessment.commandCenterSection === filter);
}

export function searchCommandCenterCards(
  cards: CoachingCommandCenterCard[],
  query: string,
): CoachingCommandCenterCard[] {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  const digits = q.replace(/\D/g, "");
  return cards.filter((card) => {
    if (card.customerDisplayName.toLowerCase().includes(q)) return true;
    if (card.goal?.toLowerCase().includes(q)) return true;
    if (card.customerPhone) {
      const phone = card.customerPhone.replace(/\D/g, "");
      if (digits.length >= 3 && phone.includes(digits)) return true;
      if (card.customerPhone.toLowerCase().includes(q)) return true;
    }
    return false;
  });
}
