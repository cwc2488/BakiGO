import { describe, expect, it } from "vitest";
import {
  computeCoachingAiLatencyBreakdown,
  createEmptyCoachingAiLatency,
  nextCoachingAiPollIntervalMs,
  resolveCoachingAiProgressStage,
} from "@/lib/coaching/ai/coaching-ai-latency";
import { COACHING_AI_CUSTOMER_POLL_INTERVAL_MS } from "@/types/coaching-ai";

describe("coaching-ai-latency", () => {
  it("computes stage breakdown from timestamps", () => {
    const timestamps = createEmptyCoachingAiLatency({
      submitted_at: "2026-08-13T04:00:00.000Z",
      job_created_at: "2026-08-13T04:00:01.000Z",
      worker_started_at: "2026-08-13T04:00:11.000Z",
      context_load_started_at: "2026-08-13T04:00:11.000Z",
      context_load_completed_at: "2026-08-13T04:00:12.000Z",
      photo_prepare_started_at: "2026-08-13T04:00:12.000Z",
      photo_prepare_completed_at: "2026-08-13T04:00:13.500Z",
      vision_started_at: "2026-08-13T04:00:13.500Z",
      vision_completed_at: "2026-08-13T04:00:22.000Z",
      coach_generation_started_at: "2026-08-13T04:00:22.000Z",
      coach_generation_completed_at: "2026-08-13T04:00:32.000Z",
      persist_started_at: "2026-08-13T04:00:32.000Z",
      persist_completed_at: "2026-08-13T04:00:33.000Z",
      job_completed_at: "2026-08-13T04:00:33.000Z",
    });
    expect(computeCoachingAiLatencyBreakdown(timestamps)).toEqual({
      submit_to_job_ms: 1000,
      queue_wait_ms: 10_000,
      context_load_ms: 1000,
      photo_prepare_ms: 1500,
      vision_ms: 8500,
      coach_ms: 10_000,
      persist_ms: 1000,
      worker_total_ms: 22_000,
      submit_to_complete_ms: 33_000,
    });
  });

  it("returns null deltas when timestamps missing", () => {
    expect(computeCoachingAiLatencyBreakdown(createEmptyCoachingAiLatency())).toEqual({
      submit_to_job_ms: null,
      queue_wait_ms: null,
      context_load_ms: null,
      photo_prepare_ms: null,
      vision_ms: null,
      coach_ms: null,
      persist_ms: null,
      worker_total_ms: null,
      submit_to_complete_ms: null,
    });
  });

  it("backs off poll interval up to max", () => {
    expect(nextCoachingAiPollIntervalMs(0)).toBe(COACHING_AI_CUSTOMER_POLL_INTERVAL_MS);
    expect(nextCoachingAiPollIntervalMs(10)).toBe(5_000);
  });

  it("maps AI progress stages for customer UX", () => {
    expect(resolveCoachingAiProgressStage({ submitted: true, aiStatus: "pending" })).toBe(
      "analyzing",
    );
    expect(resolveCoachingAiProgressStage({ submitted: true, aiStatus: "completed" })).toBe(
      "ready",
    );
    expect(resolveCoachingAiProgressStage({ submitted: true, aiStatus: "failed" })).toBe(
      "unavailable",
    );
  });
});
