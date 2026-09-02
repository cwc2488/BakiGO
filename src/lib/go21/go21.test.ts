import { describe, expect, it, vi } from "vitest";
import {
  extractGo21StructuredEvent,
  extractWeightKg,
  resolveEventDate,
} from "@/lib/go21/extract-structured-event";
import { classifyGo21Relevance } from "@/lib/go21/relevance";
import {
  isGo21QuietHour,
  nextGo21DeliveryAt,
  buildDeterministicReminderPreview,
  shouldScheduleMeasurementReminder,
  canDeliverReminderNow,
} from "@/lib/go21/reminders";
import { hasMeasurementNearDay, resolveGo21LifecycleAnchor } from "@/lib/go21/go21-portal";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";

describe("Go21 NL extraction — no fabrication", () => {
  it("maps 昨天晚餐 to previous calendar day", () => {
    const result = extractGo21StructuredEvent({
      message: "昨天晚餐吃了炒飯",
      messageLogDate: "2026-08-29",
    });
    expect(result.eventDate).toBe("2026-08-28");
    expect(result.mealSlot).toBe("dinner");
    expect(result.confidence).toBe("high");
  });

  it("maps 前天晚餐", () => {
    const result = extractGo21StructuredEvent({
      message: "前天晚餐火鍋",
      messageLogDate: "2026-08-29",
    });
    expect(result.eventDate).toBe("2026-08-27");
    expect(result.mealSlot).toBe("dinner");
  });

  it("parses explicit 8/28 晚餐", () => {
    const result = extractGo21StructuredEvent({
      message: "8/28 晚餐吃了麵",
      messageLogDate: "2026-08-29",
    });
    expect(result.eventDate).toBe("2026-08-28");
    expect(result.mealSlot).toBe("dinner");
  });

  it("parses afternoon snack time and 15:30", () => {
    const spoken = extractGo21StructuredEvent({
      message: "下午三點吃了一個飯糰",
      messageLogDate: "2026-08-29",
    });
    expect(spoken.eventTimeApprox).toBe("15:00");
    expect(spoken.mealSlot).toBe("snacks");

    const clock = extractGo21StructuredEvent({
      message: "15:30吃的優格",
      messageLogDate: "2026-08-29",
    });
    expect(clock.eventTimeApprox).toBe("15:30");
  });

  it("does not invent dinner from photo-only nighttime message", () => {
    const result = extractGo21StructuredEvent({
      message: "",
      messageLogDate: "2026-08-29",
      messageTimeHm: "22:00",
      hasPhoto: true,
    });
    expect(result.mealSlot).toBeNull();
    expect(result.unresolvedQuestions).toContain("meal_slot_unknown");
  });

  it("does not fabricate waterMl for qualitative hydration", () => {
    const result = extractGo21StructuredEvent({
      message: "今天水喝超少",
      messageLogDate: "2026-08-29",
    });
    expect(result.waterMl).toBeNull();
    expect(result.hydrationQuality).toBe("low");
    expect(result.hydrationNote).toBeTruthy();
  });

  it("stores numeric water when ml is stated", () => {
    const result = extractGo21StructuredEvent({
      message: "喝了1500ml",
      messageLogDate: "2026-08-29",
    });
    expect(result.waterMl).toBe(1500);
    expect(result.weightKg).toBeNull();
  });

  it("parses natural-language weight and body fat", () => {
    const result = extractGo21StructuredEvent({
      message: "今天76.2，體脂28.1",
      messageLogDate: "2026-08-29",
    });
    expect(result.weightKg).toBe(76.2);
    expect(result.bodyFatPercent).toBe(28.1);
  });

  it("recognizes lunch keyword", () => {
    const result = extractGo21StructuredEvent({
      message: "午餐",
      messageLogDate: "2026-08-29",
      hasPhoto: true,
    });
    expect(result.mealSlot).toBe("lunch");
  });

  it("applies today→yesterday correction", () => {
    const previous = extractGo21StructuredEvent({
      message: "這是今天晚餐",
      messageLogDate: "2026-08-29",
    });
    expect(previous.eventDate).toBe("2026-08-29");
    expect(previous.mealSlot).toBe("dinner");

    const corrected = extractGo21StructuredEvent({
      message: "不是今天，是昨天",
      messageLogDate: "2026-08-29",
      previous,
    });
    expect(corrected.corrections.some((c) => c.kind === "event_date")).toBe(true);
    expect(corrected.eventDate).toBe("2026-08-28");
  });

  it("applies meal slot correction", () => {
    const previous = extractGo21StructuredEvent({
      message: "午餐",
      messageLogDate: "2026-08-29",
    });
    const corrected = extractGo21StructuredEvent({
      message: "不是午餐，是晚餐",
      messageLogDate: "2026-08-29",
      previous,
    });
    expect(corrected.mealSlot).toBe("dinner");
    expect(corrected.corrections.some((c) => c.kind === "meal_slot")).toBe(true);
  });
});

describe("Go21 weight extraction precision", () => {
  const cases: Array<[string, number | null]> = [
    ["今天運動60分鐘", null],
    ["喝了1500ml", null],
    ["8/28晚餐", null],
    ["下午3點吃", null],
    ["今天走10000步", null],
    ["體脂28.1", null],
    ["BMR 1650", null],
    ["今天76.2", 76.2],
    ["今天量76.2", 76.2],
    ["76.2公斤", 76.2],
    ["體重76", 76],
    ["今天76.2，體脂28.1", 76.2],
  ];

  for (const [message, expected] of cases) {
    it(`weight from 「${message}」 → ${expected}`, () => {
      expect(extractWeightKg(message)).toBe(expected);
      const full = extractGo21StructuredEvent({ message, messageLogDate: "2026-08-29" });
      expect(full.weightKg).toBe(expected);
    });
  }
});

