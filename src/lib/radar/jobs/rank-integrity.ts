import type { RadarRepository } from "../repository/types";
import { DEFAULT_ALLOCATION_RULES } from "../allocation/allocation-rules";

export type MemberScoreProgressRow = {
  expected_score_jobs: number;
  terminal_score_jobs: number;
  rank_enqueued: boolean;
};

export type RankIntegrityInput = {
  member_id: string;
  snapshot_date: string;
  pipeline_run_id: string | null;
  progress: MemberScoreProgressRow | null;
  score_snapshots_visible: number;
  score_snapshots_above_minimum: number;
};

export type RankIntegrityFailure = {
  error_code: "SCORE_RANK_ARTIFACT_GAP" | "SCORE_RANK_VISIBILITY_GAP";
  error_message: string;
};

/**
 * Distinguish pipeline zero (Rank never saw the scored universe) from legitimate zero.
 */
export function detectRankIntegrityFailure(
  input: RankIntegrityInput,
): RankIntegrityFailure | null {
  const progress = input.progress;
  if (!progress || !input.pipeline_run_id) {
    return null;
  }

  const expected = Number(progress.expected_score_jobs);
  const terminal = Number(progress.terminal_score_jobs);
  if (expected <= 0 || terminal < expected) {
    return null;
  }

  const visible = input.score_snapshots_visible;
  const aboveMinimum = input.score_snapshots_above_minimum;
  const minimum = DEFAULT_ALLOCATION_RULES.minimum_qualified_score;

  if (aboveMinimum >= 1 && visible === 0) {
    return {
      error_code: "SCORE_RANK_VISIBILITY_GAP",
      error_message: `At least one score snapshot is >= ${minimum} for ${input.snapshot_date} but Rank candidate list is empty.`,
    };
  }

  return null;
}

export async function loadRankIntegrityContext(
  repo: RadarRepository,
  input: {
    member_id: string;
    snapshot_date: string;
    pipeline_run_id: string | null;
  },
): Promise<RankIntegrityInput> {
  const progress = input.pipeline_run_id
    ? await repo.getMemberScoreProgress({
        pipeline_run_id: input.pipeline_run_id,
        member_id: input.member_id,
      })
    : null;

  const score_snapshots_visible = await repo.countMemberScoreSnapshotsForDate({
    member_id: input.member_id,
    snapshot_date: input.snapshot_date,
  });

  const score_snapshots_above_minimum = await repo.countMemberScoreSnapshotsAboveMinimum({
    member_id: input.member_id,
    snapshot_date: input.snapshot_date,
    minimum_score: DEFAULT_ALLOCATION_RULES.minimum_qualified_score,
  });

  return {
    member_id: input.member_id,
    snapshot_date: input.snapshot_date,
    pipeline_run_id: input.pipeline_run_id,
    progress,
    score_snapshots_visible,
    score_snapshots_above_minimum,
  };
}
