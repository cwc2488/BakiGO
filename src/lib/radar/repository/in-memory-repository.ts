import { randomUUID } from "node:crypto";
import type { CandidateContentCorpus } from "../normalization/schema";
import type { RankedCandidate } from "../scoring/types";
import { parseAllocatableAt, serializeAllocatableAt } from "../allocation/allocation-rules";
import type { AllocatableAt } from "../allocation/allocation-rules";
import type { MemberRadarRecommendationFeedback } from "../feedback/types";
import type { MemberRadarRegionPreference } from "../semantics/region-preference";
import type {
  AnalysisRunRecord,
  CandidateDevelopmentClaimRecord,
  CandidateRecord,
  MemberCandidateStateRecord,
  MemberDevelopmentArea,
  RadarRepository,
  RefreshStateRecord,
  Top20SnapshotRecord,
} from "./types";

export class InMemoryRadarRepository implements RadarRepository {
  candidates = new Map<string, CandidateRecord>();
  discoveries: Array<Record<string, unknown>> = [];
  discoverySignals: Array<Record<string, unknown>> = [];
  rawSnapshots = new Map<string, Record<string, unknown>>();
  refreshState = new Map<string, RefreshStateRecord>();
  normalizationRuns = new Map<string, CandidateContentCorpus>();
  analysisRuns = new Map<string, AnalysisRunRecord>();
  baselineScores = new Map<string, Record<string, unknown>>();
  memberScores: Array<Record<string, unknown>> = [];
  members: Array<{ member_id: string }> = [];
  developmentAreas = new Map<string, MemberDevelopmentArea[]>();
  regionPreferences = new Map<string, MemberRadarRegionPreference>();
  recommendationFeedback = new Map<string, MemberRadarRecommendationFeedback>();
  memberCandidateStates = new Map<string, MemberCandidateStateRecord>();
  candidateClaims = new Map<string, CandidateDevelopmentClaimRecord>();
  candidateClaimEvents: Array<{
    candidate_id: string;
    member_id: string;
    event: "claimed" | "released" | "superseded";
    reason: string | null;
  }> = [];
  scoreProgress = new Map<string, Record<string, unknown>>();
  top20 = new Map<string, Top20SnapshotRecord>();
  recommendationOccurrences: Array<Record<string, unknown>> = [];
  sourceFetchAudit: Array<Record<string, unknown>> = [];
  memberSubmissions: Array<Record<string, unknown>> = [];
  pipelineConfig: import("./types").PipelineConfig = {
    source_freshness_window_days: 7,
    worker: { cooling_refresh_interval_days: 14 },
    allocation: {},
  };

  async upsertCandidate(input: {
    id: string;
    display_name?: string | null;
    primary_platform?: "threads" | "instagram" | null;
    lifecycle_state?: CandidateRecord["lifecycle_state"];
    profile_semantic_hash?: string | null;
    normalized_username?: string | null;
    acquisition_source?: "system_discovery" | "member_provided";
  }): Promise<CandidateRecord> {
    const existing = this.candidates.get(input.id);
    const record: CandidateRecord = {
      id: input.id,
      display_name: input.display_name ?? existing?.display_name ?? null,
      primary_platform: input.primary_platform ?? existing?.primary_platform ?? null,
      lifecycle_state: input.lifecycle_state ?? existing?.lifecycle_state ?? "active",
      profile_semantic_hash:
        input.profile_semantic_hash ?? existing?.profile_semantic_hash ?? null,
      normalized_username: input.normalized_username ?? existing?.normalized_username ?? null,
      acquisition_source: input.acquisition_source ?? existing?.acquisition_source ?? "system_discovery",
    };
    this.candidates.set(input.id, record);
    if (!this.refreshState.has(input.id)) {
      this.refreshState.set(input.id, {
        candidate_id: input.id,
        refresh_tier: "standard",
        last_source_check_at: null,
        last_enrich_succeeded_at: null,
        last_normalization_succeeded_at: null,
        source_freshness_valid_until: null,
        corpus_fingerprint: null,
        profile_semantic_hash: null,
        data_completeness: null,
        enrichment_capability_state: null,
        current_analysis_run_id: null,
        validated_extraction_fingerprint: null,
        force_reanalysis: false,
      });
    }
    return record;
  }

