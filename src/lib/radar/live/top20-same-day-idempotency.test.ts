import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import { runRankWorker } from "../jobs/workers/rank-worker";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { createSourceAdapterRegistry } from "../sources/registry";
import { applyRadarPartnerAction } from "../partner/apply-radar-partner-action";
import { loadRadarPartnerFeed } from "../partner/load-radar-partner-feed";
import { DEFAULT_ALLOCATION_RULES } from "../allocation/allocation-rules";
import { buildValidExtractionFixture } from "../extraction/test-fixtures";
import type { RadarJobRecord } from "../jobs/types";
import type { OverallScoreResult } from "../scoring/types";

const MEMBER = "member-a";
const RUN_DATE = "2026-08-21";
const NOW = new Date("2026-08-21T08:00:00.000Z");

function scoreResult(overall: number): OverallScoreResult {
  return {
    scoring_version: "v1",
    overall_score: overall,
    components: {
      change_window_score: 20,
      change_intent_score: 8,
      behavioral_change_score: 6,
      solution_gap_score: 6,
      needs_fit_score: 15,
      contactability_score: 10,
      natural_entry_score: 6,
      interaction_openness_score: 4,
      core_traits_score: 3,
      activity_score: 3,
      location_score: 2.5,
    },
    core_traits: {
      trait_scores: [],
      core_traits_score: 3,
      profile_observability: {
        profile_observability_level: "medium",
        analyzable_item_count: 10,
        excluded_repost_count: 0,
        excluded_duplicate_count: 0,
        excluded_empty_share_count: 0,
        excluded_no_expression_count: 0,
        excluded_unattributable_count: 0,
      },
      trait_observability: [],
    },
    needs: [],
  };
}

async function seedCandidate(
  repo: InMemoryRadarRepository,
  input: { candidate_id: string; score: number; now?: Date },
) {
  const now = input.now ?? NOW;
  const analysisRunId = randomUUID();
  const fingerprint = `fp_${input.candidate_id}`;
  const corpusFingerprint = `corpus_${input.candidate_id}`;

  await repo.upsertCandidate({
    id: input.candidate_id,
    display_name: input.candidate_id,
    normalized_username: input.candidate_id.replace(/[^a-z0-9]/g, ""),
  });
  await repo.insertAnalysisRun({
    id: analysisRunId,
    candidate_id: input.candidate_id,
    status: "succeeded",
    analysis_input_fingerprint: fingerprint,
    corpus_fingerprint: corpusFingerprint,
    profile_semantic_hash: null,
    normalization_run_id: `norm_${input.candidate_id}`,
    extraction_json: buildValidExtractionFixture({ candidate_id: input.candidate_id }),
    prompt_version: "ai_radar_extraction_v1.0",
    model_id: "gpt-4.1-mini",
  });
  await repo.updateRefreshStateAfterNormalize({
    candidate_id: input.candidate_id,
    corpus_fingerprint: corpusFingerprint,
    profile_semantic_hash: null,
    data_completeness: "full",
    current_analysis_run_id: analysisRunId,
    validated_extraction_fingerprint: fingerprint,
    now,
  });
  await repo.updateRefreshStateAfterEnrich({
    candidate_id: input.candidate_id,
    succeeded: true,
    now,
  });
  return { analysis_run_id: analysisRunId };
}

/** Writes the score snapshot a score-worker run would append. */
async function scoreCandidate(
  repo: InMemoryRadarRepository,
  input: { candidate_id: string; score: number; analysis_run_id: string },
) {
  await repo.insertMemberScoreSnapshot({
    id: randomUUID(),
    member_id: MEMBER,
    candidate_id: input.candidate_id,
    analysis_run_id: input.analysis_run_id,
    baseline_score_snapshot_id: randomUUID(),
    overall_score: input.score,
    component_scores: {},
    location_level: "unknown",
    snapshot_date: RUN_DATE,
    result: scoreResult(input.score),
  });
}

function rankJob(pipeline_run_id: string | null): RadarJobRecord {
  return {
    id: `rank-${randomUUID()}`,
    pipeline_run_id,
    job_type: "rank",
    idempotency_key: `k-${randomUUID()}`,
    status: "running",
    payload: { run_date: RUN_DATE, member_id: MEMBER, artifact_refs: {} },
    priority: 0,
    attempt_count: 1,
    max_attempts: 3,
    scheduled_at: "",
    available_at: "",
    started_at: null,
    finished_at: null,
    error_code: null,
    error_message: null,
    trace_id: null,
    created_at: "",
    updated_at: "",
  };
}

