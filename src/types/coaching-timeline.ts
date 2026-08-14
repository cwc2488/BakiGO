import type { CoachingDayUiStatus } from "@/lib/coaching/coaching-day-status";
import type { CoachingInterventionLevel } from "@/types/coaching-ai";
import type { CoachingOutcomeStatus } from "@/types/coaching-signals";

export const COACHING_TIMELINE_EVENT_TYPES = [
  "daily_report",
  "body_measurement",
  "intervention_change",
  "coach_action",
] as const;

export type CoachingTimelineEventType = (typeof COACHING_TIMELINE_EVENT_TYPES)[number];

export const COACHING_TIMELINE_FILTERS = [
  "all",
  "daily_report",
  "body_measurement",
  "attention",
  "coach_action",
] as const;

export type CoachingTimelineFilter = (typeof COACHING_TIMELINE_FILTERS)[number];

export const COACHING_EVIDENCE_REF_KINDS = [
  "daily_log",
  "meal",
  "customer_note",
  "sleep",
  "hydration",
  "ai_signal",
  "body_measurement",
  "intervention",
  "missing_day",
] as const;

export type CoachingEvidenceRefKind = (typeof COACHING_EVIDENCE_REF_KINDS)[number];

/** Structured evidence pointer — never natural-language-only. */
export type CoachingEvidenceRef = {
  kind: CoachingEvidenceRefKind;
  logDate?: string | null;
  sourceId?: string | null;
  metricKey?: string | null;
  displayValue?: string | number | boolean | null;
  reasonCode?: string | null;
};

export type CoachingTimelineMealSlotSummary = {
  mealSlot: string;
  mealSlotLabel: string;
  textNote: string | null;
  hasPhoto: boolean;
  photoStoragePath: string | null;
  mealEntryId: string | null;
  /** Signed URL only after explicit expand — never in initial timeline page. */
  signedUrl?: string | null;
};

export type CoachingTimelineDailyReportPayload = {
  kind: "daily_report" | "missing_streak";
  dayStatus: CoachingDayUiStatus;
  dayStatusLabel: string;
  /** For missing_streak: every missing Asia/Taipei date (traceability). */
  missingDates?: string[];
  customerReport: {
    waterMl: number | null;
    sleepBedtime: string | null;
    sleepWakeTime: string | null;
    sleepDuration: string | null;
    exerciseNote: string | null;
    bowelMovementCount: number | null;
    customerNote: string | null;
    meals: CoachingTimelineMealSlotSummary[];
  } | null;
  aiCustomer: {
    todayFeedback: string | null;
    tomorrowFocus: string | null;
    adjustmentPriorities: string[];
    encouragement: string | null;
  } | null;
  coachBrief: {
    dailySummary: string | null;
    recurringIssue: string | null;
    improvedIssue: string | null;
    attentionReason: string | null;
    evidence: string[];
  } | null;
  interventionLevel: CoachingInterventionLevel | null;
  aiStatus: string | null;
  dailyLogId: string | null;
};

export type CoachingTimelineMeasurementPayload = {
  kind: "baseline" | "comparison";
  measurementId: string;
  recordDate: string;
  outcomeStatus: CoachingOutcomeStatus | null;
  outcomeLabel: string | null;
  summary: string;
  metrics: Array<{
    key: string;
    label: string;
    unit: string;
    previous: number | null;
    current: number | null;
    delta: number | null;
  }>;
};

export type CoachingTimelineInterventionChangePayload = {
  fromLevel: CoachingInterventionLevel | null;
  toLevel: CoachingInterventionLevel;
  reason: string;
  evidenceRefs: CoachingEvidenceRef[];
};

export type CoachingTimelineCoachActionPayload = {
  actionId: string;
  actionType: string;
  status: string;
  statusLabel: string;
  note: string | null;
  relatedReasonCodes: string[];
  relatedReasonLabel: string | null;
};

export type CoachingTimelineEvent =
  | {
      id: string;
      enrollmentId: string;
      type: "daily_report";
      occurredAt: string;
      logDate: string;
      dayNumber: number | null;
      title: string;
      summary: string | null;
      evidenceRefs: CoachingEvidenceRef[];
      /** Stable sort key within same day (lower = earlier in newest→oldest? higher first when desc) */
      sortRank: number;
      attentionLinked: boolean;
      payload: CoachingTimelineDailyReportPayload;
    }
  | {
      id: string;
      enrollmentId: string;
      type: "body_measurement";
      occurredAt: string;
      logDate: string;
      dayNumber: number | null;
      title: string;
      summary: string | null;
      evidenceRefs: CoachingEvidenceRef[];
      sortRank: number;
      attentionLinked: boolean;
      payload: CoachingTimelineMeasurementPayload;
    }
  | {
      id: string;
      enrollmentId: string;
      type: "intervention_change";
      occurredAt: string;
      logDate: string;
      dayNumber: number | null;
      title: string;
      summary: string | null;
      evidenceRefs: CoachingEvidenceRef[];
      sortRank: number;
      attentionLinked: boolean;
      payload: CoachingTimelineInterventionChangePayload;
    }
  | {
      id: string;
      enrollmentId: string;
      type: "coach_action";
      occurredAt: string;
      logDate?: string;
      dayNumber: number | null;
      title: string;
      summary: string | null;
      evidenceRefs: CoachingEvidenceRef[];
      sortRank: number;
      attentionLinked: boolean;
      payload: CoachingTimelineCoachActionPayload;
    };

export type CoachingTimelinePage = {
  enrollmentId: string;
  asOfLogDate: string;
  filter: CoachingTimelineFilter;
  events: CoachingTimelineEvent[];
  nextCursor: string | null;
  hasMore: boolean;
  focusDates: string[];
  reasonCodes: string[];
  meta: {
    openaiCalled: false;
    queryCount?: number;
    nPlusOne: false;
  };
};