  async getCandidate(candidate_id: string): Promise<CandidateRecord | null> {
    return this.candidates.get(candidate_id) ?? null;
  }

  async listCandidatesByIds(candidate_ids: string[]): Promise<CandidateRecord[]> {
    const out: CandidateRecord[] = [];
    for (const id of candidate_ids) {
      const row = this.candidates.get(id);
      if (row) out.push(row);
    }
    return out;
  }

  async recordDiscovery(input: {
    member_id: string;
    candidate_id: string;
    keyword_id?: string | null;
    keyword_phrase: string;
    org_keyword_phrase?: string | null;
    pipeline_run_id?: string | null;
    discovery_source?: "keyword_search" | "member_provided" | "interaction";
    discovered_at?: Date;
  }): Promise<void> {
    this.discoveries.push({
      ...input,
      discovery_source: input.discovery_source ?? "keyword_search",
      discovered_at: (input.discovered_at ?? new Date()).toISOString(),
    });
  }

  async recordMemberSubmission(input: {
    member_id: string;
    candidate_id: string;
    platform: "threads" | "instagram";
    normalized_username: string;
    raw_input: string;
    submitted_at: Date;
    identity_resolution_result: "created_new" | "reused_existing";
  }): Promise<void> {
    this.memberSubmissions.push({
      id: randomUUID(),
      ...input,
      submitted_at: input.submitted_at.toISOString(),
    });
  }

  async upsertDiscoverySignal(input: {
    candidate_id: string;
    signal_type: "new_discovery_hit" | "near_top20_competitive";
    expires_at: Date;
  }): Promise<void> {
    this.discoverySignals.push({
      id: randomUUID(),
      ...input,
      expires_at: input.expires_at.toISOString(),
    });
  }

  async insertRawSnapshots(input: {
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
  }): Promise<string[]> {
    const ids: string[] = [];
    for (const snapshot of input.snapshots) {
      this.rawSnapshots.set(snapshot.raw_snapshot_id, {
        ...snapshot,
        candidate_id: input.candidate_id,
        platform: input.platform,
      });
      ids.push(snapshot.raw_snapshot_id);
    }
    return ids;
  }

  async listRawSnapshotsByIds(raw_snapshot_ids: string[]) {
    return raw_snapshot_ids
      .map((id) => this.rawSnapshots.get(id))
      .filter(Boolean)
      .map((row) => row as never);
  }

  async updateRefreshStateAfterEnrich(input: {
    candidate_id: string;
    succeeded: boolean;
    fetch_completeness?: "full" | "partial";
    profile_semantic_hash?: string | null;
    source_freshness_valid_until?: Date | null;
    enrichment_capability_state?: string | null;
    now: Date;
  }): Promise<void> {
    const state = this.refreshState.get(input.candidate_id);
    if (!state) return;
    state.last_source_check_at = input.now.toISOString();
    if (input.succeeded) {
      state.last_enrich_succeeded_at = input.now.toISOString();
      state.source_freshness_valid_until = input.source_freshness_valid_until?.toISOString() ?? null;
      state.data_completeness = input.fetch_completeness ?? state.data_completeness;
      state.profile_semantic_hash = input.profile_semantic_hash ?? state.profile_semantic_hash;
      if (input.enrichment_capability_state) {
        state.enrichment_capability_state = input.enrichment_capability_state;
      }
    }
  }

  async updateRefreshStateAfterNormalize(input: {
    candidate_id: string;
    corpus_fingerprint: string;
    profile_semantic_hash: string | null;
    data_completeness: "full" | "partial";
    current_analysis_run_id?: string | null;
    validated_extraction_fingerprint?: string | null;
    now: Date;
  }): Promise<void> {
    const state = this.refreshState.get(input.candidate_id);
    if (!state) return;
    state.last_normalization_succeeded_at = input.now.toISOString();
    state.corpus_fingerprint = input.corpus_fingerprint;
    state.profile_semantic_hash = input.profile_semantic_hash;
    state.data_completeness = input.data_completeness;
    state.current_analysis_run_id = input.current_analysis_run_id ?? state.current_analysis_run_id;
    state.validated_extraction_fingerprint =
      input.validated_extraction_fingerprint ?? state.validated_extraction_fingerprint;
    state.force_reanalysis = false;
  }

