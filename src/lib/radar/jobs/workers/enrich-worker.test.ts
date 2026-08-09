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
});
