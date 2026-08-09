import { describe, expect, it } from "vitest";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../jobs/queue";
import { InMemoryPipelineStore } from "./in-memory-pipeline-store";
import { runDailyPipelineOrchestrator } from "./orchestrator";
import type { CandidateRefreshInput } from "./types";

function refreshCandidate(
  overrides: Partial<CandidateRefreshInput> & Pick<CandidateRefreshInput, "candidate_id">,
): CandidateRefreshInput {
  return {
    lifecycle_state: "active",
    refresh_tier: "standard",
    is_new_candidate: true,
    source_freshness_expired: false,
    is_stale_recovery: false,
    near_top20_competitive: false,
    new_discovery_hit: false,
    force_refresh: false,
    last_enriched_at: null,
    cooling_interval_days: 14,
    ...overrides,
  };
}

describe("runDailyPipelineOrchestrator", () => {
  const now = new Date("2026-08-09T03:00:00.000Z");
  const run_date = "2026-08-09";

  function createDeps() {
    const store = new InMemoryPipelineStore();
    const queueStore = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(queueStore);

    store.members = [{ member_id: "member-a" }, { member_id: "member-b" }];
    store.keywordsByMember = {
      "member-a": [
        { keyword_id: "kw-a1", phrase: "健身", discovery_weight: 10 },
        { keyword_id: "kw-a2", phrase: "減重", discovery_weight: 5 },
      ],
      "member-b": [{ keyword_id: "kw-b1", phrase: "創業", discovery_weight: 8 }],
    };
    store.baselineQuota = 1;
    store.quotaBudget = {
      keyword_search_daily_budget: 50,
      profile_discovery_daily_budget: 100,
      new_candidate_enrichment_budget: 30,
      refresh_enrichment_budget: 70,
      reserve_capacity_pct: 0,
    };
    store.refreshCandidates = [
      refreshCandidate({ candidate_id: "cand-1" }),
      refreshCandidate({ candidate_id: "cand-2", is_new_candidate: false, force_refresh: true }),
    ];

    return { store, queue, queueStore };
  }

  it("same-day rerun does not duplicate jobs", async () => {
    const deps = createDeps();

    const first = await runDailyPipelineOrchestrator(deps, { run_date, now });
    expect(first.rerun).toBe(false);
    expect(first.discovery_jobs_enqueued).toBe(3);
    expect(first.enrich_jobs_enqueued).toBe(2);
    expect(first.normalize_jobs_enqueued).toBe(0);

    const jobCountAfterFirst = deps.queueStore.jobCount;

    const second = await runDailyPipelineOrchestrator(deps, { run_date, now });
    expect(second.rerun).toBe(true);
    expect(second.pipeline_run_id).toBe(first.pipeline_run_id);
    expect(deps.queueStore.jobCount).toBe(jobCountAfterFirst);
  });

  it("keeps pipeline run running after plan/enqueue", async () => {
    const deps = createDeps();
    const result = await runDailyPipelineOrchestrator(deps, { run_date, now });

    const run = deps.store.pipelineRuns.get(result.pipeline_run_id);
    expect(run?.status).toBe("running");
    expect(run?.counts.enqueued).toBe(true);
  });

  it("does not mark partial_success immediately after enqueue", async () => {
    const deps = createDeps();
    const result = await runDailyPipelineOrchestrator(deps, { run_date, now });
    const run = deps.store.pipelineRuns.get(result.pipeline_run_id);
    expect(run?.status).not.toBe("partial_success");
    expect(run?.status).not.toBe("success");
  });

  it("allows partial enqueue success when refresh list is empty", async () => {
    const deps = createDeps();
    deps.store.refreshCandidates = [];

    const result = await runDailyPipelineOrchestrator(deps, { run_date, now });
    expect(result.refresh_candidates_selected).toBe(0);
    expect(result.enrich_jobs_enqueued).toBe(0);
    expect(result.discovery_jobs_enqueued).toBe(3);

    const run = deps.store.pipelineRuns.get(result.pipeline_run_id);
    expect(run?.status).toBe("running");
  });
});
