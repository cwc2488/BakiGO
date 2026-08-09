import { describe, expect, it } from "vitest";
import { FixtureAiRadarLlmProvider } from "../ai/provider";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import { processClaimedJob } from "../jobs/workers/dispatch";
import { InMemoryPipelineStore } from "../pipeline/in-memory-pipeline-store";
import { runDailyPipelineOrchestrator } from "../pipeline/orchestrator";
import { runPipelineFinalizer } from "../pipeline/run-finalizer";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { createSourceAdapterRegistry } from "../sources/registry";
import { applyReadTimeDevelopmentFilter } from "../today/build-today-response";
import type { RadarJobRecord } from "../jobs/types";

function createHarness(now = new Date("2026-08-09T03:00:00.000Z")) {
  const repo = new InMemoryRadarRepository();
  const pipelineStore = new InMemoryPipelineStore();
  const queueStore = new InMemoryRadarJobQueueStore();
  const queue = new RadarJobQueue(queueStore);

  repo.members = [{ member_id: "member-a" }, { member_id: "member-b" }];
  repo.developmentAreas.set("member-a", [
    {
      member_id: "member-a",
      area_role: "primary",
      normalized_city: "台北市",
      normalized_district: "大安區",
      sort_order: 0,
    },
  ]);

  pipelineStore.members = repo.members;
  pipelineStore.keywordsByMember = {
    "member-a": [{ keyword_id: "kw-1", phrase: "健身", discovery_weight: 10 }],
    "member-b": [{ keyword_id: "kw-2", phrase: "創業", discovery_weight: 8 }],
  };
  pipelineStore.refreshCandidates = [];

  const ctx = {
    repo,
    queue,
    sources: createSourceAdapterRegistry({ record: (entry) => repo.recordSourceFetchAudit(entry) }),
    pipelineStore,
    llm: new FixtureAiRadarLlmProvider(),
    now,
  };

  return { repo, pipelineStore, queueStore, queue, ctx, now };
}

async function runJob(ctx: ReturnType<typeof createHarness>["ctx"], job: RadarJobRecord) {
  await processClaimedJob(ctx, job);
  const updated = await ctx.queue["store"].findById(job.id);
  return updated;
}

