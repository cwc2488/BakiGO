import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildValidExtractionFixture } from "../extraction/test-fixtures";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../normalization/test-fixtures";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { createSourceAdapterRegistry } from "../sources/registry";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "./queue";
import type { RadarJobRecord } from "./types";
import type { OverallScoreResult } from "../scoring/types";
import { maybeEnqueueRank, type WorkerContext } from "./workers/dispatch";
import { runRankWorker } from "./workers/rank-worker";
import { runMemberRankRebuild } from "./run-member-rank-rebuild";

const RUN_DATE = "2026-09-01";
const PIPELINE = "9e484340-4ccd-4c8c-9271-430705cae699";
const MEMBER_A = "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92";
const MEMBER_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

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

function baseCtx(repo: InMemoryRadarRepository, queue: RadarJobQueue): WorkerContext {
  return {
    repo,
    queue,
    sources: createSourceAdapterRegistry({
      record: (entry) => repo.recordSourceFetchAudit(entry),
    }),
    now: new Date("2026-09-01T04:00:00.000Z"),
  };
}

function rankJob(member_id: string, pipeline_run_id = PIPELINE): RadarJobRecord {
  return {
    id: randomUUID(),
    pipeline_run_id,
    job_type: "rank",
    idempotency_key: `rank:${member_id}`,
    status: "running",
    payload: {
      run_date: RUN_DATE,
      member_id,
      artifact_refs: {},
    },
    priority: 0,
    attempt_count: 1,
    max_attempts: 8,
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

async function seedEligibleCandidate(
  repo: InMemoryRadarRepository,
  member_id: string,
  candidate_id: string,
  overall_score: number,
  now: Date,
) {
  const analysis_run_id = randomUUID();
  const normalization_run_id = `norm_${candidate_id}`;
  await repo.upsertCandidate({
    id: candidate_id,
    display_name: candidate_id,
    primary_platform: "threads",
    normalized_username: candidate_id.replace(/[^a-z0-9_]/gi, ""),
  });
  const corpus = normalizeCandidateContent({
    candidate_id,
    normalization_run_id,
    snapshots: [
      buildRawSnapshot({
        candidate_id,
        external_content_id: `${candidate_id}_1`,
      }),
    ],
  });
  await repo.persistNormalizationRun(corpus);
  const fingerprint = `fp_${candidate_id}`;
  const corpusFp = corpus.normalization_run_id;
  await repo.insertAnalysisRun({
    id: analysis_run_id,
    candidate_id,
    status: "succeeded",
    analysis_input_fingerprint: fingerprint,
    corpus_fingerprint: corpusFp,
    profile_semantic_hash: null,
    normalization_run_id,
    extraction_json: buildValidExtractionFixture({ candidate_id }),
    prompt_version: "ai_radar_extraction_v1.0",
    model_id: "gpt-4.1-mini",
  });
  await repo.updateRefreshStateAfterNormalize({
    candidate_id,
    corpus_fingerprint: corpusFp,
    profile_semantic_hash: null,
    data_completeness: "full",
    current_analysis_run_id: analysis_run_id,
    validated_extraction_fingerprint: fingerprint,
    now,
  });
  await repo.updateRefreshStateAfterEnrich({
    candidate_id,
    succeeded: true,
    now,
  });
  await repo.insertMemberScoreSnapshot({
    id: randomUUID(),
    member_id,
    candidate_id,
    analysis_run_id,
    baseline_score_snapshot_id: randomUUID(),
    overall_score,
    component_scores: {},
    location_level: "unknown",
    snapshot_date: RUN_DATE,
    result: scoreResult(overall_score),
  });
}

async function seedLowScoreOnly(
  repo: InMemoryRadarRepository,
  member_id: string,
  index: number,
) {
  const candidate_id = `cand_low_${index}`;
  await repo.insertMemberScoreSnapshot({
    id: randomUUID(),
    member_id,
    candidate_id,
    analysis_run_id: randomUUID(),
    baseline_score_snapshot_id: randomUUID(),
    overall_score: 35,
    component_scores: {},
    location_level: "unknown",
    snapshot_date: RUN_DATE,
    result: scoreResult(35),
  });
}

describe("Score → Rank contract", () => {
  it("legitimate zero: 100 visible snapshots all below floor succeeds with item_count 0", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    await repo.initMemberScoreProgress({
      pipeline_run_id: PIPELINE,
      member_id: MEMBER_A,
      expected_score_jobs: 100,
    });
    for (let i = 0; i < 100; i += 1) {
      await seedLowScoreOnly(repo, MEMBER_A, i);
    }
    repo.scoreProgress.set(`${PIPELINE}:${MEMBER_A}`, {
      expected_score_jobs: 100,
      terminal_score_jobs: 100,
      rank_enqueued: false,
    });

    const result = await runRankWorker(ctx, rankJob(MEMBER_A));
    expect(result.status).toBe("succeeded");
    expect(result.metrics?.score_snapshots_visible).toBe(100);
    expect(result.metrics?.skipped_below_minimum_score).toBe(100);
    expect(result.metrics?.item_count).toBe(0);
    expect(result.metrics?.full_precision_top_score).toBeNull();
  });

  it("ranks exactly 3 when 100 visible and 3 scores >= 40", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    for (let i = 0; i < 97; i += 1) {
      await seedLowScoreOnly(repo, MEMBER_A, i);
    }
    await seedEligibleCandidate(repo, MEMBER_A, "cand_threads_zhangbh__06", 68.5, now);
    await seedEligibleCandidate(repo, MEMBER_A, "cand_threads_huang.o_0", 48.25, now);
    await seedEligibleCandidate(repo, MEMBER_A, "cand_threads_miss.fang66", 43.75, now);

    repo.scoreProgress.set(`${PIPELINE}:${MEMBER_A}`, {
      expected_score_jobs: 100,
      terminal_score_jobs: 100,
      rank_enqueued: false,
    });

    const result = await runRankWorker(ctx, rankJob(MEMBER_A));
    expect(result.status).toBe("succeeded");
    expect(result.metrics?.score_snapshots_visible).toBe(100);
    expect(result.metrics?.item_count).toBe(3);
    const top20 = await repo.getMemberDailyTop20(MEMBER_A, RUN_DATE);
    const scores = top20?.items.map((item) => item.overall_score).sort((a, b) => b - a);
    expect(scores).toEqual([68.5, 48.25, 43.75]);
  });

  it("pipeline zero: high scores in DB but Rank sees none → integrity failure", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    await seedEligibleCandidate(repo, MEMBER_A, "cand_gap_a", 68.5, now);
    await seedEligibleCandidate(repo, MEMBER_A, "cand_gap_b", 48.25, now);
    await seedEligibleCandidate(repo, MEMBER_A, "cand_gap_c", 43.75, now);

    repo.scoreProgress.set(`${PIPELINE}:${MEMBER_A}`, {
      expected_score_jobs: 50,
      terminal_score_jobs: 50,
      rank_enqueued: true,
    });

    const originalVisible = repo.countMemberScoreSnapshotsForDate.bind(repo);
    const originalAbove = repo.countMemberScoreSnapshotsAboveMinimum.bind(repo);
    repo.countMemberScoreSnapshotsForDate = async () => 0;
    repo.countMemberScoreSnapshotsAboveMinimum = async () => 3;
    const originalList = repo.listMemberScoreSnapshots.bind(repo);
    repo.listMemberScoreSnapshots = async () => [];

    const result = await runRankWorker(ctx, rankJob(MEMBER_A));
    repo.countMemberScoreSnapshotsForDate = originalVisible;
    repo.countMemberScoreSnapshotsAboveMinimum = originalAbove;
    repo.listMemberScoreSnapshots = originalList;

    expect(result.status).toBe("failed");
    expect(result.error_code).toBe("SCORE_RANK_VISIBILITY_GAP");
    expect(result.metrics?.item_count).toBe(0);
  });

  it("maybeEnqueueRank waits when scored artifacts exist but same-day filter sees none", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    await seedEligibleCandidate(repo, MEMBER_A, "cand_wait", 55, now);
    repo.scoreProgress.set(`${PIPELINE}:${MEMBER_A}`, {
      expected_score_jobs: 5,
      terminal_score_jobs: 5,
      rank_enqueued: false,
    });

    const originalCount = repo.countMemberScoreSnapshotsForDate.bind(repo);
    repo.countMemberScoreSnapshotsForDate = async () => 0;

    const enqueued = await maybeEnqueueRank(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      member_id: MEMBER_A,
    });
    repo.countMemberScoreSnapshotsForDate = originalCount;

    expect(enqueued).toBeNull();
    expect(repo.scoreProgress.get(`${PIPELINE}:${MEMBER_A}`)?.rank_enqueued).toBe(false);
  });

  it("does not cross-bind score universes between concurrent members", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    await seedEligibleCandidate(repo, MEMBER_A, "cand_a_only", 55, now);
    await seedEligibleCandidate(repo, MEMBER_B, "cand_b_only", 60, now);

    const resultA = await runRankWorker(ctx, rankJob(MEMBER_A));
    const resultB = await runRankWorker(ctx, rankJob(MEMBER_B));

    expect(resultA.status).toBe("succeeded");
    expect(resultB.status).toBe("succeeded");
    const topA = await repo.getMemberDailyTop20(MEMBER_A, RUN_DATE);
    const topB = await repo.getMemberDailyTop20(MEMBER_B, RUN_DATE);
    expect(topA?.items.map((i) => i.candidateId)).toEqual(["cand_a_only"]);
    expect(topB?.items.map((i) => i.candidateId)).toEqual(["cand_b_only"]);
  });

  it("same-day idempotent rebuild replaces empty Top20 without duplicate occurrences", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    await seedEligibleCandidate(repo, MEMBER_A, "cand_rebuild", 50, now);
    await repo.upsertMemberDailyTop20({
      member_id: MEMBER_A,
      pipeline_run_id: PIPELINE,
      snapshot_date: RUN_DATE,
      generated_at: now,
      items: [],
    });

    const rebuild = await runMemberRankRebuild(ctx, {
      member_id: MEMBER_A,
      snapshot_date: RUN_DATE,
      pipeline_run_id: PIPELINE,
      recovery_tag: "test_rebuild",
    });

    expect(rebuild.ok).toBe(true);
    expect(rebuild.item_count).toBe(1);
    const top20 = await repo.getMemberDailyTop20(MEMBER_A, RUN_DATE);
    expect(top20?.item_count).toBe(1);
    expect(repo.recommendationOccurrences.length).toBe(1);
  });

  it("historical score rows do not shrink today's visible universe", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    for (let i = 0; i < 1500; i += 1) {
      await repo.insertMemberScoreSnapshot({
        id: randomUUID(),
        member_id: MEMBER_A,
        candidate_id: `cand_hist_${i}`,
        analysis_run_id: randomUUID(),
        baseline_score_snapshot_id: randomUUID(),
        overall_score: 39,
        component_scores: {},
        location_level: "unknown",
        snapshot_date: "2026-08-01",
        result: scoreResult(39),
      });
    }
    for (let i = 0; i < 5; i += 1) {
      await seedLowScoreOnly(repo, MEMBER_A, i);
    }

    const visible = await repo.countMemberScoreSnapshotsForDate({
      member_id: MEMBER_A,
      snapshot_date: RUN_DATE,
    });
    expect(visible).toBe(5);

    const listed = await repo.listMemberScoreSnapshots({
      member_id: MEMBER_A,
      snapshot_date: RUN_DATE,
    });
    expect(listed.length).toBe(5);
  });
});
