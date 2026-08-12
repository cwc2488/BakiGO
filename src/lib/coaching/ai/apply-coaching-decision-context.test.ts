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
        daily_nutrition_assessment: null,
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

  it("baseline_only strips invented body-change claims and keeps outcome evidence", () => {
    const packed = buildScenarioDecisionContext("I_baseline_only_fat_loss");
    const output = applyCoachingDecisionContextToOutput(
      {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          ...baseCustomer(),
          today_feedback: "最近體脂下降了，繼續加油",
          encouragement: "身體正在改善",
        },
        coach: {
          ...baseCoach(),
          daily_summary: "所以你的體脂會上升",
        },
      },
      packed.decisionContext,
    );

    expect(output.customer.today_feedback).not.toMatch(/體脂下降|身體正在改善/);
    expect(output.customer.today_feedback).toMatch(/回測|目標/);
    expect(output.coach.evidence.some((item) => item.includes("measurement_stage=baseline_only"))).toBe(true);
    expect(output.coach.evidence.some((item) => item.includes("outcome_status=not_yet_measurable"))).toBe(true);
  });

  it("J injects improving body outcome into today_feedback when GPT omits it", () => {
    const packed = buildScenarioDecisionContext("J_second_measurement_improving");
    expect(packed.decisionContext.outcomeAssessment.outcomeStatus).toBe("improving");

    const output = applyCoachingDecisionContextToOutput(
      {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          ...baseCustomer(),
          today_feedback: "昨天的飲食選擇讓我們朝著健身目標前進，繼續加油！",
        },
        coach: baseCoach(),
      },
      packed.decisionContext,
    );

    expect(output.customer.today_feedback).toMatch(/體重|體脂/);
    expect(output.customer.today_feedback).toMatch(/下降/);
    expect(output.customer.today_feedback).toMatch(/肌肉/);
    expect(output.customer.today_feedback).toContain("朝著健身目標前進");
  });

  it("K injects mixed muscle-loss caution when GPT omits it", () => {
    const packed = buildScenarioDecisionContext("K_weight_down_muscle_loss");
    expect(packed.decisionContext.outcomeAssessment.outcomeStatus).toBe("mixed");

    const output = applyCoachingDecisionContextToOutput(
      {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          ...baseCustomer(),
          today_feedback: "氣氛整體來看，符合減脂方向。",
        },
        coach: baseCoach(),
      },
      packed.decisionContext,
    );

    expect(output.customer.today_feedback).toMatch(/肌肉/);
    expect(output.customer.today_feedback).toMatch(/不能只看成減脂成功|減脂成功/);
    expect(output.customer.today_feedback).toContain("符合減脂方向");
  });

  it("L injects recomposition wording when GPT omits it", () => {
    const packed = buildScenarioDecisionContext("L_recomposition");
    expect(packed.decisionContext.outcomeAssessment.outcomeStatus).toBe("improving");

    const output = applyCoachingDecisionContextToOutput(
      {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          ...baseCustomer(),
          today_feedback: "從昨天的飲食來看，整體方向都是朝著減脂目標前進的。",
        },
        coach: baseCoach(),
      },
      packed.decisionContext,
    );

    expect(output.customer.today_feedback).toMatch(/重組|體脂/);
    expect(output.customer.today_feedback).toMatch(/肌肉/);
  });

  it("N injects flat outcome without blame wording", () => {
    const packed = buildScenarioDecisionContext("N_two_periods_flat");
    expect(packed.decisionContext.outcomeAssessment.outcomeStatus).toBe("flat");

    const output = applyCoachingDecisionContextToOutput(
      {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          ...baseCustomer(),
          today_feedback: "今日飲食上，三餐都做到了完整回報。",
        },
        coach: baseCoach(),
      },
      packed.decisionContext,
    );

    expect(output.customer.today_feedback).toMatch(/變化不大|先觀察|回測/);
    expect(output.customer.today_feedback).not.toMatch(/失敗|很差|責備/);
  });

  it("D hunger path does not invent body outcome wording", () => {
    const packed = buildScenarioDecisionContext("D_hunger_shake_fried_rice");
    const output = applyCoachingDecisionContextToOutput(
      {
        version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
        customer: {
          ...baseCustomer(),
          today_feedback: "如果以減脂來看，今天的飲食組合確實需要調整。",
          customer_voice_response: "我有注意到你提到還是會覺得餓。",
        },
        coach: baseCoach(),
      },
      packed.decisionContext,
    );

    expect(output.customer.today_feedback).not.toMatch(/體脂下降|肌肉流失|身體重組/);
    expect(output.customer.customer_voice_response).toMatch(/餓/);
  });
});
