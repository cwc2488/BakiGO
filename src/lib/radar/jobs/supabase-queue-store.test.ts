import { describe, expect, it, vi } from "vitest";
import { SupabaseRadarJobQueueStore } from "./supabase-queue-store";

describe("SupabaseRadarJobQueueStore", () => {
  it("returns existing row on duplicate idempotency insert", async () => {
    const existingRow = {
      id: "job-1",
      pipeline_run_id: null,
      job_type: "enrich",
      idempotency_key: "pipeline:2026-08-09:enrich:cand_1",
      status: "pending",
      payload: {},
      priority: 0,
      attempt_count: 0,
      max_attempts: 3,
      scheduled_at: "2026-08-09T03:00:00.000Z",
      available_at: "2026-08-09T03:00:00.000Z",
      started_at: null,
      finished_at: null,
      error_code: null,
      error_message: null,
      trace_id: null,
      created_at: "2026-08-09T03:00:00.000Z",
      updated_at: "2026-08-09T03:00:00.000Z",
    };

    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: existingRow, error: null })),
          })),
        })),
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: { code: "23505", message: "duplicate key" },
            })),
          })),
        })),
      })),
      rpc: vi.fn(),
    };

    const store = new SupabaseRadarJobQueueStore(client as never);
    const job = await store.insertJob({
      id: "job-2",
      job_type: "enrich",
      idempotency_key: "pipeline:2026-08-09:enrich:cand_1",
      now: new Date("2026-08-09T03:00:00.000Z"),
    });

    expect(job.id).toBe("job-1");
  });

  it("claims jobs via claim_radar_jobs RPC with abandoned reclaim", async () => {
    const claimedRow = {
      id: "job-9",
      pipeline_run_id: "run-1",
      job_type: "discover",
      idempotency_key: "pipeline:2026-08-09:discover:m:kw",
      status: "running",
      payload: {},
      priority: 5,
      attempt_count: 1,
      max_attempts: 3,
      scheduled_at: "2026-08-09T03:00:00.000Z",
      available_at: "2026-08-09T03:00:00.000Z",
      started_at: "2026-08-09T03:00:01.000Z",
      finished_at: null,
      error_code: null,
      error_message: null,
      trace_id: null,
      created_at: "2026-08-09T03:00:00.000Z",
      updated_at: "2026-08-09T03:00:01.000Z",
    };

    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: [claimedRow], error: null });

    const store = new SupabaseRadarJobQueueStore({ rpc } as never);
    const claimed = await store.claimJobs({ limit: 1, job_types: ["discover"] });

    expect(rpc).toHaveBeenNthCalledWith(1, "reclaim_abandoned_radar_jobs", {
      p_stale_after_minutes: 30,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "claim_radar_jobs", {
      p_limit: 1,
      p_job_types: ["discover"],
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0].status).toBe("running");
  });
});
