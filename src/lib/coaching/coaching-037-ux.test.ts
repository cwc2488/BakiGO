import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectPriorCompletedAiOutput } from "@/lib/coaching/ai/select-prior-ai-output";
import { buildCoachingTimelineEvents } from "@/lib/coaching/timeline/build-timeline-events";
import { buildTimeline28DayFixture } from "@/lib/coaching/timeline/timeline-fixtures";
import { excludeDeletedAiFromContext } from "@/lib/coaching/coaching-record-delete";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("COACH-037-UX same-day resubmit + deleted exclusion", () => {
  const service = readSrc("src/lib/coaching/coaching-service.ts");
  const processJob = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
  const timelineLoader = readSrc("src/lib/coaching/timeline/load-coaching-timeline.ts");
  const store = readSrc("src/lib/coaching/ai/coaching-ai-store.ts");

  it("COACH-037-UX-01 active same-day update", () => {
    expect(service).not.toContain('onConflict: "enrollment_id,log_date"');
    expect(service).toMatch(
      /\.from\("coaching_daily_logs"\)\s*\.select\("id"\)\s*\.eq\("enrollment_id", input\.portal\.enrollmentId\)\s*\.eq\("log_date", input\.logDate\)\s*\.is\("deleted_at", null\)/,
    );
    expect(service).toMatch(/if \(dailyLogRow\) \{[\s\S]*\.update\(patch\)[\s\S]*\.eq\("id", dailyLogRow\.id\)/);
  });

  it("COACH-037-UX-02 deleted same-day row ignored", () => {
    const lookup = service.slice(
      service.indexOf("const { data: existingLog"),
      service.indexOf("let dailyLogRow"),
    );
    expect(lookup).toContain('.is("deleted_at", null)');
    expect(lookup).not.toContain(".upsert(");
    const updateBlock = service.slice(service.indexOf("if (dailyLogRow) {"), service.indexOf("} else {"));
    expect(updateBlock).toContain('.is("deleted_at", null)');
    expect(updateBlock).not.toContain("deleted_at: null");
  });

  it("COACH-037-UX-03 new same-day row after deletion", () => {
    const insertBlock = service.slice(service.indexOf("} else {"));
    expect(insertBlock).toContain(".insert(patch)");
    expect(service).not.toContain(".upsert(patch");
    expect(service).not.toContain('onConflict: "enrollment_id,log_date"');
  });

  it("COACH-037-UX-04 deleted log excluded from timeline", () => {
    expect(timelineLoader).toContain('.from("coaching_daily_logs")');
    expect(timelineLoader).toContain('.is("deleted_at", null)');
    const fixture = buildTimeline28DayFixture("2026-08-12");
    const all = buildCoachingTimelineEvents(fixture);
    const daily = all.filter((event) => event.type === "daily_report" && event.payload.kind === "daily_report");
    const removedId = daily[0]!.id;
    const remaining = buildCoachingTimelineEvents({
      ...fixture,
      logs: fixture.logs.filter((log) => `daily_report:${log.logDate}` !== removedId),
    });
    expect(remaining.some((event) => event.id === removedId)).toBe(false);
  });

  it("COACH-037-UX-05 deleted log excluded from AI context", () => {
    expect(store).toContain('.is("deleted_at", null)');
    const outputs = [
      {
        id: "ai-deleted",
        logDate: "2026-08-11",
        status: "completed" as const,
        deletedAt: "2026-08-12T00:00:00.000Z",
        outputJson: {},
      },
      {
        id: "ai-active",
        logDate: "2026-08-12",
        status: "completed" as const,
        deletedAt: null,
        outputJson: {},
      },
    ];
    const active = excludeDeletedAiFromContext(outputs, ["2026-08-12"]);
    expect(active.map((item) => item.id)).toEqual(["ai-active"]);
    expect(selectPriorCompletedAiOutput(active, "2026-08-13")?.id).toBe("ai-active");
  });

  it("COACH-037-UX-06 delete + regeneration race superseded", () => {
    expect(processJob).toContain("daily_log_missing_or_deleted");
    expect(processJob).toContain("if (!loaded.todayLog.id)");
    expect(processJob).toContain('markGenerationJobSuperseded(job.id, "daily_log_missing_or_deleted")');
  });
});
