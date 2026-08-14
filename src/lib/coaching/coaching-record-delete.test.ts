import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCoachingTimelineEvents } from "@/lib/coaching/timeline/build-timeline-events";
import { buildTimeline28DayFixture } from "@/lib/coaching/timeline/timeline-fixtures";
import { selectPriorCompletedAiOutput } from "@/lib/coaching/ai/select-prior-ai-output";
import {
  COACHING_DELETE_COPY,
  coachingBaselineDeletionPolicy,
  excludeDeletedAiFromContext,
  firstTapDeletesCoachingRecord,
  latestActiveSubmittedLog,
  reduceCoachingDeleteUi,
} from "@/lib/coaching/coaching-record-delete";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("COACH-DEL coaching record delete", () => {
  it("COACH-DEL-01 coach can request delete for authorized customer record", () => {
    const route = readSrc("src/app/api/coaching/enrollments/[enrollmentId]/daily-logs/[logId]/route.ts");
    expect(route).toContain("getMemberIdFromRequest");
    expect(route).toContain("ownerMemberId: memberId");
    expect(route).toContain("softDeleteCoachingDailyLogForCoach");
    const service = readSrc("src/lib/coaching/coaching-daily-log-delete.ts");
    expect(service).toContain("getCoachingEnrollmentForCoach");
    expect(service).toContain("deleted_at");
    expect(service).toContain("deleted_by");
  });

  it("COACH-DEL-02 unauthorized delete rejected", () => {
    const service = readSrc("src/lib/coaching/coaching-daily-log-delete.ts");
    expect(service).toContain('throw new CoachingServiceError("Forbidden", 403)');
    expect(service).toContain("owner_member_id");
    expect(service).not.toContain("body.ownerMemberId");
    expect(service).not.toContain("body.coachId");
  });

  it("COACH-DEL-03 anonymous delete rejected", () => {
    const route = readSrc("src/app/api/coaching/enrollments/[enrollmentId]/daily-logs/[logId]/route.ts");
    expect(route).toContain('return NextResponse.json({ error: "Unauthorized" }, { status: 401 })');
    expect(route).not.toContain("portal_token");
  });

  it("COACH-DEL-04 first tap does not delete", () => {
    expect(firstTapDeletesCoachingRecord()).toBe(false);
    expect(reduceCoachingDeleteUi("idle", { type: "request_delete" })).toBe("confirming");
    expect(reduceCoachingDeleteUi("idle", { type: "confirm" })).toBe("idle");
  });

  it("COACH-DEL-05 confirmation required", () => {
    expect(COACHING_DELETE_COPY.confirmTitle).toBe("確定要刪除這筆陪跑紀錄嗎？");
    expect(COACHING_DELETE_COPY.cancel).toBe("取消");
    expect(COACHING_DELETE_COPY.confirm).toBe("刪除紀錄");
    expect(reduceCoachingDeleteUi("confirming", { type: "confirm" })).toBe("deleting");
    const ui = readSrc("src/components/coaching/CoachingTimelinePanel.tsx");
    expect(ui).toContain("variant=\"danger\"");
    expect(ui).toContain("COACHING_DELETE_COPY.confirmTitle");
  });

  it("COACH-DEL-06 soft delete persisted", () => {
    const migration = readSrc("supabase/migrations/037_coaching_record_soft_delete.sql");
    expect(migration).toContain("deleted_at");
    expect(migration).toContain("deleted_by");
    expect(migration).toContain("coaching_daily_logs");
    expect(migration).toContain("coaching_ai_outputs");
    expect(migration).toContain("where deleted_at is null");
    const service = readSrc("src/lib/coaching/coaching-daily-log-delete.ts");
    expect(service).toContain(".update({");
    expect(service).not.toContain('.from("coaching_daily_logs")\n      .delete(');
  });

  it("COACH-DEL-07 deleted record excluded from timeline", () => {
    const fixture = buildTimeline28DayFixture("2026-08-12");
    const all = buildCoachingTimelineEvents(fixture);
    const daily = all.filter((event) => event.type === "daily_report" && event.payload.kind === "daily_report");
    expect(daily.length).toBeGreaterThan(1);
    const removedId = daily[0]!.id;
    const remainingLogs = fixture.logs.filter((log) => `daily_report:${log.logDate}` !== removedId);
    const remaining = buildCoachingTimelineEvents({ ...fixture, logs: remainingLogs });
    expect(remaining.some((event) => event.id === removedId)).toBe(false);
    const loader = readSrc("src/lib/coaching/timeline/load-coaching-timeline.ts");
    expect(loader).toContain('.is("deleted_at", null)');
  });

  it("COACH-DEL-08 deleted record excluded from AI context", () => {
    const outputs = [
      { id: "ai-1", logDate: "2026-08-10", status: "completed" as const, deletedAt: "2026-08-12T00:00:00.000Z", outputJson: {} },
      { id: "ai-2", logDate: "2026-08-11", status: "completed" as const, deletedAt: null, outputJson: {} },
    ];
    const active = excludeDeletedAiFromContext(outputs, ["2026-08-11"]);
    expect(active.map((item) => item.id)).toEqual(["ai-2"]);
    const prior = selectPriorCompletedAiOutput(active, "2026-08-12");
    expect(prior?.id).toBe("ai-2");
    const store = readSrc("src/lib/coaching/ai/coaching-ai-store.ts");
    expect(store).toContain('.is("deleted_at", null)');
  });

  it("COACH-DEL-09 latest-state recalculated", () => {
    const latest = latestActiveSubmittedLog([
      { logDate: "2026-08-12", submittedAt: "2026-08-12T10:00:00.000Z", deletedAt: "2026-08-12T12:00:00.000Z" },
      { logDate: "2026-08-11", submittedAt: "2026-08-11T10:00:00.000Z", deletedAt: null },
      { logDate: "2026-08-10", submittedAt: "2026-08-10T10:00:00.000Z", deletedAt: null },
    ]);
    expect(latest?.logDate).toBe("2026-08-11");
  });

  it("COACH-DEL-10 deleting last record produces valid empty state", () => {
    const remaining = buildCoachingTimelineEvents({
      ...buildTimeline28DayFixture("2026-08-12"),
      logs: [],
      aiOutputs: [],
      bodyRecords: [],
      coachActions: [],
    }).filter((event) => event.type === "daily_report" && event.payload.kind === "daily_report");
    expect(remaining).toHaveLength(0);
    const ui = readSrc("src/components/coaching/CoachingTimelinePanel.tsx");
    expect(ui).toContain("目前沒有符合條件的歷史事件。");
  });

  it("COACH-DEL-11 adjacent records untouched", () => {
    const fixture = buildTimeline28DayFixture("2026-08-12");
    const all = buildCoachingTimelineEvents(fixture);
    const daily = all.filter((event) => event.type === "daily_report" && event.payload.kind === "daily_report");
    const target = daily[1]!;
    const remainingLogs = fixture.logs.filter((log) => log.logDate !== target.logDate);
    const remaining = buildCoachingTimelineEvents({ ...fixture, logs: remainingLogs });
    const remainingDaily = remaining.filter(
      (event) => event.type === "daily_report" && event.payload.kind === "daily_report",
    );
    expect(remainingDaily.some((event) => event.id === daily[0]!.id)).toBe(true);
    expect(remainingDaily.some((event) => event.id === target.id)).toBe(false);
  });

  it("COACH-DEL-12 baseline behavior safe", () => {
    const baseline = coachingBaselineDeletionPolicy({
      eventType: "body_measurement",
      measurementKind: "baseline",
    });
    expect(baseline.allowed).toBe(false);
    expect(baseline.policy).toBe("prevent_baseline_deletion");
    expect(baseline.reason).toContain("起始量測");
    const daily = coachingBaselineDeletionPolicy({ eventType: "daily_report" });
    expect(daily.allowed).toBe(true);
    const service = readSrc("src/lib/coaching/coaching-daily-log-delete.ts");
    expect(service).not.toContain("baseline_body_record_id");
  });

  it("COACH-DEL-13 refresh/reopen still hides deleted record", () => {
    const loader = readSrc("src/lib/coaching/timeline/load-coaching-timeline.ts");
    const list = readSrc("src/lib/coaching/coaching-service.ts");
    expect(loader).toContain('.is("deleted_at", null)');
    expect(list).toContain('.is("deleted_at", null)');
    expect(list).toContain("getCoachingDailyLogDetail");
  });

  it("COACH-DEL-14 existing customer authorization/RLS remains green", () => {
    const migration = readSrc("supabase/migrations/037_coaching_record_soft_delete.sql");
    expect(migration).not.toMatch(/create policy/i);
    expect(migration).not.toMatch(/drop policy/i);
    expect(migration).toContain("No DELETE policies added");
    const v1 = readSrc("supabase/migrations/027_coaching_v1.sql");
    expect(v1).toContain("coaching_daily_logs_select_own");
    expect(v1).not.toContain("coaching_daily_logs_delete");
  });
});
