import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyCoachingOutputQualityGuard } from "@/lib/coaching/ai/apply-coaching-output-quality-guard";
import {
  buildAiOutputPendingResetForNewCycle,
  decidePersistGenerationForActiveCycle,
  deletedAiTextCanLeakIntoReadyPoll,
} from "@/lib/coaching/ai/coaching-ai-output-lifecycle";
import { findRepeatedSentences } from "@/lib/coaching/ai/coaching-text-dedup";
import { COACHING_DAILY_AI_PROMPT_VERSION } from "@/lib/coaching/ai/model-config";
import { excludeDeletedAiFromContext, latestActiveSubmittedLog } from "@/lib/coaching/coaching-record-delete";
import { buildCoachingTimelineEvents } from "@/lib/coaching/timeline/build-timeline-events";
import { buildTimeline28DayFixture } from "@/lib/coaching/timeline/timeline-fixtures";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION, type CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function sampleDuplicatedOutput(): CoachingDailyGenerationOutputJson {
  return {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      encouragement: "你有認真回報，這點很好。",
      today_feedback: "今天先把水分顧好。今天先把水分顧好。",
      daily_food_summary: "今天飲食大致可觀察。",
      customer_voice_response: null,
      adjustment_priorities: [],
      tomorrow_focus: "明天先維持穩定回報。",
      follow_up_for_tomorrow: null,
      lifestyle_feedback: { sleep: "睡眠時數尚可。", hydration: null, exercise: null },
      meal_feedback: { breakfast: null, lunch: null, dinner: null },
    },
    coach: {
      daily_summary: "今天先把水分顧好。今天先把水分顧好。",
      recurring_issue: null,
      improved_issue: null,
      proposed_intervention_level: "normal",
      coach_attention_required: false,
      attention_reason: null,
      evidence: [],
      follow_ups: [],
      photo_reuse_flags: [],
      daily_nutrition_assessment: null,
    },
  };
}

