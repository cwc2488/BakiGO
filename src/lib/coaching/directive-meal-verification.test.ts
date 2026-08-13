import { describe, expect, it } from "vitest";
import {
  verifyCoachDirectivesAgainstMeals,
  type StructuredCoachDirective,
} from "@/lib/coaching/directive-meal-verification";

function shakeDirective(
  patch: Partial<StructuredCoachDirective> & Pick<StructuredCoachDirective, "id" | "mealSlot">,
): StructuredCoachDirective {
  return {
    instructionText: "早餐喝奶昔",
    effectiveFrom: "2026-08-01",
    effectiveUntil: null,
    status: "active",
    customerVisible: true,
    ...patch,
  };
}

describe("directive-meal-verification CD-1..CD-6", () => {
  it("CD-1 shake visible → followed", () => {
    const [result] = verifyCoachDirectivesAgainstMeals({
      logDate: "2026-08-12",
      directives: [shakeDirective({ id: "d1", mealSlot: "breakfast" })],
      mealObservations: [{ mealSlot: "breakfast", shakeObserved: true, confidence: 0.9 }],
    });
    expect(result?.status).toBe("followed");
    expect(result?.reason).toBe("shake_visible");
  });

  it("CD-2 shake not visible → possible_not_followed", () => {
    const [result] = verifyCoachDirectivesAgainstMeals({
      logDate: "2026-08-12",
      directives: [shakeDirective({ id: "d2", mealSlot: "breakfast" })],
      mealObservations: [
        {
          mealSlot: "breakfast",
          shakeObserved: false,
          observedFoods: ["吐司", "蛋"],
          confidence: 0.9,
        },
      ],
    });
    expect(result?.status).toBe("possible_not_followed");
    expect(result?.reason).toBe("shake_not_visible");
  });

  it("CD-3 vision uncertain → unknown", () => {
    const [result] = verifyCoachDirectivesAgainstMeals({
      logDate: "2026-08-12",
      directives: [shakeDirective({ id: "d3", mealSlot: "lunch" })],
      mealObservations: [
        {
          mealSlot: "lunch",
          shakeObserved: false,
          uncertainties: ["blurry"],
          confidence: 0.3,
        },
      ],
    });
    expect(result?.status).toBe("unknown");
    expect(result?.reason).toBe("vision_uncertain");
  });

  it("CD-4 expired directive → ignored", () => {
    const [result] = verifyCoachDirectivesAgainstMeals({
      logDate: "2026-08-12",
      directives: [
        shakeDirective({
          id: "d4",
          mealSlot: "breakfast",
          effectiveFrom: "2026-08-01",
          effectiveUntil: "2026-08-10",
        }),
      ],
      mealObservations: [{ mealSlot: "breakfast", shakeObserved: true }],
    });
    expect(result?.status).toBe("ignored");
    expect(result?.reason).toBe("expired_or_inactive");
  });

  it("CD-5 breakfast/lunch/dinner mapping", () => {
    const results = verifyCoachDirectivesAgainstMeals({
      logDate: "2026-08-12",
      directives: [
        shakeDirective({ id: "b", mealSlot: "breakfast", instructionText: "早餐喝奶昔" }),
        shakeDirective({ id: "l", mealSlot: "lunch", instructionText: "午餐喝奶昔" }),
        shakeDirective({ id: "d", mealSlot: "dinner", instructionText: "晚餐喝奶昔" }),
      ],
      mealObservations: [
        { mealSlot: "breakfast", shakeObserved: true, confidence: 0.9 },
        { mealSlot: "lunch", shakeObserved: false, observedFoods: ["便當"], confidence: 0.9 },
        { mealSlot: "dinner", shakeObserved: true, confidence: 0.9 },
      ],
    });
    expect(results.map((r) => r.mealSlot)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(results.map((r) => r.status)).toEqual([
      "followed",
      "possible_not_followed",
      "followed",
    ]);
    expect(results[0]?.coachCopy).toContain("早餐");
    expect(results[1]?.coachCopy).toContain("午餐");
    expect(results[2]?.coachCopy).toContain("晚餐");
  });

  it("CD-6 customer says separately consumed → not possible_not_followed", () => {
    const [result] = verifyCoachDirectivesAgainstMeals({
      logDate: "2026-08-12",
      directives: [shakeDirective({ id: "d6", mealSlot: "breakfast" })],
      mealObservations: [
        {
          mealSlot: "breakfast",
          shakeObserved: false,
          observedFoods: ["飯糰"],
          confidence: 0.9,
        },
      ],
      customerNote: "奶昔我另外有喝了",
    });
    expect(result?.status).not.toBe("possible_not_followed");
    expect(result?.status).toBe("unknown");
    expect(result?.reason).toBe("customer_claims_separate");
  });
});
