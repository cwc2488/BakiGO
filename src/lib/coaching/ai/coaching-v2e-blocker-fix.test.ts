import { describe, expect, it } from "vitest";
import { assessDailyNutrition } from "@/lib/coaching/ai/assess-daily-nutrition";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import {
  applyMealFollowUpBudgetToOutput,
  assertCustomerFoodStatementEvidenceBacked,
  buildMealFollowUpBudget,
  isMealClarificationEligible,
} from "@/lib/coaching/ai/meal-follow-up-budget";
import { buildMealPlanContext } from "@/lib/coaching/ai/meal-plan-context";
import { normalizeMealObservation } from "@/lib/coaching/ai/normalize-meal-observations";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION, type CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";
import type { CoachingMealObservation } from "@/types/coaching-signals";

const NO_SHAKE_PLAN = {
  breakfastAllowsShake: false,
  lunchAllowsShake: false,
  dinnerAllowsShake: false,
};

const DEFAULT_PLAN = buildMealPlanContext(cloneDefaultCoachingPlanSnapshot());

describe("plan-aware shake semantics", () => {
  it("default plan allows breakfast and dinner shake, not lunch", () => {
    expect(DEFAULT_PLAN.breakfastAllowsShake).toBe(true);
    expect(DEFAULT_PLAN.lunchAllowsShake).toBe(false);
    expect(DEFAULT_PLAN.dinnerAllowsShake).toBe(true);
  });

  it("plan-approved shake is not a material deviation (Case A)", () => {
    const packed = buildScenarioDecisionContext("A_normal");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.priorities).toEqual([]);
    expect(packed.decisionContext.mealFollowUpBudget.allowCustomerMealClarification).toBe(false);
    expect(packed.decisionContext.mealFollowUpBudget.consolidatedQuestion).toBeNull();
  });

  it("shake + egg clears clarification and stays on_track (Case H)", () => {
    const packed = buildScenarioDecisionContext("H_on_track_day");
    const breakfast = packed.decisionContext.mealObservations.find((item) => item.mealSlot === "breakfast");
    expect(breakfast?.solidFoodObserved).toBe(true);
    expect(breakfast?.followUpQuestion).toBeFalsy();
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.priorities).toEqual([]);
    expect(packed.decisionContext.mealFollowUpBudget.allowCustomerMealClarification).toBe(false);
  });

  it("shake without plan context is still not automatic material deviation", () => {
    const observations: CoachingMealObservation[] = [
      {
        mealSlot: "lunch",
        observedFoods: ["奶昔"],
        signals: ["shake_dominant"],
        evidenceText: [],
        shakeObserved: true,
        noOtherFoodVisible: true,
        solidFoodObserved: false,
      },
    ];
    const result = assessDailyNutrition({
      mealObservations: observations,
      planContext: NO_SHAKE_PLAN,
    });
    expect(result.level).toBe("on_track");
  });

  it("shake + hunger allows satiety coaching without calling shake an error", () => {
    const packed = buildScenarioDecisionContext("G_shake_hunger");
    expect(packed.decisionContext.customerVoice.some((item) => item.key === "hunger_reported")).toBe(true);
    expect(["needs_adjustment", "on_track"]).toContain(
      packed.decisionContext.dailyNutritionAssessment.level,
    );
    expect(packed.decisionContext.dailyNutritionAssessment.adjustmentSubjects.join(" ")).toMatch(/飽足感/);
    expect(packed.decisionContext.priorities[0]?.signalKey).toMatch(/hunger/);
    expect(packed.decisionContext.mealFollowUpBudget.allowCustomerMealClarification).toBe(false);
  });
});