  async getRefreshState(candidate_id: string): Promise<RefreshStateRecord | null> {
    return this.refreshState.get(candidate_id) ?? null;
  }

  async listRefreshStatesByIds(candidate_ids: string[]): Promise<RefreshStateRecord[]> {
    const out: RefreshStateRecord[] = [];
    for (const id of candidate_ids) {
      const row = this.refreshState.get(id);
      if (row) out.push(row);
    }
    return out;
  }

  async persistNormalizationRun(corpus: CandidateContentCorpus): Promise<void> {
    this.normalizationRuns.set(corpus.normalization_run_id, corpus);
  }

  async getNormalizationRun(normalization_run_id: string): Promise<CandidateContentCorpus | null> {
    return this.normalizationRuns.get(normalization_run_id) ?? null;
  }

  async getLatestNormalizationRun(candidate_id: string): Promise<CandidateContentCorpus | null> {
    const runs = [...this.normalizationRuns.values()]
      .filter((run) => run.candidate_id === candidate_id)
      .sort((a, b) => b.normalized_at.localeCompare(a.normalized_at));
    return runs[0] ?? null;
  }

  async listThinCorporaByNormalizationRunIds(
    normalization_run_ids: string[],
  ): Promise<CandidateContentCorpus[]> {
    const out: CandidateContentCorpus[] = [];
    for (const id of normalization_run_ids) {
      const corpus = this.normalizationRuns.get(id);
      if (corpus) out.push(corpus);
    }
    return out;
  }

  async findSuccessfulAnalysisByFingerprint(input: {
    candidate_id: string;
    analysis_input_fingerprint: string;
  }): Promise<AnalysisRunRecord | null> {
    for (const run of this.analysisRuns.values()) {
      if (
        run.candidate_id === input.candidate_id &&
        run.status === "succeeded" &&
        run.analysis_input_fingerprint === input.analysis_input_fingerprint
      ) {
        return run;
      }
    }
    return null;
  }

  async insertAnalysisRun(input: {
    id: string;
    candidate_id: string;
    status: "succeeded" | "failed";
    analysis_input_fingerprint: string;
    corpus_fingerprint: string;
    profile_semantic_hash: string | null;
    normalization_run_id: string;
    extraction_json: AnalysisRunRecord["extraction_json"];
    prompt_version: string;
    model_id: string;
    error_code?: string | null;
    error_message?: string | null;
  }): Promise<AnalysisRunRecord> {
    const record: AnalysisRunRecord = {
      ...input,
      error_code: input.error_code ?? null,
      error_message: input.error_message ?? null,
      created_at: new Date().toISOString(),
    };
    this.analysisRuns.set(input.id, record);
    return record;
  }

  async getAnalysisRun(analysis_run_id: string): Promise<AnalysisRunRecord | null> {
    return this.analysisRuns.get(analysis_run_id) ?? null;
  }

  async listAnalysisRunsByIds(analysis_run_ids: string[]): Promise<AnalysisRunRecord[]> {
    const out: AnalysisRunRecord[] = [];
    for (const id of analysis_run_ids) {
      const row = this.analysisRuns.get(id);
      if (row) out.push(row);
    }
    return out;
  }

  async insertBaselineScoreSnapshot(input: {
    id: string;
    candidate_id: string;
    analysis_run_id: string;
    overall_score: number;
    component_scores: Record<string, unknown>;
    core_traits_audit: Record<string, unknown>;
  }): Promise<string> {
    this.baselineScores.set(input.id, input);
    return input.id;
  }

  async insertMemberScoreSnapshot(input: Record<string, unknown>): Promise<void> {
    this.memberScores.push(input);
  }

  async listActiveMembers() {
    return this.members;
  }

