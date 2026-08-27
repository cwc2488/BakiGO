import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildValidExtractionFixture } from "../../extraction/test-fixtures";
import { normalizeCandidateContent } from "../../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../../normalization/test-fixtures";
import { InMemoryRadarRepository } from "../../repository/in-memory-repository";
import { createSourceAdapterRegistry } from "../../sources/registry";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../queue";
import type { RadarJobRecord } from "../types";
import {
  enqueueScoreJobsForMembers,
  maybeEnqueueRank,
  processClaimedJob,
  type WorkerContext,
} from "./dispatch";
import { runRankWorker } from "./rank-worker";
import { runScoreWorker } from "./score-worker";

const RUN_DATE = "2026-08-27";
const PIPELINE = "pipeline-gap-01";
const MEMBER = "member-gap-01";

function listJobs(queue: RadarJobQueue): RadarJobRecord[] {
  const store = (queue as unknown as { store: InMemoryRadarJobQueueStore }).store;
  return [...(store as unknown as { jobs: Map<string, RadarJobRecord> }).jobs.values()];
}

function progressOf(repo: InMemoryRadarRepository) {
  const row = repo.scoreProgress.get(`${PIPELINE}:${MEMBER}`);
  return {
    expected: Number(row?.expected_score_jobs ?? 0),
    terminal: Number(row?.terminal_score_jobs ?? 0),
    rank_enqueued: Boolean(row?.rank_enqueued),
  };
}

function baseCtx(repo: InMemoryRadarRepository, queue: RadarJobQueue): WorkerContext {
  return {
    repo,
    queue,
    sources: createSourceAdapterRegistry({
      record: (entry) => repo.recordSourceFetchAudit(entry),
    }),
    now: new Date("2026-08-27T04:00:00.000Z"),
  };
}

async function seedAnalysis(
  repo: InMemoryRadarRepository,
  candidate_id: string,
): Promise<{ analysis_run_id: string; normalization_run_id: string }> {
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
  await repo.insertAnalysisRun({
    id: analysis_run_id,
    candidate_id,
    status: "succeeded",
    analysis_input_fingerprint: `fp_${candidate_id}`,
    corpus_fingerprint: corpus.normalization_run_id,
    profile_semantic_hash: null,
    normalization_run_id,
    extraction_json: buildValidExtractionFixture({ candidate_id }),
    prompt_version: "ai_radar_extraction_v1.0",
    model_id: "gpt-4.1-mini",
  });
  return { analysis_run_id, normalization_run_id };
}

