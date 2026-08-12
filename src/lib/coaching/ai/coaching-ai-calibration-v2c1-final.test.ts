import { describe, expect, it } from "vitest";
import { buildCoachingAiFixtureGenerationInput } from "@/lib/coaching/ai/coaching-ai-fixtures";
import { evaluateCoachingAiOutputQuality } from "@/lib/coaching/ai/coaching-ai-quality-check";
import {
  buildCoachingDailyCoachSystemPrompt,
  buildCoachingDailyCoachUserPrompt,
} from "@/lib/coaching/ai/coaching-daily-coach-prompts";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import { COACHING_DAILY_AI_PROMPT_VERSION } from "@/lib/coaching/ai/model-config";
import type { CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";

function statusOf(
  report: ReturnType<typeof evaluateCoachingAiOutputQuality>,
  id: string,
): "pass" | "warn" | "fail" | undefined {
  return [...report.customer, ...report.coach].find((item) => item.id === id)?.status;
}

function cloneD(): CoachingDailyGenerationOutputJson {
  return structuredClone(getFixtureScenarioOutput("D_hunger_shake_fried_rice"));
}

describe("coaching AI V2c1 final calibration", () => {
  it("prompt version is v2c1f and encodes the two final rules", () => {
    expect(COACHING_DAILY_AI_PROMPT_VERSION).toBe("coaching_daily_v2d");

    const systemPrompt = buildCoachingDailyCoachSystemPrompt();
    expect(systemPrompt).toContain("照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？");
    expect(systemPrompt).toContain("似乎沒有搭配其他食物");
    expect(systemPrompt).toContain("noOtherFoodVisible=true");
    expect(systemPrompt).toContain("睡眠時數足夠，但入睡時間偏晚");
    expect(systemPrompt).toContain("duration");
    expect(systemPrompt).toContain("bedtime");
    expect(systemPrompt).toContain("reportDayRelation");

    const packed = buildScenarioDecisionContext("D_hunger_shake_fried_rice");
    const userPrompt = buildCoachingDailyCoachUserPrompt({
      generationInput: packed.generationInput,
      finalInterventionLevel: packed.finalInterventionLevel,
      preparedMealImages: [],
      decisionContext: packed.decisionContext,
    });
    expect(userPrompt).toContain("禁止「似乎沒有搭配其他食物」");
    expect(userPrompt).toContain("必須同時評估時數與入睡時間");
  });

  it("regression: forbids「似乎沒有搭配其他食物」certainty wording", () => {
    const { generationInput, finalInterventionLevel } =
      buildCoachingAiFixtureGenerationInput("D_hunger_shake_fried_rice");
    const output = cloneD();
    output.customer.meal_feedback.breakfast = {
      summary: "早餐主要是奶昔，似乎沒有搭配其他食物。",
      good_point: null,
      adjustment: null,
      follow_up_question: "除了奶昔還有吃別的嗎？",
    };

    const failReport = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel,
      generationInput,
    });
    expect(statusOf(failReport, "customer_shake_uncertainty_wording")).toBe("fail");

    output.customer.meal_feedback.breakfast = {
      summary: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
      good_point: null,
      adjustment: null,
      follow_up_question: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
    };
    const passReport = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel,
      generationInput,
    });
    expect(statusOf(passReport, "customer_shake_uncertainty_wording")).toBe("pass");
  });

  it("regression: sleep must cover adequate duration + late bedtime for Golden D", () => {
    const { generationInput, finalInterventionLevel } =
      buildCoachingAiFixtureGenerationInput("D_hunger_shake_fried_rice");
    expect(generationInput.todayContext.sleepBedtime).toBe("00:24");
    expect(generationInput.todayContext.sleepWakeTime).toBe("08:24");
    expect(generationInput.todayContext.sleepDurationMinutes).toBe(8 * 60);

    const output = cloneD();
    output.customer.lifestyle_feedback.sleep = "今晚睡眠還算充足，保持這樣的作息。";
    const failReport = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel,
      generationInput,
    });
    expect(statusOf(failReport, "customer_sleep_duration_and_bedtime")).toBe("fail");

    output.customer.lifestyle_feedback.sleep = "睡眠時數足夠，但入睡時間偏晚。";
    const passReport = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel,
      generationInput,
    });
    expect(statusOf(passReport, "customer_sleep_duration_and_bedtime")).toBe("pass");
  });
});
