import { describe, expect, it } from "vitest";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import {
  applyMealFollowUpBudgetToOutput,
  buildMealFollowUpBudget,
  countCustomerMealClarificationQuestions,
} from "@/lib/coaching/ai/meal-follow-up-budget";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION, type CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";
import type { CoachingMealObservation } from "@/types/coaching-signals";
import { buildMealPlanContext } from "@/lib/coaching/ai/meal-plan-context";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";

describe("DailyNutritionAssessment", () => {
  it("marks Case E multi-meal accumulation as needs_adjustment or off_track", () => {
    const packed = buildScenarioDecisionContext("E_full_day_off_track");
    expect(["needs_adjustment", "off_track"]).toContain(packed.decisionContext.dailyNutritionAssessment.level);
    expect(packed.decisionContext.dailyNutritionAssessment.adjustmentSubjects.length).toBeGreaterThanOrEqual(2);
    expect(packed.decisionContext.coachAttention.required).toBe(false);
  });

  it("keeps Case F single-meal fried as on_track", () => {
    const packed = buildScenarioDecisionContext("F_single_meal_fried");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.coachAttention.required).toBe(false);
  });

  it("marks Case A plan-approved shake day as on_track with empty priorities", () => {
    const packed = buildScenarioDecisionContext("A_normal");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.priorities.length).toBe(0);
    expect(packed.decisionContext.mealFollowUpBudget.allowCustomerMealClarification).toBe(false);
  });

  it("marks Case H balanced day as on_track with empty priorities", () => {
    const packed = buildScenarioDecisionContext("H_on_track_day");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.priorities.length).toBe(0);
  });

  it("returns insufficient_data when no usable observations", () => {
    const result = assessDailyNutrition({ mealObservations: [] });
    expect(result.level).toBe("insufficient_data");
  });
});

