export const RADAR_DAILY_PIPELINE_ID = "radar_daily_pipeline_v1" as const;

export const GLOBAL_CANDIDATE_LIFECYCLE_STATES = [
  "active",
  "cooling",
  "excluded",
  "stale",
] as const;

export type GlobalCandidateLifecycleState =
  (typeof GLOBAL_CANDIDATE_LIFECYCLE_STATES)[number];

export const MEMBER_DEVELOPMENT_STATES = [
  "in_progress",
  "succeeded",
  "failed",
  "already_known",
  "gave_up",
] as const;

export type MemberDevelopmentState = (typeof MEMBER_DEVELOPMENT_STATES)[number];

export const RADAR_JOB_TYPES = [
  "discover",
  "enrich",
  "normalize",
  "analyze",
  "score",
  "rank",
  "daily_pipeline",
] as const;

export type RadarJobType = (typeof RADAR_JOB_TYPES)[number];

export const RADAR_JOB_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
] as const;

export type RadarJobStatus = (typeof RADAR_JOB_STATUSES)[number];

export const PIPELINE_RUN_STATUSES = [
  "pending",
  "running",
  "success",
  "partial_success",
  "failed",
] as const;

export type PipelineRunStatus = (typeof PIPELINE_RUN_STATUSES)[number];

export const RETRYABLE_ERROR_CODES = [
  "RATE_LIMIT",
  "NETWORK",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_5XX",
  "LLM_INVALID_JSON",
  "TRANSIENT_DB",
] as const;

export type RetryableErrorCode = (typeof RETRYABLE_ERROR_CODES)[number];

export const RE_RECOMMENDATION_TRIGGERS = [
  "new_relevant_need",
  "change_window_increased",
  "solution_gap_opened",
  "new_natural_entry",
  "meaningful_score_increase",
  "material_public_content_change",
] as const;

export type ReRecommendationTrigger = (typeof RE_RECOMMENDATION_TRIGGERS)[number];

export function isGlobalLifecycleState(
  value: string,
): value is GlobalCandidateLifecycleState {
  return (GLOBAL_CANDIDATE_LIFECYCLE_STATES as readonly string[]).includes(value);
}

export function isMemberDevelopmentState(
  value: string,
): value is MemberDevelopmentState {
  return (MEMBER_DEVELOPMENT_STATES as readonly string[]).includes(value);
}

/** Member development removes candidate from THIS member's recommendations only. */
export function isExcludedFromMemberRecommendations(input: {
  development_state: MemberDevelopmentState | null;
  excluded_from_recommendations: boolean;
}): boolean {
  if (input.excluded_from_recommendations) return true;
  if (!input.development_state) return false;
  return (
    input.development_state === "in_progress" ||
    input.development_state === "succeeded" ||
    input.development_state === "failed" ||
    input.development_state === "already_known" ||
    input.development_state === "gave_up"
  );
}
