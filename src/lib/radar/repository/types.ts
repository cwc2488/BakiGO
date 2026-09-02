import type { AllocatableAt } from "../allocation/allocation-rules";
import type { MemberRadarRecommendationFeedback } from "../feedback/types";
import type { MemberRadarRegionPreference } from "../semantics/region-preference";
import type { GlobalCandidateLifecycleState, MemberDevelopmentState } from "../jobs/constants";
import type { CandidateContentCorpus } from "../normalization/schema";
import type { AiRadarExtractionV1 } from "../extraction/schema";
import type { OverallScoreResult } from "../scoring/types";
import type { RankedCandidate } from "../scoring/types";
import type { SourceFetchAuditEntry } from "../sources/types";

export type CandidateRecord = {
  id: string;
  lifecycle_state: GlobalCandidateLifecycleState;
  display_name: string | null;
  primary_platform: "threads" | "instagram" | null;
  profile_semantic_hash: string | null;
  normalized_username?: string | null;
  acquisition_source?: "system_discovery" | "member_provided";
};

export type RefreshStateRecord = {
  candidate_id: string;
  refresh_tier: "priority" | "standard" | "cooling";
  last_source_check_at: string | null;
  last_enrich_succeeded_at: string | null;
  last_normalization_succeeded_at: string | null;
  source_freshness_valid_until: string | null;
  corpus_fingerprint: string | null;
  profile_semantic_hash: string | null;
  data_completeness: "full" | "partial" | null;
  enrichment_capability_state?: string | null;
  current_analysis_run_id: string | null;
  validated_extraction_fingerprint: string | null;
  force_reanalysis: boolean;
};

export type AnalysisRunRecord = {
  id: string;
  candidate_id: string;
  status: "succeeded" | "failed" | "superseded";
  analysis_input_fingerprint: string;
  corpus_fingerprint: string;
  profile_semantic_hash: string | null;
  normalization_run_id: string | null;
  extraction_json: AiRadarExtractionV1 | null;
  prompt_version: string;
  model_id: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};

export type MemberDevelopmentArea = {
  member_id: string;
  area_role: "primary" | "secondary";
  normalized_city: string | null;
  normalized_district: string | null;
  sort_order: number;
};

export type MemberCandidateStateRecord = {
  member_id: string;
  candidate_id: string;
  development_state: MemberDevelopmentState | null;
  excluded_from_recommendations: boolean;
  exclusion_reason_code?: string | null;
  /** 略過 cooldown expiry. NULL = no timed skip (我認識他 is permanent). */
  skip_expires_at?: string | null;
};

/**
 * Current allocation lock for a candidate (`candidate_development_claims`).
 * Time-boxed allocation, never ownership. `allocatable_at` may be the Postgres
 * literal `infinity` for a candidate that became a Customer.
 */
export type CandidateDevelopmentClaimRecord = {
  candidate_id: string;
  member_id: string;
  claimed_at: string;
  expires_at: string;
  allocatable_at: string;
  released_at: string | null;
  release_reason: "failed" | "gave_up" | "converted" | null;
};

export type Top20SnapshotRecord = {
  id: string;
  member_id: string;
  pipeline_run_id: string | null;
  snapshot_date: string;
  generated_at: string;
  item_count: number;
  items: RankedCandidate[];
};

export type PipelineConfig = {
  source_freshness_window_days: number;
  worker: Record<string, unknown>;
  /** Operator overrides for the allocation rules; empty = TS defaults. */
  allocation: Record<string, unknown>;
};

export interface RadarRepository {
  upsertCandidate(input: {
    id: string;
    display_name?: string | null;
    primary_platform?: "threads" | "instagram" | null;
    lifecycle_state?: GlobalCandidateLifecycleState;
    profile_semantic_hash?: string | null;
    normalized_username?: string | null;
    acquisition_source?: "system_discovery" | "member_provided";
  }): Promise<CandidateRecord>;

  getCandidate(candidate_id: string): Promise<CandidateRecord | null>;

  /** Batch candidate_pool reads for partner feed (RADAR-PAGE-PERF-02). */
  listCandidatesByIds(candidate_ids: string[]): Promise<CandidateRecord[]>;

  recordDiscovery(input: {
    member_id: string;
    candidate_id: string;
    keyword_id?: string | null;
    keyword_phrase: string;
    org_keyword_phrase?: string | null;
    pipeline_run_id?: string | null;
    discovery_source?: "keyword_search" | "member_provided" | "interaction";
    discovered_at?: Date;
  }): Promise<void>;

  recordMemberSubmission(input: {
    member_id: string;
    candidate_id: string;
    platform: "threads" | "instagram";
    normalized_username: string;
    raw_input: string;
    submitted_at: Date;
    identity_resolution_result: "created_new" | "reused_existing";
  }): Promise<void>;

  upsertDiscoverySignal(input: {
    candidate_id: string;
    signal_type: "new_discovery_hit" | "near_top20_competitive";
    expires_at: Date;
  }): Promise<void>;