describe("meal follow-up budget", () => {
  it("suppresses duplicate shake clarifications when hunger is present (Case G)", () => {
    const packed = buildScenarioDecisionContext("G_shake_hunger");
    expect(packed.decisionContext.customerVoice.some((item) => item.key === "hunger_reported")).toBe(true);
    expect(packed.decisionContext.mealFollowUpBudget.allowCustomerMealClarification).toBe(false);

    const raw: CoachingDailyGenerationOutputJson = {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "你願意誠實寫下還是會很餓，這點很重要。",
        today_feedback: "先不用硬撐。",
        daily_food_summary: "早晚餐偏奶昔，可能跟飽足感有關。",
        meal_feedback: {
          breakfast: {
            summary: "奶昔",
            good_point: null,
            adjustment: null,
            follow_up_question: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
          },
          lunch: null,
          dinner: {
            summary: "奶昔",
            good_point: null,
            adjustment: null,
            follow_up_question: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
          },
        },
        lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
        customer_voice_response: "你說還是會很餓，有可能跟餐食組成有關。",
        adjustment_priorities: [],
        tomorrow_focus: "維持節奏",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "hunger",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: [],
        follow_ups: [],
        photo_reuse_flags: [],
        daily_nutrition_assessment: null,
      },
    };

    const applied = applyCoachingDecisionContextToOutput(raw, packed.decisionContext);
    expect(countCustomerMealClarificationQuestions(applied)).toBe(0);
    expect(applied.customer.customer_voice_response).toMatch(/餓/);
    expect(applied.customer.tomorrow_focus.length).toBeGreaterThan(0);
    expect(applied.customer.adjustment_priorities.length).toBeLessThanOrEqual(2);
  });

  it("consolidates multi-shake questions into one day-level ask when no hunger", () => {
    const observations: CoachingMealObservation[] = [
      {
        mealSlot: "breakfast",
        observedFoods: ["奶昔"],
        signals: ["shake_dominant"],
        evidenceText: [],
        shakeObserved: true,
        noOtherFoodVisible: true,
        followUpQuestion: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
      },
      {
        mealSlot: "dinner",
        observedFoods: ["奶昔"],
        signals: ["shake_dominant"],
        evidenceText: [],
        shakeObserved: true,
        noOtherFoodVisible: true,
        followUpQuestion: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
      },
    ];
    const budget = buildMealFollowUpBudget({
      mealObservations: observations,
      planContext: {
        breakfastAllowsShake: false,
        lunchAllowsShake: false,
        dinnerAllowsShake: false,
      },
      hungerReported: false,
    });
    expect(budget.allowCustomerMealClarification).toBe(true);
    expect(budget.consolidatedQuestion).toMatch(/早餐和晚餐/);
    expect(budget.selectedMealSlot).toBeNull();
  });

  it("keeps at most one meal clarification after apply", () => {
    const packed = buildScenarioDecisionContext("B_breakfast_deviation");
    const withDupes: CoachingDailyGenerationOutputJson = {
      ...getFixtureScenarioOutput("B_breakfast_deviation"),
      customer: {
        ...getFixtureScenarioOutput("B_breakfast_deviation").customer,
        meal_feedback: {
          breakfast: {
            summary: "蛋餅",
            good_point: null,
            adjustment: null,
            follow_up_question: "還有沒有搭配其他東西？",
          },
          lunch: {
            summary: "便當",
            good_point: null,
            adjustment: null,
            follow_up_question: "還有沒有搭配其他東西？",
          },
          dinner: {
            summary: "奶昔",
            good_point: null,
            adjustment: null,
            follow_up_question: "還有沒有搭配其他東西？",
          },
        },
      },
    };

    // Force a budget that allows one selected slot.
    const decision = {
      ...packed.decisionContext,
      mealFollowUpBudget: {
        maxCustomerMealClarifications: 1 as const,
        selectedMealSlot: "breakfast" as const,
        selectedQuestion: "還有沒有搭配其他東西？",
        suppressedMealSlots: ["lunch", "dinner"] as Array<"breakfast" | "lunch" | "dinner">,
        consolidatedQuestion: null,
        allowCustomerMealClarification: true,
      },
    };

    const applied = applyMealFollowUpBudgetToOutput(withDupes, decision);
    expect(countCustomerMealClarificationQuestions(applied)).toBe(1);
    expect(applied.customer.meal_feedback.breakfast?.follow_up_question).toBeTruthy();
    expect(applied.customer.meal_feedback.lunch?.follow_up_question).toBeNull();
    expect(applied.customer.meal_feedback.dinner?.follow_up_question).toBeNull();
  });
});

describe("golden cases E–H fixture wording", () => {
  it("Case E does not praise diet behavior", () => {
    const output = getFixtureScenarioOutput("E_full_day_off_track");
    expect(["needs_adjustment", "off_track"]).toContain(output.coach.daily_nutrition_assessment?.level);
    const text = `${output.customer.encouragement} ${output.customer.today_feedback} ${output.customer.daily_food_summary}`;
    expect(text).not.toMatch(/吃得很棒|飲食很不錯|吃得開心最重要|繼續保持這樣吃/);
    expect(output.customer.daily_food_summary).toMatch(/累積|整天|減脂/);
    expect(output.customer.adjustment_priorities.length).toBeLessThanOrEqual(2);
  });

  it("Case F stays calm on single fried meal", () => {
    const packed = buildScenarioDecisionContext("F_single_meal_fried");
    const output = getFixtureScenarioOutput("F_single_meal_fried");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(output.coach.coach_attention_required).toBe(false);
    expect(output.customer.daily_food_summary).not.toMatch(/完全失敗|一定瘦不下來/);
  });

  it("Case H allows empty priorities and sincere encouragement", () => {
    const packed = buildScenarioDecisionContext("H_on_track_day");
    const output = getFixtureScenarioOutput("H_on_track_day");
    expect(packed.decisionContext.priorities).toEqual([]);
    expect(output.customer.adjustment_priorities).toEqual([]);
    expect(output.customer.encouragement.length).toBeGreaterThan(0);
  });
});
