import {
  filterAllocatableForMember,
  loadMemberDevelopmentProtections,
} from "../allocation/allocation-read-model";
import { parseAllocationRules } from "../allocation/allocation-rules";
import { resolveDailyPipelineRunDate } from "../pipeline/run-date";
import type { AnalysisRunRecord, CandidateRecord, RadarRepository, RefreshStateRecord } from "../repository/types";
import type { CandidateContentCorpus } from "../normalization/schema";
import {
  buildRadarPartnerCard,
  buildRadarPartnerFeed,
  type RadarPartnerDevelopmentItem,
  type RadarPartnerFeed,
} from "./radar-partner-presentation";

/**
 * Partner Radar feed assembly (RADAR-PAGE-PERF-02).
 *
 * Performance-only: same logical recommendations as the prior sequential path.
 * Does not change eligibility, ranking, Top20, or feedback semantics.
 */
export async function loadRadarPartnerFeed(input: {
  repo: RadarRepository;
  member_id: string;
  now?: Date;
}): Promise<RadarPartnerFeed> {
  const now = input.now ?? new Date();
  const snapshot_date = resolveDailyPipelineRunDate({ now });
  const config = await input.repo.getPipelineConfig();
  const rules = parseAllocationRules(config.allocation);

  // Start 我的開發中 without blocking today's recommendation cards.
  const myDevelopmentPromise = loadMyDevelopment({ ...input, now });

  const snapshot = await input.repo.getMemberDailyTop20(input.member_id, snapshot_date);
  if (!snapshot) {
    const my_development = await myDevelopmentPromise;
    return buildRadarPartnerFeed({
      snapshot_date,
      snapshot: null,
      cards: [],
      daily_cap: rules.daily_recommendation_cap,
      my_development,
    });
  }

  const visible = await filterAllocatableForMember({
    repo: input.repo,
    member_id: input.member_id,
    items: snapshot.items,
    now,
  });
  const visibleIds = visible.map((row) => row.candidateId);

  const [scores, ownFeedback] = await Promise.all([
    input.repo.listMemberScoreSnapshots({
      member_id: input.member_id,
      snapshot_date,
      candidate_ids: visibleIds,
    }),
    input.repo.listMemberRadarRecommendationFeedback({
      member_id: input.member_id,
      recommendation_date: snapshot_date,
    }),
  ]);

  const feedbackByCandidate = new Map(
    ownFeedback.map((row) => [row.candidate_id, row] as const),
  );
  const scoreByCandidate = new Map(scores.map((row) => [row.candidate_id, row] as const));

  const analysisRunIds = [
    ...new Set(
      visible
        .map((ranked) => scoreByCandidate.get(ranked.candidateId)?.analysis_run_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [candidates, refreshStates, analyses] = await Promise.all([
    input.repo.listCandidatesByIds(visibleIds),
    input.repo.listRefreshStatesByIds(visibleIds),
    analysisRunIds.length > 0
      ? input.repo.listAnalysisRunsByIds(analysisRunIds)
      : Promise.resolve([] as AnalysisRunRecord[]),
  ]);

  const candidateById = new Map(candidates.map((row) => [row.id, row] as const));
  const refreshById = new Map(refreshStates.map((row) => [row.candidate_id, row] as const));
  const analysisById = new Map(analyses.map((row) => [row.id, row] as const));

  const normalizationRunIds = [
    ...new Set(
      analyses
        .map((row) => row.normalization_run_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const missingLatestCandidateIds = visible
    .filter((ranked) => {
      const score = scoreByCandidate.get(ranked.candidateId);
      const analysis = score?.analysis_run_id
        ? analysisById.get(score.analysis_run_id)
        : undefined;
      return !analysis?.normalization_run_id;
    })
    .map((ranked) => ranked.candidateId);

  const [thinCorpora, latestFallbacks] = await Promise.all([
    normalizationRunIds.length > 0
      ? input.repo.listThinCorporaByNormalizationRunIds(normalizationRunIds)
      : Promise.resolve([] as CandidateContentCorpus[]),
    loadLatestNormalizationRunsBounded({
      repo: input.repo,
      candidate_ids: missingLatestCandidateIds,
    }),
  ]);

  const corpusByNormId = new Map(
    thinCorpora.map((row) => [row.normalization_run_id, row] as const),
  );
  const latestByCandidate = new Map(
    latestFallbacks.map((row) => [row.candidate_id, row] as const),
  );

  const cards = visible.map((ranked) => {
    const score = scoreByCandidate.get(ranked.candidateId);
    const analysis = score?.analysis_run_id
      ? analysisById.get(score.analysis_run_id) ?? null
      : null;
    const corpus = analysis?.normalization_run_id
      ? corpusByNormId.get(analysis.normalization_run_id) ?? null
      : latestByCandidate.get(ranked.candidateId) ?? null;
    const candidate: CandidateRecord | null = candidateById.get(ranked.candidateId) ?? null;
    const refresh: RefreshStateRecord | null = refreshById.get(ranked.candidateId) ?? null;
    const card = buildRadarPartnerCard({
      ranked,
      candidate,
      extraction: analysis?.status === "succeeded" ? analysis.extraction_json : null,
      corpus,
      refresh,
      now,
      source_freshness_window_days: config.source_freshness_window_days,
    });
    return {
      ...card,
      feedback: feedbackByCandidate.get(ranked.candidateId) ?? null,
    };
  });

  const my_development = await myDevelopmentPromise;

  return buildRadarPartnerFeed({
    snapshot_date,
    snapshot,
    cards,
    daily_cap: rules.daily_recommendation_cap,
    my_development,
  });
}

/**
 * Bounded concurrency for rare latest-corpus fallbacks only.
 * Primary path uses batched thin corpora by normalization_run_id.
 */
async function loadLatestNormalizationRunsBounded(input: {
  repo: RadarRepository;
  candidate_ids: string[];
  concurrency?: number;
}): Promise<CandidateContentCorpus[]> {
  const ids = [...new Set(input.candidate_ids)];
  if (ids.length === 0) return [];
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 4, ids.length));
  const out: CandidateContentCorpus[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      const corpus = await input.repo.getLatestNormalizationRun(ids[index]!);
      if (corpus) out.push(corpus);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

/**
 * The member's own 開發中 candidates with their own protection date. Only their
 * own claims are ever loaded, so no other Partner can be inferred from this.
 */
async function loadMyDevelopment(input: {
  repo: RadarRepository;
  member_id: string;
  now: Date;
}): Promise<RadarPartnerDevelopmentItem[]> {
  const protections = await loadMemberDevelopmentProtections({
    repo: input.repo,
    member_id: input.member_id,
    now: input.now,
  });

  if (protections.length === 0) return [];

  const candidates = await input.repo.listCandidatesByIds(
    protections.map((row) => row.candidate_id),
  );
  const byId = new Map(candidates.map((row) => [row.id, row] as const));

  return protections.map((protection) => ({
    candidate_id: protection.candidate_id,
    username: byId.get(protection.candidate_id)?.normalized_username ?? null,
    protected_until: protection.protected_until,
    protection_expired: protection.protection_expired,
  }));
}