describe("COACH-LIFE delete → same-day resubmit lifecycle", () => {
  const service = readSrc("src/lib/coaching/coaching-service.ts");
  const store = readSrc("src/lib/coaching/ai/coaching-ai-store.ts");
  const processJob = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
  const deleteService = readSrc("src/lib/coaching/coaching-daily-log-delete.ts");
  const deleteRoute = readSrc("src/app/api/coaching/enrollments/[enrollmentId]/daily-logs/[logId]/route.ts");
  const timelineLoader = readSrc("src/lib/coaching/timeline/load-coaching-timeline.ts");
  const commandCenter = readSrc("src/lib/coaching/attention/load-command-center-batch.ts");
  const pollRoute = readSrc("src/app/api/coaching/portal/[token]/ai-output/route.ts");

  it("COACH-LIFE-01 active log + AI output → delete → both hidden", () => {
    expect(deleteService).toContain("deleted_at: deletedAt");
    expect(deleteService).toContain("deleted_by: input.ownerMemberId");
    expect(deleteService).toContain('.from("coaching_daily_logs")');
    expect(deleteService).toContain('.from("coaching_ai_outputs")');
    expect(deleteService).not.toMatch(/\.delete\(\)/);
    expect(timelineLoader).toContain('.is("deleted_at", null)');
    expect(store).toContain('.is("deleted_at", null)');
    const fixture = buildTimeline28DayFixture("2026-08-12");
    const removed = fixture.logs[0]!;
    const remaining = buildCoachingTimelineEvents({
      ...fixture,
      logs: fixture.logs.filter((log) => log.logDate !== removed.logDate),
      aiOutputs: fixture.aiOutputs.filter((output) => output.logDate !== removed.logDate),
    });
    expect(remaining.some((event) => event.id === `daily_report:${removed.logDate}`)).toBe(false);
  });

  it("COACH-LIFE-02 delete → same-day resubmit → new active daily log", () => {
    expect(service).not.toContain('onConflict: "enrollment_id,log_date"');
    expect(service).toMatch(/if \(dailyLogRow\) \{[\s\S]*\.update\(patch\)[\s\S]*\} else \{[\s\S]*\.insert\(patch\)/);
    const lookup = service.slice(service.indexOf("const { data: existingLog"), service.indexOf("let dailyLogRow"));
    expect(lookup).toContain('.is("deleted_at", null)');
  });

  it("COACH-LIFE-03 same-day resubmit cannot expose old AI text", () => {
    const reset = buildAiOutputPendingResetForNewCycle();
    expect(reset.outputJson).toBeNull();
    expect(reset.status).toBe("pending");
    expect(reset.deletedAt).toBeNull();
    expect(store).toContain("output_json: null");
    expect(store).toContain("deleted_at: null");
    expect(store).toContain('status: "pending"');
    expect(deletedAiTextCanLeakIntoReadyPoll({ status: "pending", outputJson: null })).toBe(false);
    expect(
      deletedAiTextCanLeakIntoReadyPoll({
        status: "completed",
        outputJson: { customer: { today_feedback: "old A text" } },
      }),
    ).toBe(true);
    expect(pollRoute).toContain('output.status === "completed" && output.outputJson');
  });

  it("COACH-LIFE-04 old generation job cannot overwrite new cycle", () => {
    const blocked = decidePersistGenerationForActiveCycle({
      sourceDailyLogId: "log-a",
      activeDailyLogId: "log-b",
      jobStatus: "processing",
      outputId: "ai-1",
      jobOutputId: "ai-1",
      outputFingerprint: "fp-b",
      persistFingerprint: "fp-a",
    });
    expect(blocked).toEqual({ persist: false, reason: "daily_log_cycle_changed" });

    const supersededJob = decidePersistGenerationForActiveCycle({
      sourceDailyLogId: "log-a",
      activeDailyLogId: "log-a",
      jobStatus: "completed",
      outputId: "ai-1",
      jobOutputId: "ai-1",
      outputFingerprint: "fp-a",
      persistFingerprint: "fp-a",
    });
    expect(supersededJob).toEqual({ persist: false, reason: "job_no_longer_active" });

    expect(processJob).toContain("decidePersistGenerationForActiveCycle");
    expect(processJob).toContain("persistGate.reason");
    expect(readSrc("src/lib/coaching/ai/coaching-ai-output-lifecycle.ts")).toContain(
      "daily_log_cycle_changed",
    );
    expect(store).toContain('.eq("input_fingerprint", input.fingerprint)');
    expect(store).toContain('.in("status", ["pending", "processing"])');
  });

  it("COACH-LIFE-05 new generation clears/reset appropriate AI output state", () => {
    expect(store).toContain("onConflict: \"enrollment_id,log_date,point_key\"");
    expect(store).toContain("output_json: null");
    expect(store).toContain("deleted_at: null");
    expect(store).toContain("deleted_by: null");
    expect(store).toContain('status: "pending"');
    expect(store).toContain("started_at: null");
    expect(store).toContain("completed_at: null");
    const reset = buildAiOutputPendingResetForNewCycle();
    expect(reset).toMatchObject({
      outputJson: null,
      status: "pending",
      deletedAt: null,
      deletedBy: null,
      startedAt: null,
      completedAt: null,
    });
  });

  it("COACH-LIFE-06 new generation uses new daily log only", () => {
    expect(processJob).toContain("loadAuthoritativeCoachingGenerationInput");
    expect(processJob).toContain("if (!loaded.todayLog.id)");
    expect(processJob).toContain("sourceDailyLogId: todayLog.id");
    expect(processJob).toContain("activeDailyLogId: latestLogId");
    expect(processJob).toContain("getActiveCoachingDailyLogId");
    expect(readSrc("src/lib/coaching/ai/load-coaching-generation-context.ts")).toContain(
      "getCoachingDailyLogDetail",
    );
    expect(readSrc("src/lib/coaching/coaching-service.ts")).toMatch(
      /query\.is\("deleted_at", null\)\.maybeSingle\(\)/,
    );
  });

  it("COACH-LIFE-07 new output passes dedup quality guard", () => {
    expect(COACHING_DAILY_AI_PROMPT_VERSION).toBe("coaching_daily_v3d3");
    expect(processJob).toContain("applyCoachingDecisionContextToOutput");
    const oldDeleted = sampleDuplicatedOutput();
    expect(findRepeatedSentences(oldDeleted.customer.today_feedback).length).toBeGreaterThan(0);
    const reset = buildAiOutputPendingResetForNewCycle();
    expect(reset.outputJson).toBeNull();
    const nextCycle = applyCoachingOutputQualityGuard(oldDeleted);
    expect(findRepeatedSentences(nextCycle.customer.today_feedback)).toHaveLength(0);
    expect(nextCycle.customer.today_feedback).not.toContain("今天先把水分顧好。今天先把水分顧好。");
    expect(nextCycle.coach.daily_summary).not.toBe(nextCycle.customer.today_feedback);
  });

  it("COACH-LIFE-08 timeline/command-center/context/latest exclude deleted cycle", () => {
    expect(timelineLoader).toContain('.is("deleted_at", null)');
    expect(commandCenter).toContain('.is("deleted_at", null)');
    expect(store).toContain('.is("deleted_at", null)');
    const hidden = excludeDeletedAiFromContext(
      [
        { id: "ai-a", logDate: "2026-08-12", deletedAt: "2026-08-12T12:00:00.000Z" },
        { id: "ai-b", logDate: "2026-08-12", deletedAt: null },
      ],
      ["2026-08-12"],
    );
    expect(hidden.map((item) => item.id)).toEqual(["ai-b"]);
    const latest = latestActiveSubmittedLog([
      { logDate: "2026-08-12", submittedAt: "2026-08-12T10:00:00.000Z", deletedAt: "2026-08-12T12:00:00.000Z" },
      { logDate: "2026-08-11", submittedAt: "2026-08-11T10:00:00.000Z", deletedAt: null },
    ]);
    expect(latest?.logDate).toBe("2026-08-11");
  });

  it("COACH-LIFE-09 baseline remains untouched", () => {
    expect(deleteService).not.toContain("baseline_body_record_id");
    expect(deleteService).not.toContain("body_composition_records");
  });

  it("COACH-LIFE-10 authorization semantics remain 401 / 403 / owner", () => {
    expect(deleteRoute).toContain('return NextResponse.json({ error: "Unauthorized" }, { status: 401 })');
    expect(deleteRoute).toContain("ownerMemberId: memberId");
    expect(deleteRoute).not.toContain("await request.json()");
    expect(deleteService).toContain('throw new CoachingServiceError("Forbidden", 403)');
    expect(deleteService).toContain("owner_member_id");
    expect(deleteService).not.toContain("body.ownerMemberId");
  });
});