function scoreJob(input: {
  id: string;
  candidate_id: string;
  analysis_run_id: string;
  idempotency_key?: string;
}): RadarJobRecord {
  return {
    id: input.id,
    pipeline_run_id: PIPELINE,
    job_type: "score",
    idempotency_key:
      input.idempotency_key ??
      `pipeline:${RUN_DATE}:score:${MEMBER}:${input.candidate_id}:${input.analysis_run_id}`,
    status: "running",
    payload: {
      run_date: RUN_DATE,
      member_id: MEMBER,
      candidate_id: input.candidate_id,
      artifact_refs: { analysis_run_id: input.analysis_run_id },
    },
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

describe("RADAR-MEMBER-SNAPSHOT-GAP-01 score progress → rank gate", () => {
  it("1. excluded score job advances terminal and enqueues rank", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const { analysis_run_id } = await seedAnalysis(repo, "cand_excluded");
    await repo.setMemberCandidateState({
      member_id: MEMBER,
      candidate_id: "cand_excluded",
      development_state: "in_progress",
      excluded_from_recommendations: true,
    });
    await repo.initMemberScoreProgress({
      pipeline_run_id: PIPELINE,
      member_id: MEMBER,
      expected_score_jobs: 1,
    });

    const result = await runScoreWorker(
      ctx,
      scoreJob({ id: "score-ex-1", candidate_id: "cand_excluded", analysis_run_id }),
    );

    expect(result.status).toBe("succeeded");
    expect(result.metrics?.excluded).toBe(true);
    expect(progressOf(repo)).toEqual({ expected: 1, terminal: 1, rank_enqueued: true });
    expect(listJobs(queue).filter((job) => job.job_type === "rank")).toHaveLength(1);
  });

  it("2. normal score job still advances progress and can enqueue rank", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const { analysis_run_id } = await seedAnalysis(repo, "cand_normal");
    await repo.initMemberScoreProgress({
      pipeline_run_id: PIPELINE,
      member_id: MEMBER,
      expected_score_jobs: 1,
    });

    const result = await runScoreWorker(
      ctx,
      scoreJob({ id: "score-n-1", candidate_id: "cand_normal", analysis_run_id }),
    );

    expect(result.status).toBe("succeeded");
    expect(result.metrics?.excluded).toBeUndefined();
    expect(progressOf(repo)).toEqual({ expected: 1, terminal: 1, rank_enqueued: true });
    expect(listJobs(queue).filter((job) => job.job_type === "rank")).toHaveLength(1);
  });

  it("3. duplicate/idempotent score enqueue does not inflate expected", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const { analysis_run_id } = await seedAnalysis(repo, "cand_dup");

    await enqueueScoreJobsForMembers(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      candidate_id: "cand_dup",
      analysis_run_id,
      member_ids: [MEMBER],
    });
    expect(progressOf(repo).expected).toBe(1);

    await enqueueScoreJobsForMembers(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      candidate_id: "cand_dup",
      analysis_run_id,
      member_ids: [MEMBER],
    });
    expect(progressOf(repo).expected).toBe(1);
    expect(listJobs(queue).filter((job) => job.job_type === "score")).toHaveLength(1);
  });

  it("4. mixed normal + excluded terminals reach expected and enqueue exactly one rank", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const normal = await seedAnalysis(repo, "cand_mix_n");
    const excluded = await seedAnalysis(repo, "cand_mix_x");
    await repo.setMemberCandidateState({
      member_id: MEMBER,
      candidate_id: "cand_mix_x",
      development_state: "already_known",
      excluded_from_recommendations: true,
    });

    await enqueueScoreJobsForMembers(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      candidate_id: "cand_mix_n",
      analysis_run_id: normal.analysis_run_id,
      member_ids: [MEMBER],
    });
    await enqueueScoreJobsForMembers(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      candidate_id: "cand_mix_x",
      analysis_run_id: excluded.analysis_run_id,
      member_ids: [MEMBER],
    });
    expect(progressOf(repo).expected).toBe(2);

    const claimed = await queue.claim({ job_types: ["score"], limit: 10, now: ctx.now });
    expect(claimed).toHaveLength(2);
    for (const job of claimed) {
      await processClaimedJob(ctx, job);
    }

    expect(progressOf(repo)).toEqual({ expected: 2, terminal: 2, rank_enqueued: true });
    expect(listJobs(queue).filter((job) => job.job_type === "rank")).toHaveLength(1);
  });

  it("5. repeated processing does not duplicate rank or snapshots", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const { analysis_run_id } = await seedAnalysis(repo, "cand_rep");
    await repo.setMemberCandidateState({
      member_id: MEMBER,
      candidate_id: "cand_rep",
      development_state: "in_progress",
      excluded_from_recommendations: true,
    });

    await enqueueScoreJobsForMembers(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      candidate_id: "cand_rep",
      analysis_run_id,
      member_ids: [MEMBER],
    });
    expect(progressOf(repo).expected).toBe(1);

    const [claimed] = await queue.claim({ job_types: ["score"], limit: 1, now: ctx.now });
    expect(claimed).toBeTruthy();
    await processClaimedJob(ctx, claimed!);
    expect(progressOf(repo).rank_enqueued).toBe(true);
    expect(progressOf(repo).terminal).toBe(1);

    // Idempotent re-enqueue + maybeEnqueueRank must not inflate expected or duplicate rank.
    await enqueueScoreJobsForMembers(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      candidate_id: "cand_rep",
      analysis_run_id,
      member_ids: [MEMBER],
    });
    const again = await maybeEnqueueRank(ctx, {
      pipeline_run_id: PIPELINE,
      run_date: RUN_DATE,
      member_id: MEMBER,
    });
    expect(again).toBeNull();
    expect(progressOf(repo)).toEqual({ expected: 1, terminal: 1, rank_enqueued: true });

    const rankJobs = listJobs(queue).filter((jobRow) => jobRow.job_type === "rank");
    expect(rankJobs).toHaveLength(1);

    const first = await runRankWorker(ctx, {
      ...rankJobs[0]!,
      status: "running",
    });
    expect(first.status).toBe("succeeded");
    const snap1 = await repo.getMemberDailyTop20(MEMBER, RUN_DATE);
    expect(snap1).not.toBeNull();

    const second = await runRankWorker(ctx, {
      ...rankJobs[0]!,
      id: randomUUID(),
      status: "running",
    });
    expect(second.status).toBe("succeeded");
    const snap2 = await repo.getMemberDailyTop20(MEMBER, RUN_DATE);
    expect(snap2?.id).toBe(snap1?.id);
    expect(repo.top20.size).toBe(1);
  });
});
