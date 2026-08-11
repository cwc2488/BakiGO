import { describe, expect, it } from "vitest";
import { buildCoachingAiFixtureGenerationInput } from "@/lib/coaching/ai/coaching-ai-fixtures";
import {
  buildCoachingDecisionContext,
  buildTomorrowFocusContract,
  collectCoachingSignals,
  getFixtureMealObservations,
  rankCoachingPriorities,
  resolveCoachAttention,
  selectImprovedIssue,
  selectRecurringIssue,
} from "@/lib/coaching/ai/coaching-signal-engine";
import type { CoachingMealObservation } from "@/types/coaching-signals";

describe("coaching signal engine — A/B/C deterministic regression", () => {
  it("A_normal: zero priorities, positive signals, no invented hydration target, no attention", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("A_normal");
    const decision = buildCoachingDecisionContext({
      generationInput,
      mealObservations: getFixtureMealObservations("A_normal"),
    });

    expect(decision.priorities).toEqual([]);
    expect(decision.positiveSignals.some((item) => item.key === "complete_primary_meal_reporting")).toBe(true);
    expect(decision.positiveSignals.some((item) => item.key === "exercised_today")).toBe(true);
    expect(decision.signals.some((item) => item.key === "hydration_below_plan")).toBe(false);
    expect(decision.signals.some((item) => item.key === "hydration_met_plan")).toBe(false);
    expect(decision.signals.some((item) => item.key.includes("2000"))).toBe(false);
    expect(decision.coachAttention.required).toBe(false);
    expect(decision.finalInterventionLevel).toBe("normal");

    // Soft late_sleep_pattern (23:00) may exist as signal but must not become priority.
    const late = decision.signals.find((item) => item.key === "late_sleep_pattern");
    if (late) {
      expect(late.severity).toBe("minor");
      expect(late.evidence.some((e) => e.key === "late_sleep_days")).toBe(true);
    }
  });

  it("B_breakfast_deviation: protein + sugary drink outrank sauce/lunch minors; no attention", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("B_breakfast_deviation");
    const mealObservations: CoachingMealObservation[] = [
      ...getFixtureMealObservations("B_breakfast_deviation"),
      {
        mealSlot: "lunch",
        observedFoods: ["便當"],
        signals: ["high_sauce", "vegetable_low"],
        evidenceText: ["lunch sauce/veg minor"],
      },
    ];

    const decision = buildCoachingDecisionContext({ generationInput, mealObservations });
    expect(decision.priorities).toHaveLength(2);
    expect(decision.priorities.map((item) => item.reason)).toEqual(["早餐蛋白質", "含糖飲料替代"]);
    expect(decision.priorities[0]?.evidence.length).toBeGreaterThan(0);
    expect(decision.priorities[1]?.evidence.length).toBeGreaterThan(0);
    expect(decision.coachAttention.required).toBe(false);
    expect(decision.finalInterventionLevel).toBe("normal");

    const continuity = buildTomorrowFocusContract(decision.priorities);
    expect(continuity.subject).toBe("早餐蛋白質");
    expect(continuity.sourceSignalKey).toContain("low_protein");
  });

  it("C_watch_pattern: recurring late sleep owns priority/evidence; no praise skip; hotpot ≠ attention", () => {
    const { generationInput, finalInterventionLevel } =
      buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const decision = buildCoachingDecisionContext({
      generationInput,
      mealObservations: getFixtureMealObservations("C_watch_pattern"),
      finalInterventionLevelOverride: finalInterventionLevel,
    });

    expect(decision.finalInterventionLevel).toBe("watch");
    expect(decision.recurringIssue).not.toBeNull();
    expect(decision.recurringIssue?.key).toBe("late_sleep_pattern");
    expect(decision.recurringIssue?.evidence.some((e) => e.key === "late_sleep_days")).toBe(true);
    expect(decision.recurringIssue?.evidence.some((e) => e.key === "observed_days")).toBe(true);

    expect(decision.positiveSignals.some((item) => /skipped_meal_but_drinking_water_was_good/.test(item.key))).toBe(
      false,
    );
    expect(decision.positiveSignals.some((item) => item.key.includes("meal_skipped"))).toBe(false);

    expect(decision.priorities[0]?.signalKey).toBe("late_sleep_pattern");
    expect(decision.priorities.some((item) => item.signalKey.includes("processed_food"))).toBe(false);

    expect(decision.coachAttention.required).toBe(false);
    expect(decision.coachAttention.reason).toBeNull();
  });
});