describe("Go21 date helpers", () => {
  it("resolveEventDate respects Taiwan message date", () => {
    expect(resolveEventDate("昨天晚餐", "2026-08-29")).toBe("2026-08-28");
    expect(resolveEventDate("8/28晚餐", "2026-08-29")).toBe("2026-08-28");
  });
});

describe("Go21 relevance routing", () => {
  it("keeps nutrition in scope", () => {
    expect(classifyGo21Relevance("一天要喝多少水？")).toBe("in_scope");
    expect(classifyGo21Relevance("我晚餐蛋白質是不是太少？")).toBe("in_scope");
  });

  it("treats breakup affecting appetite as contextual", () => {
    expect(classifyGo21Relevance("我失戀了這幾天完全吃不下")).toBe("contextually_relevant");
  });

  it("redirects pure out-of-scope asks", () => {
    expect(classifyGo21Relevance("台積電明天會不會漲？")).toBe("out_of_scope");
    expect(classifyGo21Relevance("幫我寫Python")).toBe("out_of_scope");
    expect(classifyGo21Relevance("她到底還愛不愛我？")).toBe("out_of_scope");
  });

  it("prioritizes safety over out-of-scope", () => {
    expect(classifyGo21Relevance("我想自殺")).toBe("safety");
    expect(classifyGo21Relevance("我用瀉藥減肥")).toBe("safety");
  });
});

describe("Go21 reminders policy", () => {
  it("respects quiet hours", () => {
    expect(isGo21QuietHour(23)).toBe(true);
    expect(isGo21QuietHour(3)).toBe(true);
    expect(isGo21QuietHour(10)).toBe(false);
  });

  it("shifts delivery out of quiet hours", () => {
    const desired = new Date("2026-08-29T15:00:00.000Z"); // 23:00 Taipei
    const next = nextGo21DeliveryAt({ desiredAt: desired, now: desired });
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Taipei",
        hour: "numeric",
        hour12: false,
      }).format(next),
    );
    expect(isGo21QuietHour(hour)).toBe(false);
  });

  it("enforces daily cap and cooldown", () => {
    expect(
      canDeliverReminderNow({
        deliveredTodayCount: 2,
        lastDeliveredAt: null,
        cycleCompleted: false,
        now: new Date("2026-08-29T04:00:00.000Z"), // 12:00 Taipei
      }).ok,
    ).toBe(false);
    expect(
      canDeliverReminderNow({
        deliveredTodayCount: 0,
        lastDeliveredAt: new Date("2026-08-29T02:00:00.000Z"),
        cycleCompleted: false,
        now: new Date("2026-08-29T04:00:00.000Z"),
      }).reason,
    ).toBe("cooldown");
    expect(
      canDeliverReminderNow({
        deliveredTodayCount: 0,
        lastDeliveredAt: null,
        cycleCompleted: true,
        now: new Date("2026-08-29T04:00:00.000Z"),
      }).reason,
    ).toBe("cycle_completed");
  });

  it("builds measurement reminder kinds", () => {
    expect(shouldScheduleMeasurementReminder(7)).toBe("measurement_day7");
    expect(shouldScheduleMeasurementReminder(14)).toBe("measurement_day14");
    expect(shouldScheduleMeasurementReminder(21)).toBe("measurement_day21");
    expect(shouldScheduleMeasurementReminder(3)).toBeNull();
  });

  it("uses contextual deterministic preview", () => {
    const text = buildDeterministicReminderPreview({
      kind: "open_loop",
      openLoopSubject: "下午會不會餓",
    });
    expect(text).toContain("下午會不會餓");
    expect(text).not.toContain("您有一則健康提醒");
  });
});

describe("Go21 lifecycle milestones", () => {
  it("uses enrollment started_at as lifecycle anchor", () => {
    expect(
      resolveGo21LifecycleAnchor({
        started_at: "2026-08-01T00:00:00+08:00",
        go21_started_at: "2026-08-08T12:00:00+08:00",
      }),
    ).toBe("2026-08-01");
  });

  it("ignores pre-cycle body measurements for checkpoints", () => {
    const anchor = "2026-08-01";
    const dates = new Set(["2026-07-20", "2026-08-07"]);
    expect(hasMeasurementNearDay(anchor, 7, dates)).toBe(true);
    expect(hasMeasurementNearDay(anchor, 7, new Set(["2026-07-20"]))).toBe(false);
    expect(hasMeasurementNearDay(anchor, 14, new Set([addCalendarDays(anchor, 13)]))).toBe(true);
  });
});

describe("Go21 body record write reliability", () => {
  it("reports failure when customer isolation fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/service-client", () => ({
      createSupabaseServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }));
    const { upsertBodyRecordFromChat } = await import("@/lib/go21/body-record");
    const result = await upsertBodyRecordFromChat({
      customerId: "c1",
      ownerMemberId: "o1",
      recordDate: "2026-08-29",
      weightKg: 76,
      bodyFatPercent: null,
      skeletalMuscleKg: null,
      visceralFatLevel: null,
      basalMetabolicRate: null,
    });
    expect(result.created).toBe(false);
    expect(result.updated).toBe(false);
    expect(result.error).toBe("customer_isolation_failed");
    vi.doUnmock("@/lib/supabase/service-client");
    vi.resetModules();
  });
});
