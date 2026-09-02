import { describe, expect, it } from "vitest";
import { InMemoryRadarRepository } from "../../repository/in-memory-repository";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "../queue";
import { createSourceAdapterRegistry } from "../../sources/registry";
import { runEnrichWorker } from "./enrich-worker";
import type { RadarJobRecord } from "../types";

describe("runEnrichWorker", () => {
  it("enriches fixture candidate", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    await repo.upsertCandidate({ id: "cand_chain_1", primary_platform: "threads" });

    const job: RadarJobRecord = {
      id: "j1",
      pipeline_run_id: null,
      job_type: "enrich",
      idempotency_key: "k",
      status: "running",
      payload: {
        run_date: "2026-08-09",
        candidate_id: "cand_chain_1",
        platform: "threads",
        artifact_refs: {},
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

    const result = await runEnrichWorker(
      {
        repo,
        queue,
        sources: createSourceAdapterRegistry({
          record: (entry) => repo.recordSourceFetchAudit(entry),
        }),
        now: new Date(),
      },
      job,
    );
    expect(result.status).toBe("succeeded");
    if (result.status === "failed") {
      throw new Error(`${result.error_code}: ${result.error_message}`);
    }
  });

  it("recovers username from cand_threads_* when the stored username was wiped", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    await repo.upsertCandidate({
      id: "cand_threads_gym_stranger",
      primary_platform: "threads",
      normalized_username: null,
    });

    const job: RadarJobRecord = {
      id: "j-refresh",
      pipeline_run_id: "e65f60d5-05ef-4cc3-a375-915c6dd01e69",
      job_type: "enrich",
      idempotency_key: "k-refresh",
      status: "running",
      payload: {
        run_date: "2026-08-23",
        candidate_id: "cand_threads_gym_stranger",
        enrich_reason: "refresh",
        artifact_refs: {},
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

    let seenUsername: string | null = null;
    const adapter = {
      id: "threads_meta",
      async enrichCandidate(input: { username?: string | null }) {
        seenUsername = input.username ?? null;
        return {
          raw_snapshots: [],
          fetch_completeness: "partial",
          profile_semantic_hash: "hash",
          capability_state: "available",
        };
      },
    };
    const result = await runEnrichWorker(
      {
        repo,
        queue,
        sources: {
          forPlatform: () => adapter,
        } as never,
        now: new Date(),
      },
      job,
    );

    expect(result.status).toBe("succeeded");
    expect(seenUsername).toBe("gym_stranger");
    expect((await repo.getCandidate("cand_threads_gym_stranger"))?.normalized_username).toBe(
      "gym_stranger",
    );
  });
});