  async getMemberDevelopmentAreas(member_id: string) {
    return this.developmentAreas.get(member_id) ?? [];
  }

  async getMemberRadarRegionPreference(member_id: string) {
    return this.regionPreferences.get(member_id) ?? null;
  }

  async upsertMemberRadarRegionPreference(preference: MemberRadarRegionPreference) {
    this.regionPreferences.set(preference.member_id, preference);
    return preference;
  }

  private feedbackKey(member_id: string, candidate_id: string, recommendation_date: string) {
    return `${member_id}:${candidate_id}:${recommendation_date}`;
  }

  async getMemberRadarRecommendationFeedback(input: {
    member_id: string;
    candidate_id: string;
    recommendation_date: string;
  }) {
    return (
      this.recommendationFeedback.get(
        this.feedbackKey(input.member_id, input.candidate_id, input.recommendation_date),
      ) ?? null
    );
  }

  async listMemberRadarRecommendationFeedback(input: {
    member_id: string;
    recommendation_date: string;
  }) {
    return [...this.recommendationFeedback.values()].filter(
      (row) =>
        row.member_id === input.member_id && row.recommendation_date === input.recommendation_date,
    );
  }

  async upsertMemberRadarRecommendationFeedback(feedback: MemberRadarRecommendationFeedback) {
    this.recommendationFeedback.set(
      this.feedbackKey(feedback.member_id, feedback.candidate_id, feedback.recommendation_date),
      feedback,
    );
    return feedback;
  }

  async getMemberCandidateState(member_id: string, candidate_id: string) {
    return this.memberCandidateStates.get(`${member_id}:${candidate_id}`) ?? null;
  }

  async listMemberCandidateStates(member_id: string) {
    return [...this.memberCandidateStates.values()].filter((row) => row.member_id === member_id);
  }

  async setMemberDevelopmentState(input: {
    member_id: string;
    candidate_id: string;
    development_state: MemberCandidateStateRecord["development_state"];
  }) {
    await this.setMemberCandidateState({
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      development_state: input.development_state,
      excluded_from_recommendations: true,
      exclusion_reason_code: null,
    });
  }

  async setMemberCandidateState(input: {
    member_id: string;
    candidate_id: string;
    development_state: MemberCandidateStateRecord["development_state"];
    excluded_from_recommendations: boolean;
    exclusion_reason_code?: string | null;
    skip_expires_at?: Date | null;
  }) {
    this.memberCandidateStates.set(`${input.member_id}:${input.candidate_id}`, {
      member_id: input.member_id,
      candidate_id: input.candidate_id,
      development_state: input.development_state,
      excluded_from_recommendations: input.excluded_from_recommendations,
      exclusion_reason_code: input.exclusion_reason_code ?? null,
      skip_expires_at: input.skip_expires_at ? input.skip_expires_at.toISOString() : null,
    });
  }

  async listCandidateDevelopmentClaims(candidate_ids: string[]) {
    const wanted = new Set(candidate_ids);
    return [...this.candidateClaims.values()].filter((claim) => wanted.has(claim.candidate_id));
  }

  async getCandidateDevelopmentClaim(candidate_id: string) {
    return this.candidateClaims.get(candidate_id) ?? null;
  }

