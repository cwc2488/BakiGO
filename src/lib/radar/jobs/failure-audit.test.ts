import { describe, expect, it } from "vitest";
import { groupRadarFailures, type RadarFailedJobRow } from "./failure-audit";

describe("RADAR-PROD-RECOVERY-02 failure audit", () => {
  it("groups failed jobs by type, error, and attempt without payload fields", () => {
    const jobs: RadarFailedJobRow[] = [
      {
        id: "1",
        job_type: "discover",
        status: "failed",
        attempt_count: 1,
        max_attempts: 3,
        error_code: "KEYWORD_SEARCH_FAILED",
        error_message: "threads: THREADS_ACCESS_TOKEN is absent; refusing fixture fallback.",
        available_at: "2026-08-23T09:38:00.000Z",
        started_at: "2026-08-23T09:37:00.000Z",
        finished_at: null,
        created_at: "2026-08-23T06:00:00.000Z",
        updated_at: "2026-08-23T09:37:10.000Z",
      },
      {
        id: "2",
        job_type: "discover",
        status: "failed",
        attempt_count: 1,
        max_attempts: 3,
        error_code: "KEYWORD_SEARCH_FAILED",
        error_message: "threads: THREADS_ACCESS_TOKEN is absent; refusing fixture fallback.",
        available_at: "2026-08-23T09:38:00.000Z",
        started_at: "2026-08-23T09:37:20.000Z",
        finished_at: null,
        created_at: "2026-08-23T06:00:00.000Z",
        updated_at: "2026-08-23T09:37:30.000Z",
      },
      {
        id: "3",
        job_type: "discover",
        status: "pending",
        attempt_count: 0,
        max_attempts: 3,
        error_code: null,
        error_message: null,
        available_at: "2026-08-23T09:00:00.000Z",
        started_at: null,
        finished_at: null,
        created_at: "2026-08-23T06:00:00.000Z",
        updated_at: "2026-08-23T06:00:00.000Z",
      },
    ];

    const audit = groupRadarFailures(jobs, new Date("2026-08-23T10:00:00.000Z"));
    expect(audit.failed_or_dead).toBe(2);
    expect(audit.pending).toBe(1);
    expect(audit.pending_now_available).toBe(1);
    expect(audit.groups).toEqual([
      {
        job_type: "discover",
        status: "failed",
        error_code: "KEYWORD_SEARCH_FAILED",
        error_message: "threads: THREADS_ACCESS_TOKEN is absent; refusing fixture fallback.",
        attempt_count: 1,
        count: 2,
        first_started_at: "2026-08-23T09:37:00.000Z",
        last_updated_at: "2026-08-23T09:37:30.000Z",
      },
    ]);
    expect(audit.unique_error_codes).toEqual(["KEYWORD_SEARCH_FAILED"]);
    expect(audit.pending_by_type).toEqual({ discover: 1 });
  });

  it("status route is cron-authed GET and does not claim jobs", () => {
    const src = require("node:fs").readFileSync("src/app/api/radar/jobs/status/route.ts", "utf8");
    expect(src).toContain("export async function GET");
    expect(src).toContain("isRadarCronAuthorized");
    expect(src).toContain("loadRadarFailureAudit");
    expect(src).toContain("loadRadarOpsStatus");
    expect(src).not.toContain("runWorkerUntilBudget");
    expect(src).not.toContain("claim_radar_jobs");
    expect(src).not.toContain("runDailyPipelineOrchestrator");
    expect(src).not.toContain("runPipelineFinalizer");
  });
});
