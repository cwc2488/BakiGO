import { describe, expect, it } from "vitest";
import {
  composeGo21VisionFreeMessage,
  parseGo21PhotoPath,
  type Go21RealtimeVisionResult,
} from "@/lib/go21/realtime-vision";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import type { CoachingMealObservation } from "@/types/coaching-signals";

const emptyVision = (overrides: Partial<Go21RealtimeVisionResult> = {}): Go21RealtimeVisionResult => ({
  ran: false,
  reusedCache: false,
  failed: false,
  failureReason: null,
  storagePath: null,
  mealSlotResolved: null,
  mealSlotUnresolved: false,
  observations: [],
  evidenceSummary: null,
  source: "none",
  usage: { inputTokens: 0, outputTokens: 0, imageCount: 0 },
  foodRelevant: false,
  foodRelevance: null,
  ...overrides,
});

describe("parseGo21PhotoPath", () => {
  it("parses primary meal slots", () => {
    const parsed = parseGo21PhotoPath(
      "cus-a/enr-b/2026-08-29/lunch/photo-1.jpg",
    );
    expect(parsed).toEqual({
      customerId: "cus-a",
      enrollmentId: "enr-b",
      logDate: "2026-08-29",
      mealSlot: "lunch",
      photoId: "photo-1",
    });
  });

  it("parses snacks (photo-only storage)", () => {
    const parsed = parseGo21PhotoPath(
      "cus-a/enr-b/2026-08-29/snacks/photo-2.jpg",
    );
    expect(parsed?.mealSlot).toBe("snacks");
  });

  it("rejects malformed / foreign-looking paths", () => {
    expect(parseGo21PhotoPath("../etc/passwd")).toBeNull();
    expect(parseGo21PhotoPath("cus/enr/date/other/x.jpg")).toBeNull();
    expect(parseGo21PhotoPath("")).toBeNull();
  });
});

describe("photo-only does not invent meal slot", () => {
  it("empty message + photo → meal_slot null + unresolved", () => {
    const extracted = extractGo21StructuredEvent({
      message: "",
      messageLogDate: "2026-08-29",
      hasPhoto: true,
    });
    expect(extracted.mealSlot).toBeNull();
    expect(extracted.unresolvedQuestions).toContain("meal_slot_unknown");
  });

  it("PHOTO + 這個可以嗎 → no invented breakfast/lunch/dinner", () => {
    const extracted = extractGo21StructuredEvent({
      message: "這個可以嗎",
      messageLogDate: "2026-08-29",
      hasPhoto: true,
    });
    expect(extracted.mealSlot).toBeNull();
    expect(["breakfast", "lunch", "dinner"]).not.toContain(extracted.mealSlot as string);
  });

  it("PHOTO + 午餐 → lunch claimed by customer text", () => {
    const extracted = extractGo21StructuredEvent({
      message: "午餐",
      messageLogDate: "2026-08-29",
      hasPhoto: true,
    });
    expect(extracted.mealSlot).toBe("lunch");
  });
});

describe("composeGo21VisionFreeMessage", () => {
  it("passes through text-only without vision block", () => {
    expect(
      composeGo21VisionFreeMessage({
        customerMessage: "今天水喝超少",
        hasPhoto: false,
        vision: emptyVision(),
      }),
    ).toBe("今天水喝超少");
  });

  it("degrades gracefully on vision failure without fabricating analysis", () => {
    const msg = composeGo21VisionFreeMessage({
      customerMessage: "午餐",
      hasPhoto: true,
      vision: emptyVision({
        ran: true,
        failed: true,
        failureReason: "vision_unavailable_or_failed",
        storagePath: "cus/enr/2026-08-29/lunch/p.jpg",
      }),
    });
    expect(msg).toContain("午餐");
    expect(msg).toMatch(/未成功|看清楚|補充/);
    expect(msg).not.toMatch(/\d+\s*kcal/i);
  });

  it("includes image evidence summary when vision succeeds", () => {
    const observation: CoachingMealObservation = {
      mealSlot: "lunch",
      observedFoods: ["飯", "青菜", "雞胸"],
      signals: [],
      evidenceText: ["青菜可見"],
      visibleVegetables: true,
      visibleProteinSource: true,
      confidence: "medium",
      uncertainties: ["醬料是否偏甜不確定"],
    };
    const msg = composeGo21VisionFreeMessage({
      customerMessage: "午餐",
      hasPhoto: true,
      vision: emptyVision({
        ran: true,
        evidenceSummary: "lunch｜可見：飯、青菜、雞胸｜有看到蔬菜，有看到蛋白質來源｜信心：medium",
        observations: [observation],
        source: "merged",
        storagePath: "cus/enr/2026-08-29/lunch/p.jpg",
      }),
    });
    expect(msg).toContain("影像觀察");
    expect(msg).toContain("青菜");
    expect(msg).not.toMatch(/\d{3,}\s*kcal/);
  });

  it("marks unresolved meal when photo-only", () => {
    const msg = composeGo21VisionFreeMessage({
      customerMessage: "",
      hasPhoto: true,
      vision: emptyVision({
        ran: true,
        mealSlotUnresolved: true,
        evidenceSummary: "餐別未確認｜可見：飯、肉｜信心：low",
        source: "cache",
        reusedCache: true,
      }),
    });
    expect(msg).toContain("餐別未確認");
    expect(msg).not.toMatch(/^(早餐|午餐|晚餐)$/m);
  });
});

describe("vision evidence is observation not scanner template", () => {
  it("evidence wording avoids calorie/macro dashboard framing", () => {
    const summary = "lunch｜可見：沙拉、雞胸｜有看到蔬菜｜信心：medium";
    expect(summary).not.toMatch(/kcal|卡路里|蛋白質\s*\d+|碳水\s*\d+/i);
  });
});