  insertRawSnapshots(input: {
    candidate_id: string;
    platform: "threads" | "instagram";
    snapshots: Array<{
      raw_snapshot_id: string;
      external_content_id: string;
      adapter_version: string;
      fetched_at: string;
      fetch_completeness: "full" | "partial";
      payload: Record<string, unknown>;
    }>;
    pipeline_run_id?: string | null;
    enrich_job_id?: string | null;
  }): Promise<string[]>;

  listRawSnapshotsByIds(raw_snapshot_ids: string[]): Promise<
    Array<{
      raw_snapshot_id: string;
      candidate_id: string;
      platform: "threads" | "instagram";
      external_content_id: string;
      fetched_at: string;
      adapter_version: string;
      fetch_completeness: "full" | "partial";
      payload: Record<string, unknown>;
    }>
  >;

  updateRefreshStateAfterEnrich(input: {
    candidate_id: string;
    succeeded: boolean;
    fetch_completeness?: "full" | "partial";
    profile_semantic_hash?: string | null;
    source_freshness_valid_until?: Date | null;
    enrichment_capability_state?: string | null;
    now: Date;
  }): Promise<void>;

  updateRefreshStateAfterNormalize(input: {
    candidate_id: string;
    corpus_fingerprint: string;
    profile_semantic_hash: string | null;
    data_completeness: "full" | "partial";
    current_analysis_run_id?: string | null;
    validated_extraction_fingerprint?: string | null;
    now: Date;
  }): Promise<void>;

  getRefreshState(candidate_id: string): Promise<RefreshStateRecord | null>;

  /** Batch refresh-state reads for partner feed (RADAR-PAGE-PERF-02). */
  listRefreshStatesByIds(candidate_ids: string[]): Promise<RefreshStateRecord[]>;

  persistNormalizationRun(corpus: CandidateContentCorpus): Promise<void>;

  getNormalizationRun(normalization_run_id: string): Promise<CandidateContentCorpus | null>;

  getLatestNormalizationRun(candidate_id: string): Promise<CandidateContentCorpus | null>;

  /**
   * Thin partner-card corpora: run metadata + evidence columns only
   * (not SELECT * on full normalization corpus). RADAR-PAGE-PERF-02.
   */
  listThinCorporaByNormalizationRunIds(
    normalization_run_ids: string[],
  ): Promise<CandidateContentCorpus[]>;

  findSuccessfulAnalysisByFingerprint(input: {
    candidate_id: string;
    analysis_input_fingerprint: string;
  }): Promise<AnalysisRunRecord | null>;

  insertAnalysisRun(input: {
    id: string;
    candidate_id: string;
    status: "succeeded" | "failed";
    analysis_input_fingerprint: string;
    corpus_fingerprint: string;
    profile_semantic_hash: string | null;
    normalization_run_id: string;
    extraction_json: AiRadarExtractionV1 | null;
    prompt_version: string;
    model_id: string;
    error_code?: string | null;
    error_message?: string | null;
  }): Promise<AnalysisRunRecord>;

  getAnalysisRun(analysis_run_id: string): Promise<AnalysisRunRecord | null>;

  /** Batch analysis runs for partner feed (RADAR-PAGE-PERF-02). */
  listAnalysisRunsByIds(analysis_run_ids: string[]): Promise<AnalysisRunRecord[]>;

  insertBaselineScoreSnapshot(input: {
    id: string;
    candidate_id: string;
    analysis_run_id: string;
    overall_score: number;
    component_scores: Record<string, unknown>;
    core_traits_audit: Record<string, unknown>;
  }): Promise<string>;

  insertMemberScoreSnapshot(input: {
    id: string;
    member_id: string;
    candidate_id: string;
    analysis_run_id: string;
    baseline_score_snapshot_id: string;
    overall_score: number;
    component_scores: Record<string, unknown>;
    location_level: string;
    snapshot_date?: string;
    result?: OverallScoreResult;
  }): Promise<void>;

  listActiveMembers(): Promise<Array<{ member_id: string }>>;

  getMemberDevelopmentAreas(member_id: string): Promise<MemberDevelopmentArea[]>;

  getMemberRadarRegionPreference(
    member_id: string,
  ): Promise<MemberRadarRegionPreference | null>;

  upsertMemberRadarRegionPreference(
    preference: MemberRadarRegionPreference,
  ): Promise<MemberRadarRegionPreference>;

  getMemberRadarRecommendationFeedback(input: {
    member_id: string;
    candidate_id: string;
    recommendation_date: string;
  }): Promise<MemberRadarRecommendationFeedback | null>;

  listMemberRadarRecommendationFeedback(input: {
    member_id: string;
    recommendation_date: string;
  }): Promise<MemberRadarRecommendationFeedback[]>;

  upsertMemberRadarRecommendationFeedback(
    feedback: MemberRadarRecommendationFeedback,
  ): Promise<MemberRadarRecommendationFeedback>;

