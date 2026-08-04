import type {
  EntityId,
  EntityMetadata,
  StoredEntity,
  Timestamp,
  YearMonth,
} from "./common";

/**
 * A single measurable target within a monthly challenge.
 *
 * The `criterionKey` references a rule defined in docs/BUSINESS_RULES.md.
 * Progress toward each criterion is computed from source activity records.
 */
export interface ChallengeCriterion {
  /** Rule identifier, e.g. "measurement_count", "consultation_count". */
  criterionKey: string;

  /** Display label, e.g. "量測". */
  label: string;

  /** Target value for the month. Null until defined in docs/BUSINESS_RULES.md. */
  targetValue: number | null;

  /** Optional unit hint for display, e.g. "次", "元". */
  unit?: string;

  /** Relative weight when rolling up overall challenge progress (default: 1). */
  weight?: number;
}

/**
 * Persisted monthly challenge definition for an organization.
 *
 * Stores targets only — member progress is computed, never stored here.
 */
export interface MonthlyChallenge extends StoredEntity {
  organizationId: EntityId;

  /** Challenge period, e.g. "2026-08". */
  yearMonth: YearMonth;

  /** Display title, e.g. "本月挑戰". */
  title: string;

  /** Optional short description shown on the dashboard. */
  description?: string;

  /** Configurable criteria; rules live in docs, not in code. */
  criteria: ChallengeCriterion[];

  /** When false, challenge is hidden but data is retained. */
  isActive: boolean;

  metadata?: EntityMetadata;
}

/** Fields required to create a monthly challenge. */
export interface MonthlyChallengeCreateInput {
  organizationId: EntityId;
  yearMonth: YearMonth;
  title: string;
  description?: string;
  criteria: ChallengeCriterion[];
  isActive?: boolean;
  metadata?: EntityMetadata;
}

/** Partial update for challenge configuration. */
export interface MonthlyChallengeUpdateInput {
  title?: string;
  description?: string;
  criteria?: ChallengeCriterion[];
  isActive?: boolean;
  metadata?: EntityMetadata;
}

/** Progress for one criterion — computed at read time. */
export interface ChallengeCriterionProgress {
  criterionKey: string;
  label: string;
  currentValue: number;
  targetValue: number;
  unit?: string;
  progressPercent: number;
}

/**
 * Derived monthly challenge progress for a member — never persisted.
 */
export interface MonthlyChallengeProgress {
  memberId: EntityId;
  challengeId: EntityId;
  yearMonth: YearMonth;
  title: string;
  overallProgressPercent: number;
  criteria: ChallengeCriterionProgress[];
  computedAt: Timestamp;
}
