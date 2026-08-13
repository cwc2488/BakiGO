import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDetailActionCard,
  buildDetailTodayScanRows,
  buildWorkbenchTodaySummary,
  buildWorkbenchUrgentCards,
  COACH_TODAY_REPORT_LABELS,
  COACH_TODAY_REPORT_SHORT,
  containsInternalCoachTerminology,
  DETAIL_DEFERRED_PANEL_IDS,
  DETAIL_MORE_DEFAULT_OPEN,
  humanizeAttentionWhatHappened,
  humanizeOutcomeConclusion,
  resolveCoachTodayReportState,
} from "@/lib/coaching/presentation/coaching-workbench-presentation";
import type { CoachingCommandCenterCard } from "@/types/coaching-attention";

function mockCard(
  overrides: Partial<CoachingCommandCenterCard> & {
    section?: CoachingCommandCenterCard["assessment"]["commandCenterSection"];
    reasonCodes?: CoachingCommandCenterCard["assessment"]["reasonCodes"];
  },
): CoachingCommandCenterCard {
  const section = overrides.section ?? "routine";
  const reasonCodes = overrides.reasonCodes ?? [];
  return {
    enrollmentId: overrides.enrollmentId ?? "enr-1",
    customerId: overrides.customerId ?? "cus-1",
    customerDisplayName: overrides.customerDisplayName ?? "小美",
    customerPhone: overrides.customerPhone ?? null,
    goal: overrides.goal ?? null,
    dayNumber: overrides.dayNumber ?? 12,
    dayTotal: overrides.dayTotal ?? 90,
    outcomeStatus: overrides.outcomeStatus ?? null,
    outcomeStatusLabel: overrides.outcomeStatusLabel ?? null,
    measurementStage: overrides.measurementStage ?? null,
    daysSinceLatestMeasurement: overrides.daysSinceLatestMeasurement ?? null,
    latestMeasurementDate: overrides.latestMeasurementDate ?? null,
    assessment: {
      tier:
        overrides.assessment?.tier ??
        (section === "needs_attention"
          ? "coach_attention"
          : section === "watch" || section === "measurement_due"
            ? "watch"
            : section === "positive_progress"
              ? "positive_progress"
              : "routine"),
      commandCenterSection: section,
      reasonCodes: overrides.assessment?.reasonCodes ?? reasonCodes,
      primaryReason: overrides.assessment?.primaryReason ?? null,
      evidence: overrides.assessment?.evidence ?? [],
      recommendedActionType: overrides.assessment?.recommendedActionType ?? null,
      measurementReminder: overrides.assessment?.measurementReminder ?? false,
      suppressedReasonCodes: overrides.assessment?.suppressedReasonCodes ?? [],
      recentCoachActionAcknowledged: overrides.assessment?.recentCoachActionAcknowledged ?? false,
      consecutiveMissedCompletedDays: overrides.assessment?.consecutiveMissedCompletedDays ?? 0,
      rankScore: overrides.assessment?.rankScore ?? 0,
    },
    evidenceSummary: overrides.evidenceSummary ?? null,
    recommendedActionLabel: overrides.recommendedActionLabel ?? null,
    detailHref: overrides.detailHref ?? "/coaching/enr-1",
    todaySubmitted: overrides.todaySubmitted ?? false,
    todayAiStatus: overrides.todayAiStatus ?? null,
  };
}