async function rank(
  repo: InMemoryRadarRepository,
  options: { pipeline_run_id?: string | null; now?: Date } = {},
) {
  const now = options.now ?? NOW;
  const result = await runRankWorker(
    {
      repo,
      queue: new RadarJobQueue(new InMemoryRadarJobQueueStore()),
      sources: createSourceAdapterRegistry(),
      now,
    },
    rankJob(options.pipeline_run_id ?? "run-1"),
  );
  const snapshot = await repo.getMemberDailyTop20(MEMBER, RUN_DATE);
  return { result, snapshot };
}

function occurrencesFor(repo: InMemoryRadarRepository) {
  return repo.recommendationOccurrences.filter(
    (row) => row.member_id === MEMBER && row.snapshot_date === RUN_DATE,
  );
}

describe("P2C — same-day Top20 re-runs", () => {
  it("keeps one snapshot with a stable identity across three runs", async () => {
    const repo = new InMemoryRadarRepository();
    const first = await seedCandidate(repo, { candidate_id: "cand_one", score: 71 });
    await scoreCandidate(repo, {
      candidate_id: "cand_one",
      score: 71,
      analysis_run_id: first.analysis_run_id,
    });

    const run1 = await rank(repo);
    const run2 = await rank(repo, { pipeline_run_id: "run-2" });
    const run3 = await rank(repo, { pipeline_run_id: "run-3" });

    expect(run1.result.status).toBe("succeeded");
    expect(run2.result.status).toBe("succeeded");
    expect(run3.result.status).toBe("succeeded");

    expect(run2.snapshot?.id).toBe(run1.snapshot?.id);
    expect(run3.snapshot?.id).toBe(run1.snapshot?.id);
    expect(repo.top20.size).toBe(1);
    expect(run3.snapshot?.items.map((item) => item.candidateId)).toEqual(["cand_one"]);
  });

  it("refreshes snapshot content and provenance on the re-run", async () => {
    const repo = new InMemoryRadarRepository();
    const first = await seedCandidate(repo, { candidate_id: "cand_one", score: 71 });
    await scoreCandidate(repo, {
      candidate_id: "cand_one",
      score: 71,
      analysis_run_id: first.analysis_run_id,
    });
    await rank(repo, { pipeline_run_id: "run-1" });

    const second = await seedCandidate(repo, { candidate_id: "cand_two", score: 88 });
    await scoreCandidate(repo, {
      candidate_id: "cand_two",
      score: 88,
      analysis_run_id: second.analysis_run_id,
    });
    const { snapshot } = await rank(repo, { pipeline_run_id: "run-2" });

    expect(snapshot?.items.map((item) => item.candidateId)).toEqual(["cand_two", "cand_one"]);
    expect(snapshot?.item_count).toBe(2);
    expect(snapshot?.pipeline_run_id).toBe("run-2");
  });

  it("does not duplicate occurrences when the same day is ranked again", async () => {
    const repo = new InMemoryRadarRepository();
    const first = await seedCandidate(repo, { candidate_id: "cand_one", score: 71 });
    await scoreCandidate(repo, {
      candidate_id: "cand_one",
      score: 71,
      analysis_run_id: first.analysis_run_id,
    });

    const run1 = await rank(repo);
    const run2 = await rank(repo, { pipeline_run_id: "run-2" });

    expect(run1.result.metrics?.occurrences_appended).toBe(1);
    expect(run2.result.metrics?.occurrences_appended).toBe(0);
    expect(run2.result.metrics?.occurrences_skipped_existing).toBe(1);
    expect(occurrencesFor(repo)).toHaveLength(1);
    expect(occurrencesFor(repo)[0].member_daily_top20_id).toBe(run2.snapshot?.id);
  });

  it("records only the newly ranked candidate on a re-run that adds one", async () => {
    const repo = new InMemoryRadarRepository();
    const first = await seedCandidate(repo, { candidate_id: "cand_one", score: 71 });
    await scoreCandidate(repo, {
      candidate_id: "cand_one",
      score: 71,
      analysis_run_id: first.analysis_run_id,
    });
    await rank(repo);

    const second = await seedCandidate(repo, { candidate_id: "cand_two", score: 88 });
    await scoreCandidate(repo, {
      candidate_id: "cand_two",
      score: 88,
      analysis_run_id: second.analysis_run_id,
    });
    const run2 = await rank(repo, { pipeline_run_id: "run-2" });

    expect(run2.result.metrics?.occurrences_appended).toBe(1);
    expect(occurrencesFor(repo).map((row) => row.candidate_id).sort()).toEqual([
      "cand_one",
      "cand_two",
    ]);
  });

  it("ranks a re-scored candidate once, not once per score snapshot", async () => {
    const repo = new InMemoryRadarRepository();
    const seeded = await seedCandidate(repo, { candidate_id: "cand_one", score: 60 });
    await scoreCandidate(repo, {
      candidate_id: "cand_one",
      score: 60,
      analysis_run_id: seeded.analysis_run_id,
    });
    // A second pipeline pass re-scores the same candidate for the same day.
    await scoreCandidate(repo, {
      candidate_id: "cand_one",
      score: 77,
      analysis_run_id: seeded.analysis_run_id,
    });

    const { snapshot } = await rank(repo, { pipeline_run_id: "run-2" });

    expect(snapshot?.items).toHaveLength(1);
    expect(snapshot?.items[0].overall_score).toBe(77);
    expect(occurrencesFor(repo)).toHaveLength(1);
  });

  it("does not revive a candidate the member already handled", async () => {
    const repo = new InMemoryRadarRepository();
    const first = await seedCandidate(repo, { candidate_id: "cand_one", score: 71 });
    await scoreCandidate(repo, {
      candidate_id: "cand_one",
      score: 71,
      analysis_run_id: first.analysis_run_id,
    });
    const second = await seedCandidate(repo, { candidate_id: "cand_two", score: 65 });
    await scoreCandidate(repo, {
      candidate_id: "cand_two",
      score: 65,
      analysis_run_id: second.analysis_run_id,
    });
    await rank(repo);

    const skipped = await applyRadarPartnerAction({
      repo,
      member_id: MEMBER,
      candidate_id: "cand_two",
      action: "skip",
      now: NOW,
    });
    expect(skipped.ok).toBe(true);

    const { snapshot } = await rank(repo, { pipeline_run_id: "run-2" });
    expect(snapshot?.items.map((item) => item.candidateId)).toEqual(["cand_one"]);

    const feed = await loadRadarPartnerFeed({ repo, member_id: MEMBER, now: NOW });
    expect(feed.items.map((card) => card.candidate_id)).toEqual(["cand_one"]);
  });

  it("does not hand out more than the daily cap when a re-run finds new candidates", async () => {
    const repo = new InMemoryRadarRepository();
    const cap = DEFAULT_ALLOCATION_RULES.daily_recommendation_cap;
    for (let index = 0; index < cap; index += 1) {
      const seeded = await seedCandidate(repo, { candidate_id: `cand_day1_${index}`, score: 50 });
      await scoreCandidate(repo, {
        candidate_id: `cand_day1_${index}`,
        score: 50,
        analysis_run_id: seeded.analysis_run_id,
      });
    }
    await rank(repo);
    expect(occurrencesFor(repo)).toHaveLength(cap);

    // Higher-scoring newcomers appear later the same day.
    for (const suffix of ["a", "b"]) {
      const seeded = await seedCandidate(repo, { candidate_id: `cand_new_${suffix}`, score: 95 });
      await scoreCandidate(repo, {
        candidate_id: `cand_new_${suffix}`,
        score: 95,
        analysis_run_id: seeded.analysis_run_id,
      });
    }
    const { snapshot } = await rank(repo, { pipeline_run_id: "run-2" });

    expect(snapshot?.items).toHaveLength(cap);
    expect(snapshot?.items.some((item) => item.candidateId.startsWith("cand_new_"))).toBe(false);
    expect(occurrencesFor(repo)).toHaveLength(cap);
    expect(snapshot?.items.map((item) => item.rank)).toEqual(
      Array.from({ length: cap }, (_, index) => index + 1),
    );
  });

  it("keeps the quality gate and daily cap on a re-run", async () => {
    const repo = new InMemoryRadarRepository();
    for (let index = 0; index < 24; index += 1) {
      const seeded = await seedCandidate(repo, {
        candidate_id: `cand_ok_${index}`,
        score: 50 + index,
      });
      await scoreCandidate(repo, {
        candidate_id: `cand_ok_${index}`,
        score: 50 + index,
        analysis_run_id: seeded.analysis_run_id,
      });
    }
    const low = await seedCandidate(repo, { candidate_id: "cand_low", score: 39 });
    await scoreCandidate(repo, {
      candidate_id: "cand_low",
      score: 39,
      analysis_run_id: low.analysis_run_id,
    });

    await rank(repo);
    const { snapshot } = await rank(repo, { pipeline_run_id: "run-2" });

    expect(snapshot?.items).toHaveLength(DEFAULT_ALLOCATION_RULES.daily_recommendation_cap);
    expect(snapshot?.items.some((item) => item.candidateId === "cand_low")).toBe(false);
    expect(occurrencesFor(repo)).toHaveLength(
      DEFAULT_ALLOCATION_RULES.daily_recommendation_cap,
    );
  });
});
