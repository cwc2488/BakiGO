import { describe, expect, it } from "vitest";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { classifyGo21Relevance } from "@/lib/go21/relevance";
import {
  isGo21QuietHour,
  nextGo21DeliveryAt,
  buildDeterministicReminderPreview,
  shouldScheduleMeasurementReminder,
} from "@/lib/go21/reminders";

describe("Go21 NL extraction", () => {
  it("maps 昨天晚餐 to previous calendar day", () => {
    const result = extractGo21StructuredEvent({
      message: "昨天晚餐吃了炒飯",
      messageLogDate: "2026-08-29",
    });
    expect(result.eventDate).toBe("2026-08-28");
    expect(result.mealSlot).toBe("dinner");
    expect(result.confidence).toBe("high");
  });

  it("parses afternoon snack time", () => {
    const result = extractGo21StructuredEvent({
      message: "下午三點吃了一個飯糰",
      messageLogDate: "2026-08-29",
    });
    expect(result.eventDate).toBe("2026-08-29");
    expect(result.eventTimeApprox).toBe("15:00");
    expect(result.mealSlot).toBe("snacks");
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
});

describe("Go21 relevance routing", () => {
  it("keeps nutrition in scope", () => {
    expect(classifyGo21Relevance("午餐蛋白質好像不夠")).toBe("in_scope");
  });

  it("treats breakup affecting appetite as contextual", () => {
    expect(classifyGo21Relevance("我跟女朋友分手，這幾天完全吃不下")).toBe(
      "contextually_relevant",
    );
  });

  it("redirects pure out-of-scope asks", () => {
    expect(classifyGo21Relevance("台積電明天會不會漲？")).toBe("out_of_scope");
    expect(classifyGo21Relevance("幫我寫程式")).toBe("out_of_scope");
    expect(classifyGo21Relevance("她還愛不愛我？")).toBe("out_of_scope");
  });
});

describe("Go21 reminders", () => {
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
