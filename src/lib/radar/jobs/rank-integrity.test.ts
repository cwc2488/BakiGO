import { describe, expect, it } from "vitest";
import { detectRankIntegrityFailure } from "./rank-integrity";

describe("detectRankIntegrityFailure", () => {
  const pipeline = "9e484340-4ccd-4c8c-9271-430705cae699";

  it("returns null when score jobs are not terminal", () => {
    expect(
      detectRankIntegrityFailure({
        member_id: "m1",
        snapshot_date: "2026-09-01",
        pipeline_run_id: pipeline,
        progress: { expected_score_jobs: 10, terminal_score_jobs: 5, rank_enqueued: true },
        score_snapshots_visible: 0,
        score_snapshots_above_minimum: 0,
      }),
    ).toBeNull();
  });

  it("flags SCORE_RANK_VISIBILITY_GAP when high scores exist but Rank sees none", () => {
    const failure = detectRankIntegrityFailure({
      member_id: "m1",
      snapshot_date: "2026-09-01",
      pipeline_run_id: pipeline,
      progress: { expected_score_jobs: 10, terminal_score_jobs: 10, rank_enqueued: true },
      score_snapshots_visible: 0,
      score_snapshots_above_minimum: 3,
    });
    expect(failure?.error_code).toBe("SCORE_RANK_VISIBILITY_GAP");
  });

  it("returns null when terminal complete with zero visible and no scores above floor", () => {
    expect(
      detectRankIntegrityFailure({
        member_id: "m1",
        snapshot_date: "2026-09-01",
        pipeline_run_id: pipeline,
        progress: { expected_score_jobs: 10, terminal_score_jobs: 10, rank_enqueued: true },
        score_snapshots_visible: 0,
        score_snapshots_above_minimum: 0,
      }),
    ).toBeNull();
  });

  it("returns null for legitimate zero (visible universe, none above floor)", () => {
    expect(
      detectRankIntegrityFailure({
        member_id: "m1",
        snapshot_date: "2026-09-01",
        pipeline_run_id: pipeline,
        progress: { expected_score_jobs: 100, terminal_score_jobs: 100, rank_enqueued: true },
        score_snapshots_visible: 100,
        score_snapshots_above_minimum: 0,
      }),
    ).toBeNull();
  });
});
