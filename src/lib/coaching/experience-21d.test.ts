import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cloneDefaultCoachingPlanSnapshot, parseCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import { coachingJourneyDayNumberInWindow, coachingJourneyDayTotal } from "@/lib/coaching/enrollment-window";
import {
  deriveExperience21dSchedule,
  formatExperience21dShortDate,
  formatExperience21dZhDate,
  isExperience21dEnrollment,
  safe21dReturnPath,
  shouldCompleteExperience21d,
  withExperience21dSnapshot,
} from "@/lib/coaching/experience-21d";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("21D-START-01", () => {
  it("product received next day is Day 1; Day 21 is inclusive start+20", () => {
    const schedule = deriveExperience21dSchedule("2026-08-17");
    expect(schedule).toEqual({
      productReceivedDate: "2026-08-17",
      startDate: "2026-08-18",
      plannedEndAt: "2026-09-07",
    });
    expect(
      coachingJourneyDayNumberInWindow({
        startedAt: "2026-08-18T00:00:00+08:00",
        plannedEndAt: schedule.plannedEndAt,
        logDate: "2026-08-18",
      }),
    ).toBe(1);
    expect(
      coachingJourneyDayNumberInWindow({
        startedAt: "2026-08-18T00:00:00+08:00",
        plannedEndAt: schedule.plannedEndAt,
        logDate: "2026-09-07",
      }),
    ).toBe(21);
    expect(
      coachingJourneyDayTotal({
        startedAt: "2026-08-18T00:00:00+08:00",
        plannedEndAt: schedule.plannedEndAt,
      }),
    ).toBe(21);
    expect(formatExperience21dZhDate("2026-08-17")).toBe("8 月 17 日");
    expect(formatExperience21dShortDate("2026-09-07")).toBe("9/7");
  });

  it("does not use exclusive +21 end date", () => {
    expect(deriveExperience21dSchedule("2026-08-17").plannedEndAt).not.toBe("2026-09-08");
  });

  it("plan snapshot round-trip preserves 21D marker without changing default diet rules", () => {
    const snapshot = withExperience21dSnapshot(cloneDefaultCoachingPlanSnapshot(), {
      productReceivedDate: "2026-08-17",
      interestId: "interest-1",
    });
    const parsed = parseCoachingPlanSnapshot(snapshot);
    expect(parsed.experience21d).toEqual({
      productReceivedDate: "2026-08-17",
      interestId: "interest-1",
    });
    expect(parsed.dietaryGuidelines).toEqual(cloneDefaultCoachingPlanSnapshot().dietaryGuidelines);
    expect(
      isExperience21dEnrollment({
        planSnapshot: parsed,
      } as never),
    ).toBe(true);
    expect(isExperience21dEnrollment({ planSnapshot: cloneDefaultCoachingPlanSnapshot() } as never)).toBe(false);
  });

  it("completes 21D only after Day 21, not on Day 21", () => {
    const enrollment = {
      status: "active" as const,
      startedAt: "2026-08-18T00:00:00+08:00",
      plannedEndAt: "2026-09-07",
      planSnapshot: withExperience21dSnapshot(cloneDefaultCoachingPlanSnapshot(), {
        productReceivedDate: "2026-08-17",
      }),
    };
    expect(shouldCompleteExperience21d({ enrollment, todayIso: "2026-09-07" })).toBe(false);
    expect(shouldCompleteExperience21d({ enrollment, todayIso: "2026-09-08" })).toBe(true);
    expect(
      shouldCompleteExperience21d({
        enrollment: { ...enrollment, planSnapshot: cloneDefaultCoachingPlanSnapshot() },
        todayIso: "2026-09-08",
      }),
    ).toBe(false);
  });

  it("reuses existing enrollment create + owner checks; never deletes or auto-creates customers", () => {
    const activation = src("src/lib/analysis/handoff/experience-21d-activation.ts");
    expect(activation).toContain("createCoachingEnrollment");
    expect(activation).toContain("getActiveEnrollmentForCustomer");
    expect(activation).toContain("owner_member_id");
    expect(activation).not.toContain(".delete(");
    expect(activation).not.toContain("from(\"customers\")\n    .insert");
    expect(src("src/app/api/quiz/21d/[id]/activation/route.ts")).toContain("getMemberIdFromRequest");
    expect(src("src/app/api/coaching/experience-21d/route.ts")).toContain("getMemberIdFromRequest");
  });

  it("joined lead CTA goes to start flow; start UI has no engineering jargon", () => {
    const detail = src("src/components/quiz/Quiz21dInterestDetailPage.tsx");
    expect(detail).toContain("啟動 21 天體驗");
    expect(detail).toContain("成交後，請建立顧客並啟動 21 天體驗");
    const start = src("src/components/quiz/Experience21dStartPage.tsx");
    expect(start).toContain("21 天從顧客拿到產品的隔天開始。");
    expect(start).toContain("查看陪跑中心");
    expect(start).toContain("effectiveCustomerId");
    expect(start).not.toContain("Enrollment");
    expect(start).not.toContain("lifecycle");
    expect(start).not.toContain("program instance");
    expect(src("src/components/coaching/CoachingCustomerSection.tsx")).toContain("開通 21 天 AI 陪跑");
    expect(src("src/components/coaching/CoachingCustomerSection.tsx")).not.toContain("開始一般陪跑");
    expect(src("src/components/coaching/CoachingCustomerSection.tsx")).toContain("/api/coaching/go21/status");
    expect(src("src/app/c/[token]/coaching/page.tsx")).toContain("redirect");
    expect(src("src/app/c/[token]/coaching/page.tsx")).toContain("/go21");
    expect(src("src/app/customers/[id]/start-21d/page.tsx")).toContain("initialCustomerName");
  });

  it("Preview walk is local-only and still uses the real Day 1 / Day 21 helper", () => {
    const walk = src("src/components/quiz/Quiz21dStartPreviewWalk.tsx");
    expect(walk).toContain("deriveExperience21dSchedule");
    expect(walk).not.toContain("fetch(");
    expect(walk).not.toContain("getMemberIdFromRequest");
    expect(src("src/app/quiz/21d/preview/page.tsx")).toContain("isProductionRuntime");
  });

  it("returnTo is path-safe and customer form is reused", () => {
    expect(safe21dReturnPath("/quiz/21d/abc/start")).toBe("/quiz/21d/abc/start");
    expect(safe21dReturnPath("https://evil.example/quiz/21d")).toBeNull();
    expect(safe21dReturnPath("//evil.example")).toBeNull();
    const list = src("src/components/customers/CustomerListPage.tsx");
    expect(list).toContain("safe21dReturnPath");
    expect(list).toContain("flushCustomerCloudPushAsync");
  });
});
