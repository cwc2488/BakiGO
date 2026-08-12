import { describe, expect, it } from "vitest";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION, type CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";

function baseCustomer(): CoachingDailyGenerationOutputJson["customer"] {
  return {
    encouragement: "很好",
    today_feedback: "不錯",
    daily_food_summary: "今天有餐點回報。",
    meal_feedback: { breakfast: null, lunch: null, dinner: null },
    lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
    customer_voice_response: null,
    adjustment_priorities: [],
    tomorrow_focus: "維持節奏",
    follow_up_for_tomorrow: null,
  };
}

function baseCoach(): CoachingDailyGenerationOutputJson["coach"] {
  return {
    daily_summary: "summary",
    recurring_issue: null,
    improved_issue: null,
    proposed_intervention_level: "normal",
    coach_attention_required: false,
    attention_reason: null,
    evidence: [],
    follow_ups: [],
    photo_reuse_flags: [],
  };
}

describe("applyCoachingDecisionContextToOutput", () => {
  it("forces empty priorities and no invented coach fields for A", () => {
    const packed = buildScenarioDecisionContext("A_normal");
    const drifted: CoachingDailyGenerationOutputJson = {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        ...baseCustomer(),
        adjustment_priorities: ["自己亂加的改善"],
        tomorrow_focus: "每天喝 2000ml",
      },
      coach: {
        ...baseCoach(),
        recurring_issue: "fake",
        improved_issue: "fake",
        proposed_intervention_level: "coach_attention",
        coach_attention_required: true,
        attention_reason: "hotpot",
        evidence: ["invented"],
      },
    };

    const output = applyCoachingDecisionContextToOutput(drifted, packed.decisionContext);
    expect(output.customer.adjustment_priorities).toEqual([]);
    expect(output.coach.recurring_issue).toBeNull();
    expect(output.coach.improved_issue).toBeNull();
    expect(output.coach.coach_attention_required).toBe(false);
    expect(output.coach.attention_reason).toBeNull();
    expect(output.coach.proposed_intervention_level).toBe("normal");
    expect(output.coach.evidence.every((item) => !item.includes("invented"))).toBe(true);
  });

  it("keeps B subjects for protein and sugary drink", () => {
    const packed = buildScenarioDecisionContext("B_breakfast_deviation");
    const output = applyCoachingDecisionContextToOutput(
      {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          ...baseCustomer(),
          encouragement: "有回報很棒",
          today_feedback: "早餐偏離",
          adjustment_priorities: ["午餐少醬料", "配菜"],
          tomorrow_focus: "午餐清淡",
        },
        coach: baseCoach(),
      },
      packed.decisionContext,
    );

    expect(output.customer.adjustment_priorities[0]).toContain("蛋白質");
    expect(output.customer.adjustment_priorities[1]).toMatch(/含糖|飲料/);
    expect(output.customer.tomorrow_focus).toContain("蛋白質");
  });

  it("locks C recurring and attention from decision context", () => {
    const packed = buildScenarioDecisionContext("C_watch_pattern");
    const output = getFixtureScenarioOutput("C_watch_pattern");
    expect(output.coach.recurring_issue).toBe("late_sleep_pattern");
    expect(output.coach.coach_attention_required).toBe(false);
    expect(output.customer.adjustment_priorities[0]).toMatch(/晚睡|睡眠/);
    expect(packed.decisionContext.finalInterventionLevel).toBe("watch");
  });
});
