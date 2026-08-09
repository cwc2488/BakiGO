import type { GlobalCandidateLifecycleState } from "../jobs/constants";

export const REFRESH_REASON_CODES = [
  "new_candidate",
  "source_freshness_expired",
  "stale_candidate_recovery",
  "near_top20_competitive",
  "new_discovery_hit",
  "cooling_refresh_interval",
  "force_refresh",
] as const;

export type RefreshReasonCode = (typeof REFRESH_REASON_CODES)[number];

export type CandidateRefreshInput = {
  candidate_id: string;
  lifecycle_state: GlobalCandidateLifecycleState;
  refresh_tier: "priority" | "standard" | "cooling";
  is_new_candidate: boolean;
  source_freshness_expired: boolean;
  is_stale_recovery: boolean;
  near_top20_competitive: boolean;
  new_discovery_hit: boolean;
  force_refresh: boolean;
  last_enriched_at: string | null;
  cooling_interval_days: number;
};

export type RefreshQueueItem = {
  candidate_id: string;
  priority_score: number;
  reason_codes: RefreshReasonCode[];
  planned_phases: Array<"enrich" | "normalize">;
};

export type MemberKeywordPlan = {
  member_id: string;
  keyword_id: string;
  phrase: string;
  discovery_weight: number;
  allocation_order: number;
};

export type DiscoveryPlan = {
  member_id: string;
  keywords: MemberKeywordPlan[];
};

export type ActiveMember = {
  member_id: string;
  member_number: string;
};

export type PipelineOrchestratorResult = {
  pipeline_run_id: string;
  run_date: string;
  rerun: boolean;
  discovery_jobs_enqueued: number;
  refresh_candidates_selected: number;
  enrich_jobs_enqueued: number;
  normalize_jobs_enqueued: number;
  skipped_duplicate_jobs: number;
};

export type RunDailyPipelineInput = {
  run_date: string;
  timezone?: string;
  triggered_by?: string;
  trace_id?: string;
  now?: Date;
};