  getMemberCandidateState(
    member_id: string,
    candidate_id: string,
  ): Promise<MemberCandidateStateRecord | null>;

  listMemberCandidateStates(member_id: string): Promise<MemberCandidateStateRecord[]>;

  setMemberDevelopmentState(input: {
    member_id: string;
    candidate_id: string;
    development_state: MemberDevelopmentState;
  }): Promise<void>;

  setMemberCandidateState(input: {
    member_id: string;
    candidate_id: string;
    development_state: MemberDevelopmentState | null;
    excluded_from_recommendations: boolean;
    exclusion_reason_code?: string | null;
    skip_expires_at?: Date | null;
  }): Promise<void>;

  listCandidateDevelopmentClaims(
    candidate_ids: string[],
  ): Promise<CandidateDevelopmentClaimRecord[]>;

  getCandidateDevelopmentClaim(
    candidate_id: string,
  ): Promise<CandidateDevelopmentClaimRecord | null>;

  /**
   * Atomic first-writer-wins claim. Resolves to the holder's row, or `null` when
   * another member holds the candidate or the global cooldown is still running.
   * A `null` result must never be turned into anything the caller can attribute.
   */
  claimCandidateDevelopment(input: {
    candidate_id: string;
    member_id: string;
    expires_at: Date;
    allocatable_at: AllocatableAt;
    rules_version: string;
    now: Date;
  }): Promise<CandidateDevelopmentClaimRecord | null>;

  /** Explicit early release (failed / gave_up / converted). Never a natural expiry. */
  releaseCandidateDevelopmentClaim(input: {
    candidate_id: string;
    member_id: string;
    released_at: Date;
    release_reason: "failed" | "gave_up" | "converted";
    allocatable_at: AllocatableAt;
  }): Promise<CandidateDevelopmentClaimRecord | null>;

  initMemberScoreProgress(input: {
    pipeline_run_id: string;
    member_id: string;
    expected_score_jobs: number;
  }): Promise<void>;

  incrementMemberScoreProgress(input: {
    pipeline_run_id: string;
    member_id: string;
  }): Promise<{ terminal_score_jobs: number; expected_score_jobs: number; rank_enqueued: boolean }>;

  markMemberRankEnqueued(input: {
    pipeline_run_id: string;
    member_id: string;
  }): Promise<void>;

  shouldEnqueueRank(input: {
    pipeline_run_id: string;
    member_id: string;
  }): Promise<boolean>;

  getMemberScoreProgress(input: {
    pipeline_run_id: string;
    member_id: string;
  }): Promise<{
    expected_score_jobs: number;
    terminal_score_jobs: number;
    rank_enqueued: boolean;
  } | null>;

  clearMemberRankEnqueued(input: {
    pipeline_run_id: string;
    member_id: string;
  }): Promise<void>;

  countMemberScoreSnapshotsForDate(input: {
    member_id: string;
    snapshot_date: string;
  }): Promise<number>;

  countMemberScoreSnapshotsAboveMinimum(input: {
    member_id: string;
    snapshot_date: string;
    minimum_score: number;
  }): Promise<number>;

  /**
   * One logical snapshot per member per day. A re-run replaces the content of
   * the existing row and keeps its `id`, because
   * `member_recommendation_occurrences.member_daily_top20_id` points at it and
   * would lose its lineage if the row were recreated.
   */
  upsertMemberDailyTop20(input: {
    member_id: string;
    pipeline_run_id: string;
    snapshot_date: string;
    generated_at: Date;
    items: RankedCandidate[];
  }): Promise<Top20SnapshotRecord>;

  /** Candidates already recommended to this member on this date. */
  listRecommendedCandidateIds(input: {
    member_id: string;
    snapshot_date: string;
  }): Promise<string[]>;

  /**
   * Append-only audit. A candidate already recorded for this member and day is
   * skipped, so a re-run cannot inflate the trail; a genuine same-day
   * re-recommendation still appends because it carries a reason.
   */
  appendRecommendationOccurrences(input: {
    member_id: string;
    member_daily_top20_id: string;
    snapshot_date: string;
    items: RankedCandidate[];
    analysis_run_ids: Record<string, string>;
    re_recommendation?: Record<string, { reason: string; trigger: string } | undefined>;
  }): Promise<{ appended: number; skipped_existing: number }>;

  getMemberDailyTop20(
    member_id: string,
    snapshot_date: string,
  ): Promise<Top20SnapshotRecord | null>;

  listMemberScoreSnapshots(input: {
    member_id: string;
    snapshot_date: string;
    /** When set, only fetch these candidates (avoids full member score history). */
    candidate_ids?: string[];
  }): Promise<
    Array<{
      candidate_id: string;
      overall_score: number;
      result: OverallScoreResult;
      analysis_run_id: string;
      display_name: string | null;
      location_level: string | null;
    }>
  >;

  getPipelineConfig(): Promise<PipelineConfig>;

  recordSourceFetchAudit(entry: SourceFetchAuditEntry): Promise<void>;
}
