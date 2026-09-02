import { describe, expect, it } from "vitest";
import { summarizeRadarJobs } from "./ops-status";

describe("RADAR-PROD-RECOVERY-01 ops status", () => {
  it("counts jobs by status and stage without using payload fields", () => {
    const now = new Date("2026-08-23T02:10:00.000Z");
    const summary = summarizeRadarJobs(
      [
        {
          job_type: "discover",
          status: "succeeded",
          attempt_count: 1,
          started_at: "2026-08-22T22:01:00.000Z",
          finished_at: "2026-08-22T22:02:00.000Z",
          created_at: "2026-08-22T22:00:00.000Z",
          updated_at: "2026-08-22T22:02:00.000Z",
        },
        {
          job_type: "enrich",
          status: "running",
          attempt_count: 2,
          started_at: "2026-08-22T23:00:00.000Z",
          finished_at: null,
          created_at: "2026-08-22T22:03:00.000Z",
          updated_at: "2026-08-22T23:00:00.000Z",
        },
        {
          job_type: "rank",
          status: "pending",
          attempt_count: 0,
          started_at: null,
          finished_at: null,
          created_at: "2026-08-22T22:04:00.000Z",
          updated_at: "2026-08-22T22:04:00.000Z",
        },
      ],
      now,
    );

    expect(summary.jobs).toEqual({
      total: 3,
      pending: 1,
      running: 1,
      succeeded: 1,
      failed: 0,
      dead_letter: 0,
    });
    expect(summary.stage_breakdown.enrich.running).toBe(1);
    expect(summary.rank_status).toBe("pending");
    expect(summary.rank_count).toBe(1);
    expect(summary.last_progress_at).toBe("2026-08-22T23:00:00.000Z");
    expect(summary.oldest_running).toEqual({
      stage: "enrich",
      started_at: "2026-08-22T23:00:00.000Z",
      age_minutes: 190,
      attempt: 2,
      reclaim_threshold_passed: true,
    });
  });

  it("does not expose candidate or private content keys", () => {
    const src = require("node:fs").readFileSync("src/lib/radar/jobs/ops-status.ts", "utf8");
    expect(src).toContain('select(JOB_COLUMNS)');
    expect(src).toContain('from("member_daily_top20")');
    expect(src).toContain('select("item_count")');
    expect(src).not.toContain(".select(\"*\")");
    expect(src).not.toContain("display_name");
    expect(src).not.toContain("error_message");
    expect(src).not.toMatch(/payload/);
    expect(src).not.toMatch(/select\(["']items["']\)/);
  });
});
