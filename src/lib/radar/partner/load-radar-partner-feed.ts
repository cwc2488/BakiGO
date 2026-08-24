import {
  filterAllocatableForMember,
  loadMemberDevelopmentProtections,
} from "../allocation/allocation-read-model";
import { parseAllocationRules } from "../allocation/allocation-rules";
import { resolveDailyPipelineRunDate } from "../pipeline/run-date";
import type { RadarRepository } from "../repository/types";
import {
  buildRadarPartnerCard,
  buildRadarPartnerFeed,
  type RadarPartnerDevelopmentItem,
  type RadarPartnerFeed,
} from "./radar-partner-presentation";

export async function loadRadarPartnerFeed(input: {
  repo: RadarRepository;
  member_id: string;
  now?: Date;
}): Promise<RadarPartnerFeed> {
  const now = input.now ?? new Date();
  const snapshot_date = resolveDailyPipelineRunDate({ now });
  const config = await input.repo.getPipelineConfig();
  const rules = parseAllocationRules(config.allocation);
  const my_development = await loadMyDevelopment({ ...input, now });
  const snapshot = await input.repo.getMemberDailyTop20(input.member_id, snapshot_date);
  if (!snapshot) {
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
  const scores = await input.repo.listMemberScoreSnapshots({
    member_id: input.member_id,
    snapshot_date,
  });
  const cards = [];

  for (const ranked of visible) {
    const score = scores.find((row) => row.candidate_id === ranked.candidateId);
    const analysis = score?.analysis_run_id
      ? await input.repo.getAnalysisRun(score.analysis_run_id)
      : null;
    const corpus = analysis?.normalization_run_id
      ? await input.repo.getNormalizationRun(analysis.normalization_run_id)
      : await input.repo.getLatestNormalizationRun(ranked.candidateId);
    const [candidate, refresh] = await Promise.all([
      input.repo.getCandidate(ranked.candidateId),
      input.repo.getRefreshState(ranked.candidateId),
    ]);
    cards.push(
      buildRadarPartnerCard({
        ranked,
        candidate,
        extraction: analysis?.status === "succeeded" ? analysis.extraction_json : null,
        corpus,
        refresh,
        now,
        source_freshness_window_days: config.source_freshness_window_days,
      }),
    );
  }

  return buildRadarPartnerFeed({
    snapshot_date,
    snapshot,
    cards,
    daily_cap: rules.daily_recommendation_cap,
    my_development,
  });
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

  const items: RadarPartnerDevelopmentItem[] = [];
  for (const protection of protections) {
    const candidate = await input.repo.getCandidate(protection.candidate_id);
    items.push({
      candidate_id: protection.candidate_id,
      username: candidate?.normalized_username ?? null,
      protected_until: protection.protected_until,
      protection_expired: protection.protection_expired,
    });
  }
  return items;
}