describe("coaching signal engine — contracts", () => {
  it("binds evidence on every collected signal", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const signals = collectCoachingSignals({
      generationInput,
      mealObservations: getFixtureMealObservations("C_watch_pattern"),
    });
    expect(signals.length).toBeGreaterThan(0);
    for (const item of signals) {
      expect(item.evidence.length).toBeGreaterThan(0);
    }
  });

  it("does not create hydration plan signals without plan/directive target", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("A_normal");
    generationInput.todayContext.waterMl = 1800;
    const signals = collectCoachingSignals({ generationInput, mealObservations: [] });
    expect(signals.some((item) => item.key.startsWith("hydration_"))).toBe(false);
  });

  it("creates hydration signals only when directive defines ml target", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("A_normal");
    generationInput.coachDirectives = {
      currentFocus: "水分",
      currentPriority: "補水",
      coachInstruction: "每日水分目標 2000ml",
      effectiveFrom: "2026-08-01",
    };
    generationInput.todayContext.waterMl = 1800;
    const signals = collectCoachingSignals({ generationInput, mealObservations: [] });
    expect(signals.some((item) => item.key === "hydration_below_plan")).toBe(true);
    const hit = signals.find((item) => item.key === "hydration_below_plan");
    expect(hit?.evidence.some((e) => e.key === "water_ml_target" && e.value === 2000)).toBe(true);
    expect(hit?.evidence.some((e) => e.key === "water_ml_observed" && e.value === 1800)).toBe(true);
  });

  it("rankCoachingPriorities allows empty and caps at 2", () => {
    expect(rankCoachingPriorities([])).toEqual([]);
    const { generationInput } = buildCoachingAiFixtureGenerationInput("B_breakfast_deviation");
    const signals = collectCoachingSignals({
      generationInput,
      mealObservations: [
        ...getFixtureMealObservations("B_breakfast_deviation"),
        {
          mealSlot: "dinner",
          observedFoods: ["炸物"],
          signals: ["fried_food", "high_sauce", "vegetable_low"],
          evidenceText: ["noise"],
        },
      ],
    });
    const priorities = rankCoachingPriorities(signals);
    expect(priorities.length).toBeLessThanOrEqual(2);
    expect(priorities.map((item) => item.rank)).toEqual([1, 2]);
  });

  it("selectRecurringIssue / selectImprovedIssue require evidence else null", () => {
    expect(selectRecurringIssue([])).toBeNull();
    expect(selectImprovedIssue([])).toBeNull();
    expect(
      selectRecurringIssue([
        {
          key: "late_sleep_pattern",
          category: "sleep",
          severity: "moderate",
          source: "rolling",
          confidence: "deterministic",
          evidence: [],
        },
      ]),
    ).toBeNull();
  });

  it("resolveCoachAttention stays false for single meal deviations", () => {
    const decision = resolveCoachAttention({
      interventionLevel: "normal",
      signals: [
        {
          key: "meal_processed_food_dinner",
          category: "meal",
          severity: "moderate",
          source: "today",
          confidence: "deterministic",
          evidence: [
            { key: "meal_slot", value: "dinner" },
            { key: "observation_signal", value: "processed_food" },
          ],
        },
        {
          key: "meal_sugary_drink_breakfast",
          category: "meal",
          severity: "moderate",
          source: "today",
          confidence: "deterministic",
          evidence: [
            { key: "meal_slot", value: "breakfast" },
            { key: "observation_signal", value: "sugary_drink" },
          ],
        },
      ],
    });
    expect(decision.required).toBe(false);
  });
});
