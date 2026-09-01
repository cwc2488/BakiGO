export const DAILY_REPORT_STATES = ["NO_REPORT", "PARTIAL_REPORT", "COMPLETE_REPORT"] as const;
export type DailyReportState = (typeof DAILY_REPORT_STATES)[number];

export const FREE_TEXT_CLASSES = [
  "OBSERVED_FACT",
  "INTENT_OR_PLAN",
  "FEELING",
  "QUESTION",
  "PREFERENCE",
  "CONCERN",
  "AMBIGUOUS",
] as const;
export type FreeTextClass = (typeof FREE_TEXT_CLASSES)[number];

export const MEASUREMENT_COMPARISON_STATES = [
  "INSUFFICIENT_DATA",
  "UNCHANGED",
  "INCREASED",
  "DECREASED",
] as const;
export type MeasurementComparisonState = (typeof MEASUREMENT_COMPARISON_STATES)[number];

export const SHARE_READINESS_STATES = [
  "NOT_ENOUGH_DATA",
  "NOT_READY",
  "POSSIBLE_SIGNAL",
  "READY",
] as const;
export type ShareReadinessState = (typeof SHARE_READINESS_STATES)[number];

export const COACH_EVIDENCE_TYPES = [
  "structured_daily_log",
  "meal_log",
  "measurement",
  "customer_free_text",
  "coach_note",
  "historical_pattern",
] as const;
export type CoachEvidenceType = (typeof COACH_EVIDENCE_TYPES)[number];

export type CoachEvidence = {
  type: CoachEvidenceType;
  summary: string;
  sourceDate: string | null;
  rawExcerpt?: string | null;
};

export type CoachAiConclusion = {
  conclusion: string;
  confidence: "high" | "medium" | "low";
  evidence: CoachEvidence[];
};

export type DailyFactMark = "done" | "missing" | "partial" | "not_applicable";

export type DailyFactRow = {
  key: string;
  label: string;
  mark: DailyFactMark;
  value: string;
};

export type ClassifiedFreeText = {
  text: string;
  class: FreeTextClass;
  confidence: "high" | "medium" | "low";
  /** Coach-facing label. Null = show as raw note, never 「感受」. */
  displayLabel: string | null;
  mentionedWaterMl: number | null;
};

export type MetricComparison = {
  key: string;
  label: string;
  unit: string;
  state: MeasurementComparisonState;
  baseline: number | null;
  latest: number | null;
  displayLine: string;
};

export type CoachNextAction = {
  priority:
    | "question"
    | "safety"
    | "incomplete_item"
    | "adherence"
    | "progress"
    | "encouragement"
    | "none";
  title: string;
  body: string;
  cta: string | null;
  showRecordAction: boolean;
  missingItems: string[];
};