describe("radar pipeline chain integration", () => {
  it("pipeline remains running after enqueue", async () => {
    const { pipelineStore, ctx, now } = createHarness();
    const result = await runDailyPipelineOrchestrator(
      { store: pipelineStore, queue: ctx.queue },
      { run_date: "2026-08-09", now },
    );
    const run = pipelineStore.pipelineRuns.get(result.pipeline_run_id);
    expect(run?.status).toBe("running");
    expect(run?.counts.enqueued).toBe(true);
  });

  it("enrich completes before normalize consumes new artifact", async () => {
    const { ctx, queueStore, now } = createHarness();
    const { job: enrichJob } = await ctx.queue.enqueue(
      {
        job_type: "enrich",
        idempotency_key: "test:enrich:c1",
        payload: {
          run_date: "2026-08-09",
          candidate_id: "cand_chain_1",
          platform: "threads",
          artifact_refs: {},
        },
      },
      now,
    );
    await ctx.repo.upsertCandidate({ id: "cand_chain_1", primary_platform: "threads" });

    const enrichResult = await runJob(ctx, enrichJob);
    expect(enrichResult?.status).toBe("succeeded");

    const normalizeJobs = [...queueStore["jobs"].values()].filter((job) => job.job_type === "normalize");
    expect(normalizeJobs).toHaveLength(1);
    expect((normalizeJobs[0].payload as { artifact_refs?: { raw_snapshot_ids?: string[] } }).artifact_refs?.raw_snapshot_ids?.length).toBeGreaterThan(0);
  });

  it("normalize failure prevents analyze for that input", async () => {
    const { ctx, now } = createHarness();
    const { job: normalizeJob } = await ctx.queue.enqueue(
      {
        job_type: "normalize",
        idempotency_key: "test:normalize:missing",
        payload: {
          run_date: "2026-08-09",
          candidate_id: "cand_missing",
          artifact_refs: { raw_snapshot_ids: ["missing_raw"] },
        },
      },
      now,
    );

    const result = await runJob(ctx, normalizeJob);
    expect(result?.status).toBe("failed");

    const analyzeJobs = [...(await ctx.queue.claim({ limit: 10, now }))].filter(
      (job) => job.job_type === "analyze",
    );
    expect(analyzeJobs).toHaveLength(0);
  });

  it("unchanged corpus reuses AI cache without re-calling LLM", async () => {
    const { ctx, now } = createHarness();
    await ctx.repo.upsertCandidate({ id: "cand_cache", primary_platform: "threads" });

    const enrich = await runJob(
      ctx,
      (
        await ctx.queue.enqueue(
          {
            job_type: "enrich",
            idempotency_key: "cache:enrich",
            payload: {
              run_date: "2026-08-09",
              candidate_id: "cand_cache",
              platform: "threads",
              artifact_refs: {},
            },
          },
          now,
        )
      ).job,
    );
    expect(enrich?.status).toBe("succeeded");

    const normalize = [...(await ctx.queue.claim({ limit: 5, now }))].find(
      (job) => job.job_type === "normalize",
    );
    expect(normalize).toBeTruthy();
    const normalizeResult = await runJob(ctx, normalize!);
    expect(normalizeResult?.status).toBe("succeeded");

    const analyze1 = [...(await ctx.queue.claim({ limit: 5, now }))].find(
      (job) => job.job_type === "analyze",
    );
    expect(analyze1).toBeTruthy();
    await runJob(ctx, analyze1!);

    const callsBefore = ctx.repo.analysisRuns.size;

    const enrich2 = await runJob(
      ctx,
      (
        await ctx.queue.enqueue(
          {
            job_type: "enrich",
            idempotency_key: "cache:enrich:2",
            payload: {
              run_date: "2026-08-09",
              candidate_id: "cand_cache",
              platform: "threads",
              artifact_refs: {},
            },
          },
          now,
        )
      ).job,
    );
    expect(enrich2?.status).toBe("succeeded");

    const normalize2 = [...(await ctx.queue.claim({ limit: 5, now }))].find(
      (job) => job.job_type === "normalize",
    );
    await runJob(ctx, normalize2!);

    expect(ctx.repo.analysisRuns.size).toBe(callsBefore);
  });

  it("finalizer resolves success when all jobs terminal success", async () => {
    const { pipelineStore, ctx, now } = createHarness();
    const orchestrated = await runDailyPipelineOrchestrator(
      { store: pipelineStore, queue: ctx.queue },
      { run_date: "2026-08-09", now },
    );

    pipelineStore.trackJob(orchestrated.pipeline_run_id, {
      id: "job-1",
      pipeline_run_id: orchestrated.pipeline_run_id,
      job_type: "discover",
      idempotency_key: "k1",
      status: "succeeded",
      payload: {},
      priority: 0,
      attempt_count: 1,
      max_attempts: 3,
      scheduled_at: now.toISOString(),
      available_at: now.toISOString(),
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      error_code: null,
      error_message: null,
      trace_id: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    const finalized = await runPipelineFinalizer(pipelineStore, {
      pipeline_run_id: orchestrated.pipeline_run_id,
      now,
    });
    expect(finalized.status).toBe("success");
  });

  it("finalizer resolves partial_success when candidate jobs fail", async () => {
    const { pipelineStore, now } = createHarness();
    const runId = "run-partial";
    pipelineStore.pipelineRuns.set(runId, {
      id: runId,
      run_date: "2026-08-09",
      timezone: "Asia/Taipei",
      triggered_by: "cron",
      status: "running",
      counts: { enqueued: true },
    });
    pipelineStore.trackJob(runId, {
      id: "ok",
      pipeline_run_id: runId,
      job_type: "enrich",
      idempotency_key: "ok",
      status: "succeeded",
      payload: {},
      priority: 0,
      attempt_count: 1,
      max_attempts: 3,
      scheduled_at: now.toISOString(),
      available_at: now.toISOString(),
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      error_code: null,
      error_message: null,
      trace_id: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    pipelineStore.trackJob(runId, {
      id: "bad",
      pipeline_run_id: runId,
      job_type: "normalize",
      idempotency_key: "bad",
      status: "dead_letter",
      payload: {},
      priority: 0,
      attempt_count: 3,
      max_attempts: 3,
      scheduled_at: now.toISOString(),
      available_at: now.toISOString(),
      started_at: now.toISOString(),
      finished_at: now.toISOString(),
      error_code: "MISSING_ARTIFACT",
      error_message: "failed",
      trace_id: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    const finalized = await runPipelineFinalizer(pipelineStore, {
      pipeline_run_id: runId,
      now,
    });
    expect(finalized.status).toBe("partial_success");
  });

  it("intraday development read-filter removes candidate without modifying snapshot", async () => {
    const { repo, now } = createHarness();
    const snapshot = await repo.insertMemberDailyTop20({
      id: "top20-1",
      member_id: "member-a",
      pipeline_run_id: "run-1",
      snapshot_date: "2026-08-09",
      generated_at: now,
      items: [
        {
          candidateId: "cand_visible",
          overall_score: 80,
          display_overall_score: 80,
          rank: 1,
          result: {
            scoring_version: "v1",
            overall_score: 80,
            components: {
              change_window_score: 30,
              change_intent_score: 10,
              behavioral_change_score: 10,
              solution_gap_score: 10,
              needs_fit_score: 20,
              contactability_score: 15,
              natural_entry_score: 10,
              interaction_openness_score: 5,
              core_traits_score: 3,
              activity_score: 4,
              location_score: 0,
            },
            core_traits: {
              trait_scores: [],
              core_traits_score: 3,
              profile_observability: {
                profile_observability_level: "medium",
                analyzable_item_count: 12,
                excluded_repost_count: 0,
                excluded_duplicate_count: 0,
                excluded_empty_share_count: 0,
                excluded_no_expression_count: 0,
                excluded_unattributable_count: 0,
              },
              trait_observability: [],
            },
            needs: [],
          },
        },
        {
          candidateId: "cand_hidden",
          overall_score: 75,
          display_overall_score: 75,
          rank: 2,
          result: {
            scoring_version: "v1",
            overall_score: 75,
            components: {
              change_window_score: 25,
              change_intent_score: 8,
              behavioral_change_score: 8,
              solution_gap_score: 9,
              needs_fit_score: 18,
              contactability_score: 12,
              natural_entry_score: 8,
              interaction_openness_score: 4,
              core_traits_score: 2,
              activity_score: 3,
              location_score: 0,
            },
            core_traits: {
              trait_scores: [],
              core_traits_score: 2,
              profile_observability: {
                profile_observability_level: "low",
                analyzable_item_count: 5,
                excluded_repost_count: 0,
                excluded_duplicate_count: 0,
                excluded_empty_share_count: 0,
                excluded_no_expression_count: 0,
                excluded_unattributable_count: 0,
              },
              trait_observability: [],
            },
            needs: [],
          },
        },
      ],
    });

    await repo.setMemberDevelopmentState({
      member_id: "member-a",
      candidate_id: "cand_hidden",
      development_state: "in_progress",
    });

    const filtered = await applyReadTimeDevelopmentFilter(repo, "member-a", snapshot);
    expect(filtered.map((item) => item.candidateId)).toEqual(["cand_visible"]);
    expect(snapshot.item_count).toBe(2);
  });
});