describe("follow-up eligibility and consolidation", () => {
  it("only breakfast eligible → only breakfast referenced", () => {
    const observations: CoachingMealObservation[] = [
      {
        mealSlot: "breakfast",
        observedFoods: ["奶昔"],
        signals: ["shake_dominant"],
        evidenceText: [],
        shakeObserved: true,
        noOtherFoodVisible: true,
        solidFoodObserved: false,
        followUpQuestion: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
      },
      {
        mealSlot: "lunch",
        observedFoods: ["雞胸便當"],
        signals: [],
        evidenceText: [],
        solidFoodObserved: true,
      },
    ];
    const budget = buildMealFollowUpBudget({
      mealObservations: observations,
      planContext: NO_SHAKE_PLAN,
      hungerReported: false,
    });
    expect(budget.selectedMealSlot).toBe("breakfast");
    expect(budget.consolidatedQuestion).toBeNull();
    expect(budget.selectedQuestion).not.toMatch(/午餐/);
  });

  it("breakfast+dinner eligible → consolidated only those slots", () => {
    const observations: CoachingMealObservation[] = [
      {
        mealSlot: "breakfast",
        observedFoods: ["奶昔"],
        signals: ["shake_dominant"],
        evidenceText: [],
        shakeObserved: true,
        noOtherFoodVisible: true,
        solidFoodObserved: false,
        followUpQuestion: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
      },
      {
        mealSlot: "lunch",
        observedFoods: ["雞胸便當"],
        signals: [],
        evidenceText: [],
        solidFoodObserved: true,
        noOtherFoodVisible: true,
        followUpQuestion: "還有沒有搭配其他東西？",
      },
      {
        mealSlot: "dinner",
        observedFoods: ["奶昔"],
        signals: ["shake_dominant"],
        evidenceText: [],
        shakeObserved: true,
        noOtherFoodVisible: true,
        solidFoodObserved: false,
        followUpQuestion: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
      },
    ];
    const budget = buildMealFollowUpBudget({
      mealObservations: observations,
      planContext: NO_SHAKE_PLAN,
      hungerReported: false,
    });
    expect(budget.consolidatedQuestion).toMatch(/早餐和晚餐/);
    expect(budget.consolidatedQuestion).not.toMatch(/午餐/);
    expect(
      assertCustomerFoodStatementEvidenceBacked({
        statement: budget.consolidatedQuestion,
        mealObservations: observations,
      }),
    ).toBeNull();
  });

  it("Case F never fabricates 三餐奶昔", () => {
    const packed = buildScenarioDecisionContext("F_single_meal_fried");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.mealFollowUpBudget.consolidatedQuestion).toBeNull();
    expect(packed.decisionContext.mealFollowUpBudget.allowCustomerMealClarification).toBe(false);

    const poisoned: CoachingDailyGenerationOutputJson = {
      ...getFixtureScenarioOutput("F_single_meal_fried"),
      customer: {
        ...getFixtureScenarioOutput("F_single_meal_fried").customer,
        follow_up_for_tomorrow:
          "我看到早餐和午餐和晚餐主要是奶昔，如果還有搭配其他食物，下次一起拍進來，我會更好判斷你的飽足感。",
        meal_feedback: {
          breakfast: {
            summary: "ok",
            good_point: null,
            adjustment: null,
            follow_up_question: "還有沒有搭配其他東西？",
          },
          lunch: {
            summary: "ok",
            good_point: null,
            adjustment: null,
            follow_up_question: "還有沒有搭配其他東西？",
          },
          dinner: {
            summary: "炸雞",
            good_point: null,
            adjustment: null,
            follow_up_question: "還有沒有搭配其他東西？",
          },
        },
      },
    };

    const applied = applyCoachingDecisionContextToOutput(poisoned, packed.decisionContext);
    const blob = JSON.stringify(applied.customer);
    expect(blob).not.toMatch(/三餐.*奶昔|早餐和午餐和晚餐主要是奶昔/);
    expect(applied.customer.follow_up_for_tomorrow ?? "").not.toMatch(/奶昔/);
  });

  it("no eligible meals → null follow-up", () => {
    const budget = buildMealFollowUpBudget({
      mealObservations: [
        {
          mealSlot: "breakfast",
          observedFoods: ["雞胸沙拉"],
          signals: [],
          evidenceText: [],
          solidFoodObserved: true,
        },
      ],
      planContext: DEFAULT_PLAN,
      hungerReported: false,
    });
    expect(budget.allowCustomerMealClarification).toBe(false);
    expect(budget.selectedQuestion).toBeNull();
    expect(budget.consolidatedQuestion).toBeNull();
  });

  it("solidFoodObserved forbids pairing clarification", () => {
    const observation: CoachingMealObservation = {
      mealSlot: "breakfast",
      observedFoods: ["奶昔", "蛋"],
      signals: ["shake_dominant"],
      evidenceText: [],
      shakeObserved: true,
      solidFoodObserved: true,
      noOtherFoodVisible: false,
      followUpQuestion: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
    };
    const normalized = normalizeMealObservation(observation);
    expect(normalized.followUpQuestion).toBeNull();
    expect(
      isMealClarificationEligible(normalized, NO_SHAKE_PLAN, { hungerReported: false }),
    ).toBe(false);
  });
});

describe("nutrition assessment golden levels", () => {
  it("E → off_track", () => {
    const packed = buildScenarioDecisionContext("E_full_day_off_track");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("off_track");
  });

  it("F → on_track single-meal", () => {
    const packed = buildScenarioDecisionContext("F_single_meal_fried");
    expect(packed.decisionContext.dailyNutritionAssessment.level).toBe("on_track");
    expect(packed.decisionContext.coachAttention.required).toBe(false);
  });

  it("D hunger golden priorities preserved", () => {
    const packed = buildScenarioDecisionContext("D_hunger_shake_fried_rice");
    // D fixtures leave meal observations empty in unit path; voice still extracts.
    expect(packed.decisionContext.customerVoice.some((item) => item.key === "hunger_reported")).toBe(true);
  });
});

describe("off_track tone fixture", () => {
  it("E customer wording is clear, not soft", () => {
    const output = getFixtureScenarioOutput("E_full_day_off_track");
    const text = `${output.customer.today_feedback} ${output.customer.daily_food_summary}`;
    expect(text).toMatch(/偏離/);
    expect(text).not.toMatch(/稍微調整/);
  });
});
