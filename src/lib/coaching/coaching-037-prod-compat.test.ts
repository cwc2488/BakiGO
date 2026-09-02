import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("037 Production coaching compatibility", () => {
  const service = readSrc("src/lib/coaching/coaching-service.ts");
  const store = readSrc("src/lib/coaching/ai/coaching-ai-store.ts");
  const timeline = readSrc("src/lib/coaching/timeline/load-coaching-timeline.ts");
  const commandCenter = readSrc("src/lib/coaching/attention/load-command-center-batch.ts");
  const mealPhotos = readSrc("src/app/api/coaching/enrollments/[enrollmentId]/meal-photos/route.ts");
  const processJob = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");

  it("does not upsert coaching_daily_logs on enrollment_id,log_date", () => {
    expect(service).not.toContain('onConflict: "enrollment_id,log_date"');
    expect(service).toContain(".insert(patch)");
    expect(service).toContain(".update(patch)");
    expect(service).toContain('.eq("log_date", input.logDate)');
    expect(service).toContain('.is("deleted_at", null)');
  });

  it("updates only the active log for the same date", () => {
    expect(service).toMatch(
      /\.from\("coaching_daily_logs"\)\s*\.select\("id"\)\s*\.eq\("enrollment_id", input\.portal\.enrollmentId\)\s*\.eq\("log_date", input\.logDate\)\s*\.is\("deleted_at", null\)/,
    );
    expect(service).toMatch(
      /\.update\(patch\)\s*\.eq\("id", dailyLogRow\.id\)\s*\.is\("deleted_at", null\)/,
    );
  });

  it("inserts a new active log when no active row exists for that date", () => {
    expect(service).toContain("} else {");
    expect(service).toContain('.from("coaching_daily_logs")');
    expect(service).toContain(".insert(patch)");
    expect(service).not.toContain(".upsert(patch");
  });

  it("does not revive a deleted daily log via update", () => {
    const updateBlock = service.slice(service.indexOf("if (dailyLogRow) {"), service.indexOf("} else {"));
    expect(updateBlock).toContain('.is("deleted_at", null)');
    expect(updateBlock).not.toContain('deleted_at: null');
  });

  it("excludes deleted rows from timeline, AI context, latest list, and command center", () => {
    expect(timeline).toContain('.from("coaching_daily_logs")');
    expect(timeline).toContain('.is("deleted_at", null)');
    expect(timeline).toContain('.from("coaching_ai_outputs")');
    expect(store).toContain('.is("deleted_at", null)');
    expect(service).toContain("getCoachingDailyLogDetail");
    expect(service).toContain("listCoachingDailyLogsForEnrollment");
    expect(service).toMatch(/query\.is\("deleted_at", null\)\.maybeSingle\(\)/);
    expect(commandCenter).toContain('.is("deleted_at", null)');
    expect(mealPhotos).toContain('.is("deleted_at", null)');
  });

  it("supersedes AI generation when the daily log is missing or deleted", () => {
    expect(processJob).toContain("daily_log_missing_or_deleted");
    expect(processJob).toContain("if (!loaded.todayLog.id)");
  });
});