describe("Coaching UX presentation (CUX)", () => {
  it("CUX-01 urgent customer first", () => {
    const cards = [
      mockCard({
        enrollmentId: "stable",
        customerDisplayName: "穩定客",
        section: "routine",
      }),
      mockCard({
        enrollmentId: "urgent",
        customerDisplayName: "小美",
        section: "needs_attention",
        reasonCodes: ["today_not_yet_reported"],
        recommendedActionLabel: "主動聯繫確認今日回報",
        assessment: {
          tier: "coach_attention",
          commandCenterSection: "needs_attention",
          reasonCodes: ["today_not_yet_reported"],
          primaryReason: null,
          evidence: [],
          recommendedActionType: "contact_for_non_reporting",
          measurementReminder: false,
          suppressedReasonCodes: [],
          recentCoachActionAcknowledged: false,
          consecutiveMissedCompletedDays: 1,
          rankScore: 90,
        },
      }),
      mockCard({
        enrollmentId: "measure",
        customerDisplayName: "Lisa",
        section: "measurement_due",
        reasonCodes: ["measurement_due"],
        recommendedActionLabel: "建議安排下一次身體量測",
        assessment: {
          tier: "watch",
          commandCenterSection: "measurement_due",
          reasonCodes: ["measurement_due"],
          primaryReason: null,
          evidence: [],
          recommendedActionType: "schedule_retest",
          measurementReminder: true,
          suppressedReasonCodes: [],
          recentCoachActionAcknowledged: false,
          consecutiveMissedCompletedDays: 0,
          rankScore: 40,
        },
      }),
    ];
    const urgent = buildWorkbenchUrgentCards(cards);
    expect(urgent.map((c) => c.customerDisplayName)).toEqual(["小美", "Lisa"]);
    expect(urgent[0].whatHappened).toContain("今天還沒回報");
    expect(urgent[0].nextStep).toContain("提醒");
  });

  it("CUX-02 stable customer not shown as urgent", () => {
    const urgent = buildWorkbenchUrgentCards([
      mockCard({
        customerDisplayName: "穩穩",
        section: "routine",
        reasonCodes: ["stable_execution"],
      }),
      mockCard({
        customerDisplayName: "正向",
        section: "positive_progress",
        reasonCodes: ["positive_body_outcome"],
      }),
    ]);
    expect(urgent).toHaveLength(0);
  });

  it("CUX-03 today reported humanized", () => {
    expect(COACH_TODAY_REPORT_LABELS.ready).toBe("✓ 今日已完成");
    expect(COACH_TODAY_REPORT_LABELS.organizing).toBe("⏳ 正在整理今天的回報");
    expect(COACH_TODAY_REPORT_LABELS.not_reported).toBe("○ 今天尚未回報");
    expect(COACH_TODAY_REPORT_SHORT.ready).toBe("✓ 已完成");
    expect(resolveCoachTodayReportState({ todaySubmitted: true, todayAiStatus: "completed" })).toBe(
      "ready",
    );
    const summary = buildWorkbenchTodaySummary([
      { todaySubmitted: true, todayAiStatus: "completed" },
      { todaySubmitted: true, todayAiStatus: "pending" },
      { todaySubmitted: false, todayAiStatus: null },
    ]);
    expect(summary).toEqual({ reportedCount: 2, organizingCount: 1, notReportedCount: 1 });
    for (const label of Object.values(COACH_TODAY_REPORT_LABELS)) {
      expect(label).not.toMatch(/pending|processing|completed|queue|worker/i);
    }
  });

  it("CUX-04 AI pending does not block deterministic UI", () => {
    const rows = buildDetailTodayScanRows({
      id: "log-1",
      enrollmentId: "enr-1",
      customerId: "cus-1",
      ownerMemberId: "mem-1",
      logDate: "2026-08-13",
      waterMl: 2000,
      sleepBedtime: "23:00",
      sleepWakeTime: "06:30",
      sleepDuration: "7.5 小時",
      exerciseNote: "慢跑 30 分",
      bowelMovementCount: 1,
      customerNote: null,
      submittedAt: "2026-08-13T10:00:00.000Z",
      createdAt: "2026-08-13T10:00:00.000Z",
      updatedAt: "2026-08-13T10:00:00.000Z",
      meals: [
        {
          id: "m1",
          dailyLogId: "log-1",
          mealSlot: "breakfast",
          textNote: "燕麥",
          eatenAt: null,
          createdAt: "",
          updatedAt: "",
          photo: null,
        },
        {
          id: "m2",
          dailyLogId: "log-1",
          mealSlot: "lunch",
          textNote: "便當",
          eatenAt: null,
          createdAt: "",
          updatedAt: "",
          photo: null,
        },
        {
          id: "m3",
          dailyLogId: "log-1",
          mealSlot: "dinner",
          textNote: "清粥",
          eatenAt: null,
          createdAt: "",
          updatedAt: "",
          photo: null,
        },
      ],
    });
    expect(rows.find((r) => r.label === "早餐")?.value).toBe("✓");
    expect(rows.find((r) => r.label === "喝水")?.value).toBe("2000 ml");

    const card = buildDetailActionCard({
      submitted: true,
      aiStatus: "pending",
      coachAttentionRequired: false,
      attentionReason: null,
      dailySummary: null,
      interventionLevel: null,
      bowelCount: 1,
    });
    expect(card.title).toBe("進階分析正在整理中");
    expect(card.body).toContain("今日回報已收到");
  });

  it("CUX-05 raw Attention enum never shown", () => {
    const what = humanizeAttentionWhatHappened({
      reasonCodes: ["recurring_late_sleep"],
      primaryReason: "needs_attention",
      evidenceSummary: "tier=urgent rankScore=12",
    });
    expect(what).toBe("最近幾天比較晚睡");
    expect(containsInternalCoachTerminology(what)).toBe(false);
    expect(what).not.toMatch(/needs_attention|urgent|rankScore|reasonCodes/);

    const urgent = buildWorkbenchUrgentCards([
      mockCard({
        section: "needs_attention",
        reasonCodes: ["recurring_late_sleep"],
        evidenceSummary: "attention_tier_urgent",
        assessment: {
          tier: "coach_attention",
          commandCenterSection: "needs_attention",
          reasonCodes: ["recurring_late_sleep"],
          primaryReason: "coach_attention",
          evidence: [],
          recommendedActionType: "ask_late_sleep_reason",
          measurementReminder: false,
          suppressedReasonCodes: [],
          recentCoachActionAcknowledged: false,
          consecutiveMissedCompletedDays: 0,
          rankScore: 80,
        },
      }),
    ]);
    expect(urgent[0].whatHappened).not.toMatch(/needs_attention|coach_attention|urgent|tier/i);
    expect(urgent[0].nextStep).not.toMatch(/ask_late_sleep_reason/);
  });

  it("CUX-06 raw Outcome enum never shown", () => {
    expect(humanizeOutcomeConclusion("not_yet_measurable")).toContain("目前資料還不夠");
    expect(humanizeOutcomeConclusion("not_yet_measurable")).not.toContain("not_yet_measurable");
    expect(humanizeOutcomeConclusion("baseline_only")).not.toContain("baseline");
    expect(humanizeOutcomeConclusion("improving")).toContain("進展良好");
    expect(humanizeOutcomeConclusion("improving")).not.toMatch(/improving|mixed|fingerprint/);
    expect(humanizeOutcomeConclusion("mixed")).not.toContain("mixed");
  });

  it("CUX-07 bowel secondary signal does not mutate Attention", () => {
    const withBowel = buildDetailActionCard({
      submitted: true,
      aiStatus: "completed",
      coachAttentionRequired: false,
      attentionReason: null,
      dailySummary: null,
      interventionLevel: "normal",
      bowelCount: 5,
    });
    expect(withBowel.title).toBe("目前狀況穩定");
    expect(withBowel.secondaryNote).toBeTruthy();
    expect(withBowel.title).not.toBe("今天建議關心一下");

    const attention = buildDetailActionCard({
      submitted: true,
      aiStatus: "completed",
      coachAttentionRequired: true,
      attentionReason: "最近幾天睡得比較晚。",
      dailySummary: null,
      interventionLevel: "coach_attention",
      bowelCount: 5,
    });
    expect(attention.title).toBe("今天建議關心一下");
    expect(attention.secondaryNote).toBeTruthy();
  });

  it("CUX-08 Directive secondary signal does not mutate Attention", () => {
    const card = buildDetailActionCard({
      submitted: true,
      aiStatus: "completed",
      coachAttentionRequired: false,
      attentionReason: null,
      dailySummary: null,
      interventionLevel: "normal",
      bowelCount: 1,
      directiveSecondaryNote: "早餐安排尚未完成驗證。",
    });
    expect(card.title).toBe("目前狀況穩定");
    expect(card.secondaryNote).toContain("早餐安排");
  });

  it("CUX-09 insufficient measurement humanized", () => {
    const copy = humanizeOutcomeConclusion("not_yet_measurable");
    expect(copy).toBe("目前資料還不夠，下一次量測後會更容易看出變化。");
    expect(copy).not.toMatch(/not_yet_measurable|baseline_only|insufficient_data/);
  });

  it("CUX-10 Growth collapsed", () => {
    expect(DETAIL_MORE_DEFAULT_OPEN).toBe(false);
    expect(DETAIL_DEFERRED_PANEL_IDS).toContain("growth");
    const detailSource = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingDetailPage.tsx"),
      "utf8",
    );
    expect(detailSource).toContain("DETAIL_MORE_DEFAULT_OPEN");
    expect(detailSource).toMatch(/showMore[\s\S]*CoachingGrowthPanel/);
    expect(detailSource).toMatch(/\{showMore \?/);
  });

  it("CUX-11 Timeline/history deferred", () => {
    expect(DETAIL_DEFERRED_PANEL_IDS).toEqual(
      expect.arrayContaining(["timeline", "history", "growth", "directive", "coach_actions"]),
    );
    const detailSource = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingDetailPage.tsx"),
      "utf8",
    );
    expect(detailSource).toContain("loadMorePanels");
    expect(detailSource).toContain("CoachingTimelinePanel");
    expect(detailSource).toMatch(/tab === "timeline"/);
  });

  it("CUX-12 mobile long text wraps", () => {
    const long = "這是一段很長的說明文字，用來確認工作台卡片與 Detail 建議區不會被截斷成單行。".repeat(3);
    const what = humanizeAttentionWhatHappened({
      reasonCodes: [],
      primaryReason: long,
      evidenceSummary: null,
    });
    expect(what.length).toBeGreaterThan(40);
    const cc = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingCommandCenterPage.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingDetailPage.tsx"),
      "utf8",
    );
    expect(cc).toContain("break-words");
    expect(detail).toContain("break-words");
    expect(cc).toContain("min-h-11");
    expect(detail).toContain("min-h-11");
  });

  it("CUX-13 no user-visible internal terminology", () => {
    const samples = [
      ...Object.values(COACH_TODAY_REPORT_LABELS),
      ...Object.values(COACH_TODAY_REPORT_SHORT),
      humanizeOutcomeConclusion("improving"),
      humanizeOutcomeConclusion("not_yet_measurable"),
      humanizeAttentionWhatHappened({
        reasonCodes: ["final_intervention_coach_attention"],
        primaryReason: null,
        evidenceSummary: null,
      }),
      buildDetailActionCard({
        submitted: true,
        aiStatus: "completed",
        coachAttentionRequired: true,
        attentionReason: "最近幾天睡得比較晚。",
        dailySummary: null,
        interventionLevel: "coach_attention",
        bowelCount: 1,
      }).title,
    ];
    for (const sample of samples) {
      expect(containsInternalCoachTerminology(sample)).toBe(false);
      expect(sample).not.toMatch(
        /\b(Customer|Outcome|Attention|Intervention|Growth|Evidence|Directive|Day N|baseline|measurement_stage|reasonCodes|tier|rankScore|fingerprint)\b/i,
      );
      expect(sample).not.toMatch(/needs_attention|coach_attention|not_yet_measurable/);
    }

    const pageSources = [
      "src/components/coaching/CoachingCommandCenterPage.tsx",
      "src/components/coaching/CoachingDetailPage.tsx",
      "src/components/coaching/CoachingTimelinePanel.tsx",
    ].map((p) => readFileSync(resolve(process.cwd(), p), "utf8"));
    for (const source of pageSources) {
      expect(source).not.toMatch(/>\s*(Attention|Outcome|Evidence|Intervention|Growth|Directive|Customer)\s*</);
      expect(source).not.toMatch(/["'`]Outcome：/);
      expect(source).not.toMatch(/["'`]Evidence["'`]/);
      expect(source).not.toMatch(/["'`]Customer 回報["'`]/);
      expect(source).not.toMatch(/["'`]Coach Brief["'`]/);
      expect(source).not.toMatch(/["'`]AI Coaching["'`]/);
      expect(source).not.toMatch(/["'`]Baseline["'`]/);
    }

  });

  it("CUX-14 existing Coach Action still works", () => {
    const card = buildDetailActionCard({
      submitted: true,
      aiStatus: "completed",
      coachAttentionRequired: true,
      attentionReason: "最近幾天睡得比較晚。",
      dailySummary: "睡眠偏晚",
      interventionLevel: "coach_attention",
      bowelCount: 1,
    });
    expect(card.showRecordAction).toBe(true);
    const detail = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingDetailPage.tsx"),
      "utf8",
    );
    expect(detail).toContain("CoachingCoachActionPanel");
    expect(detail).toContain("記錄已處理");
  });

  it("CUX-15 focus refresh still works", () => {
    const cc = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingCommandCenterPage.tsx"),
      "utf8",
    );
    const detail = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingDetailPage.tsx"),
      "utf8",
    );
    expect(cc).toContain("useSoftRefresh");
    expect(detail).toContain("useSoftRefresh");
    const hook = readFileSync(resolve(process.cwd(), "src/lib/hooks/use-soft-refresh.ts"), "utf8");
    expect(hook).toContain('addEventListener("focus"');
    expect(hook).toContain("visibilitychange");
  });
});