  /**
   * Mirrors `claim_candidate_development()` in 047: a claim only lands when the
   * previous lock is past its `allocatable_at`, or when the same member is
   * retrying their own live claim — in which case the dates are left untouched.
   */
  async claimCandidateDevelopment(input: {
    candidate_id: string;
    member_id: string;
    expires_at: Date;
    allocatable_at: AllocatableAt;
    rules_version: string;
    now: Date;
  }) {
    const existing = this.candidateClaims.get(input.candidate_id);
    const fresh: CandidateDevelopmentClaimRecord = {
      candidate_id: input.candidate_id,
      member_id: input.member_id,
      claimed_at: input.now.toISOString(),
      expires_at: input.expires_at.toISOString(),
      allocatable_at: serializeAllocatableAt(input.allocatable_at),
      released_at: null,
      release_reason: null,
    };

    if (!existing) {
      this.candidateClaims.set(input.candidate_id, fresh);
      this.candidateClaimEvents.push({
        candidate_id: fresh.candidate_id,
        member_id: fresh.member_id,
        event: "claimed",
        reason: null,
      });
      return fresh;
    }

    const holderRetry =
      existing.member_id === input.member_id &&
      !existing.released_at &&
      new Date(existing.expires_at).getTime() > input.now.getTime();
    const allocatable = parseAllocatableAt(existing.allocatable_at);
    const cooldownOver =
      allocatable.kind === "at" && allocatable.at.getTime() <= input.now.getTime();
    if (!holderRetry && !cooldownOver) return null;

    if (holderRetry) return existing;

    this.candidateClaimEvents.push({
      candidate_id: existing.candidate_id,
      member_id: existing.member_id,
      event: "superseded",
      reason: existing.release_reason ?? "expired",
    });
    this.candidateClaims.set(input.candidate_id, fresh);
    this.candidateClaimEvents.push({
      candidate_id: fresh.candidate_id,
      member_id: fresh.member_id,
      event: "claimed",
      reason: null,
    });
    return fresh;
  }

  async releaseCandidateDevelopmentClaim(input: {
    candidate_id: string;
    member_id: string;
    released_at: Date;
    release_reason: "failed" | "gave_up" | "converted";
    allocatable_at: AllocatableAt;
  }) {
    const existing = this.candidateClaims.get(input.candidate_id);
    if (!existing || existing.member_id !== input.member_id || existing.released_at) return null;
    const released: CandidateDevelopmentClaimRecord = {
      ...existing,
      released_at: input.released_at.toISOString(),
      release_reason: input.release_reason,
      allocatable_at: serializeAllocatableAt(input.allocatable_at),
    };
    this.candidateClaims.set(input.candidate_id, released);
    this.candidateClaimEvents.push({
      candidate_id: released.candidate_id,
      member_id: released.member_id,
      event: "released",
      reason: input.release_reason,
    });
    return released;
  }

  private scoreProgressKey(pipeline_run_id: string, member_id: string) {
    return `${pipeline_run_id}:${member_id}`;
  }

  async initMemberScoreProgress(input: {
    pipeline_run_id: string;
    member_id: string;
    expected_score_jobs: number;
  }) {
    const key = this.scoreProgressKey(input.pipeline_run_id, input.member_id);
    const row = this.scoreProgress.get(key) ?? {
      expected_score_jobs: 0,
      terminal_score_jobs: 0,
      rank_enqueued: false,
    };
    row.expected_score_jobs = Number(row.expected_score_jobs ?? 0) + input.expected_score_jobs;
    this.scoreProgress.set(key, row);
  }

  async incrementMemberScoreProgress(input: { pipeline_run_id: string; member_id: string }) {
    const key = this.scoreProgressKey(input.pipeline_run_id, input.member_id);
    const row = this.scoreProgress.get(key) ?? {
      expected_score_jobs: 0,
      terminal_score_jobs: 0,
      rank_enqueued: false,
    };
    row.terminal_score_jobs = Number(row.terminal_score_jobs ?? 0) + 1;
    this.scoreProgress.set(key, row);
    return {
      terminal_score_jobs: Number(row.terminal_score_jobs),
      expected_score_jobs: Number(row.expected_score_jobs ?? 0),
      rank_enqueued: Boolean(row.rank_enqueued),
    };
  }

  async markMemberRankEnqueued(input: { pipeline_run_id: string; member_id: string }) {
    const key = this.scoreProgressKey(input.pipeline_run_id, input.member_id);
    const row = this.scoreProgress.get(key);
    if (row) row.rank_enqueued = true;
  }

  async shouldEnqueueRank(input: { pipeline_run_id: string; member_id: string }) {
    const row = this.scoreProgress.get(this.scoreProgressKey(input.pipeline_run_id, input.member_id));
    if (!row || row.rank_enqueued) return false;
    return Number(row.terminal_score_jobs) >= Number(row.expected_score_jobs);
  }

