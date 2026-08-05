import type { PromotionRankId } from "../rules/promotion";
import type { QualificationMetricKey } from "../rules/qualification";

export interface QualificationConditionResult {
  conditionKey: string;
  metric: QualificationMetricKey | "composite";
  operator?: string;
  label: string;
  current: number | null;
  target: number | null;
  remaining: number | null;
  progressPercent: number | null;
  isSatisfied: boolean;
  isRuleMissing: boolean;
  children?: QualificationConditionResult[];
}

export interface QualificationGap {
  gapKey: string;
  conditionKey: string;
  metric: QualificationMetricKey;
  label: string;
  current: number;
  target: number;
  remaining: number;
  progressPercent: number;
  unit: string;
  targetRankId: PromotionRankId;
  targetRankName: string;
}

export interface QualificationResult {
  ruleKey: string;
  name: string;
  targetRankId: PromotionRankId;
  targetRankName: string;
  description: string;
  isQualified: boolean;
  isRuleMissing: boolean;
  overallProgressPercent: number | null;
  root: QualificationConditionResult;
  gaps: QualificationGap[];
  computedAt: Date;
}

export interface QualificationMonthlySnapshot {
  yearMonth: string;
  vp: number;
  organizationVp: number;
  mapProgressPercent: number | null;
  activeLines: number;
  activityCounts: Record<string, number>;
  downlineRankCounts: Record<string, number>;
}

export interface QualificationEvaluationContext {
  memberId: string;
  referenceDate: string;
  yearMonth: string;
  vpTotal: number;
  organizationVpTotal: number;
  mapProgressPercent: number | null;
  mapTarget: number | null;
  activeLines: number;
  activeLineTarget: number | null;
  activityCounts: Record<string, number>;
  downlineRankCounts: Record<string, number>;
  /** Direct (first-generation) downline count. */
  firstGenerationCount: number;
  /** Direct downline who reached qualifying lifetime VP within one year of joining. */
  qualifiedRecruitCount: number;
  /** Lifetime MAP meeting attendance — any meeting type counts, repeats allowed. */
  meetingCount: number;
  monthlySnapshots: QualificationMonthlySnapshot[];
}