  async upsertMemberDailyTop20(input: {
    member_id: string;
    pipeline_run_id: string;
    snapshot_date: string;
    generated_at: Date;
    items: RankedCandidate[];
  }) {
    const key = `${input.member_id}:${input.snapshot_date}`;
    const existing = this.top20.get(key);
    const record: Top20SnapshotRecord = {
      // Identity belongs to the member-day, not to the run that filled it.
      id: existing?.id ?? randomUUID(),
      member_id: input.member_id,
      pipeline_run_id: input.pipeline_run_id,
      snapshot_date: input.snapshot_date,
      generated_at: input.generated_at.toISOString(),
      item_count: input.items.length,
      items: input.items,
    };
    this.top20.set(key, record);
    return record;
  }

  async listRecommendedCandidateIds(input: { member_id: string; snapshot_date: string }) {
    return [
      ...new Set(
        this.recommendationOccurrences
          .filter(
            (row) =>
              row.member_id === input.member_id && row.snapshot_date === input.snapshot_date,
          )
          .map((row) => String(row.candidate_id)),
      ),
    ];
  }

  async appendRecommendationOccurrences(input: {
    member_id: string;
    member_daily_top20_id: string;
    snapshot_date: string;
    items: RankedCandidate[];
    analysis_run_ids: Record<string, string>;
    re_recommendation?: Record<string, { reason: string; trigger: string } | undefined>;
  }) {
    const alreadyRecorded = new Set(
      this.recommendationOccurrences
        .filter(
          (row) =>
            row.member_id === input.member_id && row.snapshot_date === input.snapshot_date,
        )
        .map((row) => String(row.candidate_id)),
    );

    let appended = 0;
    let skipped_existing = 0;
    for (const item of input.items) {
      const reRecommendation = input.re_recommendation?.[item.candidateId];
      if (alreadyRecorded.has(item.candidateId) && !reRecommendation) {
        skipped_existing += 1;
        continue;
      }
      this.recommendationOccurrences.push({
        id: randomUUID(),
        member_id: input.member_id,
        candidate_id: item.candidateId,
        member_daily_top20_id: input.member_daily_top20_id,
        snapshot_date: input.snapshot_date,
        rank: item.rank,
        recommendation_score: item.overall_score,
        analysis_run_id: input.analysis_run_ids[item.candidateId],
        re_recommendation_reason: reRecommendation?.reason ?? null,
        re_recommendation_trigger: reRecommendation?.trigger ?? null,
      });
      appended += 1;
    }
    return { appended, skipped_existing };
  }

  async getMemberDailyTop20(member_id: string, snapshot_date: string) {
    return this.top20.get(`${member_id}:${snapshot_date}`) ?? null;
  }

  /**
   * Score snapshots stay append-only history, so a same-day re-score leaves
   * more than one row per candidate. Ranking needs one: the newest wins,
   * otherwise a re-run would rank the same person twice.
   */
  async listMemberScoreSnapshots(input: {
    member_id: string;
    snapshot_date: string;
    candidate_ids?: string[];
  }) {
    const allow = input.candidate_ids ? new Set(input.candidate_ids) : null;
    const latestByCandidate = new Map<string, Record<string, unknown>>();
    for (const row of this.memberScores) {
      if (row.member_id !== input.member_id || row.snapshot_date !== input.snapshot_date) continue;
      const candidateId = String(row.candidate_id);
      if (allow && !allow.has(candidateId)) continue;
      latestByCandidate.set(candidateId, row);
    }
    return [...latestByCandidate.values()].map((row) => ({
      candidate_id: String(row.candidate_id),
      overall_score: Number(row.overall_score),
      result: row.result as never,
      analysis_run_id: String(row.analysis_run_id),
      display_name: (this.candidates.get(String(row.candidate_id))?.display_name ?? null) as string | null,
      location_level: typeof row.location_level === "string" ? row.location_level : null,
    }));
  }

  async getPipelineConfig() {
    return this.pipelineConfig;
  }

  async recordSourceFetchAudit(entry: Record<string, unknown>) {
    this.sourceFetchAudit.push({ ...entry, fetched_at: new Date().toISOString() });
  }
}
