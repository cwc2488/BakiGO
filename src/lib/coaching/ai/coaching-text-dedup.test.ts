import { describe, expect, it } from "vitest";
import { applyCoachingOutputQualityGuard } from "@/lib/coaching/ai/apply-coaching-output-quality-guard";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { evaluateCoachingAiOutputQuality } from "@/lib/coaching/ai/coaching-ai-quality-check";
import {
  buildCoachingDailyCoachSystemPrompt,
  buildCoachingDailyCoachUserPrompt,
} from "@/lib/coaching/ai/coaching-daily-coach-prompts";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import {
  dedupeCoachingProse,
  findRepeatedSentences,
  isCopiedConsumerText,
} from "@/lib/coaching/ai/coaching-text-dedup";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION, type CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";

function sampleOutput(overrides?: {
  todayFeedback?: string;
  dailySummary?: string;
  dailyFoodSummary?: string;
}): CoachingDailyGenerationOutputJson {
  return {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      encouragement: "你有認真回報，這點很好。",
      today_feedback: overrides?.todayFeedback ?? "今天整體有回報。",
      daily_food_summary: overrides?.dailyFoodSummary ?? "今天飲食大致可觀察。",
      customer_voice_response: null,
      adjustment_priorities: [],
      tomorrow_focus: "明天先維持穩定回報。",
      follow_up_for_tomorrow: null,
      lifestyle_feedback: { sleep: "睡眠時數尚可。", hydration: null, exercise: null },
      meal_feedback: { breakfast: null, lunch: null, dinner: null },
    },
    coach: {
      daily_summary: overrides?.dailySummary ?? "回報完整，短期執行穩定。",
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
}

function extractPromptJson(userPrompt: string): Record<string, unknown> {
  const start = userPrompt.indexOf("\n{");
  expect(start).toBeGreaterThan(-1);
  return JSON.parse(userPrompt.slice(start + 1)) as Record<string, unknown>;
}

describe("COACH-DEDUP coaching generation quality", () => {
  it("COACH-DEDUP-01 exact duplicate sentence removed", () => {
    const input = "今天先把水分顧好。今天先把水分顧好。";
    expect(findRepeatedSentences(input).some((item) => item.kind === "exact")).toBe(true);
    expect(dedupeCoachingProse(input)).toBe("今天先把水分顧好。");
  });

  it("COACH-DEDUP-02 normalized duplicate removed", () => {
    const input = "今天先把水分顧好。今天先把水分顧好！";
    expect(findRepeatedSentences(input).some((item) => item.kind === "normalized")).toBe(true);
    expect(dedupeCoachingProse(input)).toBe("今天先把水分顧好。");
  });

  it("COACH-DEDUP-03 adjacent semantic duplicate handled safely", () => {
    const input = "今天身體訊號比較忙碌一點，先注意水分與休息。今天身體訊號比較忙碌，先注意水分和休息。";
    const cleaned = dedupeCoachingProse(input);
    expect(findRepeatedSentences(cleaned)).toHaveLength(0);
    expect(cleaned.includes("今天身體訊號比較忙碌")).toBe(true);
    expect(cleaned.match(/先注意水分/g)?.length).toBe(1);
  });

  it("COACH-DEDUP-04 distinct recommendations preserved", () => {
    const input = "今天先把水分與休息顧好。飲食先找比較有飽足感的選擇。";
    expect(dedupeCoachingProse(input)).toBe(input);
    expect(findRepeatedSentences(input)).toHaveLength(0);
  });

  it("COACH-DEDUP-05 consumer analysis does not internally repeat", () => {
    const duplicated = sampleOutput({
      todayFeedback: "今天先把水分與休息顧好。今天先把水分與休息顧好。",
    });
    const cleaned = applyCoachingOutputQualityGuard(duplicated);
    expect(findRepeatedSentences(cleaned.customer.today_feedback)).toHaveLength(0);
    const report = evaluateCoachingAiOutputQuality({
      output: cleaned,
      finalInterventionLevel: "normal",
    });
    expect(report.customer.find((item) => item.id === "customer_no_internal_repeat")?.status).toBe("pass");
  });

  it("COACH-DEDUP-06 coach summary does not internally repeat", () => {
    const duplicated = sampleOutput({
      dailySummary: "近期排便偏多。近期排便偏多。",
    });
    const cleaned = applyCoachingOutputQualityGuard(duplicated);
    expect(findRepeatedSentences(cleaned.coach.daily_summary)).toHaveLength(0);
    const report = evaluateCoachingAiOutputQuality({
      output: cleaned,
      finalInterventionLevel: "normal",
    });
    expect(report.coach.find((item) => item.id === "coach_no_internal_repeat")?.status).toBe("pass");
  });

  it("COACH-DEDUP-07 coach summary is not copied consumer text", () => {
    const copied = sampleOutput({
      todayFeedback: "今天先把水分與休息顧好，飲食先找比較有飽足感的選擇。",
      dailySummary: "今天先把水分與休息顧好，飲食先找比較有飽足感的選擇。",
    });
    expect(
      isCopiedConsumerText(copied.coach.daily_summary, [copied.customer.today_feedback]),
    ).toBe(true);
    const cleaned = applyCoachingOutputQualityGuard(copied);
    expect(
      isCopiedConsumerText(cleaned.coach.daily_summary, [cleaned.customer.today_feedback]),
    ).toBe(false);
    expect(cleaned.coach.daily_summary).not.toBe(cleaned.customer.today_feedback);
    expect(cleaned.coach.daily_summary).toContain("追蹤");
  });

  it("COACH-DEDUP-08 duplicated source context is not sent twice", () => {
    const packed = buildScenarioDecisionContext("B_breakfast_deviation");
    const userPrompt = buildCoachingDailyCoachUserPrompt({
      generationInput: packed.generationInput,
      finalInterventionLevel: packed.finalInterventionLevel,
      preparedMealImages: [],
      decisionContext: packed.decisionContext,
    });
    const payload = extractPromptJson(userPrompt);
    const todayFacts = payload.todayFacts as { primaryMeals: Array<Record<string, unknown>> };
    expect(todayFacts.primaryMeals.every((meal) => !("textNote" in meal))).toBe(true);
    const prior = payload.priorAiContext as Record<string, unknown> | null;
    if (prior) {
      expect(prior).not.toHaveProperty("pendingFollowUps");
    }
    expect(payload).not.toHaveProperty("interventionLevel");

    const note = packed.generationInput.recentCoachActionMemory?.materialActions[0]?.note;
    if (note) {
      const occurrences = userPrompt.split(note).length - 1;
      expect(occurrences).toBeLessThanOrEqual(1);
    }

    const systemPrompt = buildCoachingDailyCoachSystemPrompt();
    expect(systemPrompt).toContain("Anti-repetition");
    expect(systemPrompt).toContain("OBSERVATION");
    expect(systemPrompt).toContain("WHAT CHANGED");
    expect(systemPrompt).toContain("禁止把 customer.today_feedback");
  });

  it("composition prepend does not leave a repeated bowel sentence", () => {
    const packed = buildScenarioDecisionContext("A_normal");
    const bowelCopy = "今天身體訊號比較忙碌一點，先注意水分與休息；如果有不舒服可以跟教練說。";
    const output = applyCoachingDecisionContextToOutput(
      sampleOutput({ todayFeedback: `${bowelCopy}午餐先找比較有飽足感的選擇。` }),
      {
        ...packed.decisionContext,
        bowelSignal: {
          level: "elevated_today",
          todayCount: 5,
          customerCopy: bowelCopy,
          coachCopy: "今天排便次數較多，建議關心顧客目前身體感受。",
          suggestProfessionalCare: false,
        },
      },
    );
    expect(findRepeatedSentences(output.customer.today_feedback)).toHaveLength(0);
    expect((output.customer.today_feedback.match(/身體訊號比較忙碌/g) ?? []).length).toBe(1);
  });

  it("before/after real example: consumer vs coach stay distinct after guard", () => {
    const before = sampleOutput({
      todayFeedback:
        "今天先把水分與休息顧好，飲食先找比較有飽足感的選擇。今天先把水分與休息顧好，飲食先找比較有飽足感的選擇。",
      dailySummary: "今天先把水分與休息顧好，飲食先找比較有飽足感的選擇。",
    });
    const after = applyCoachingOutputQualityGuard(before);
    expect(after.customer.today_feedback).toBe("今天先把水分與休息顧好，飲食先找比較有飽足感的選擇。");
    expect(after.coach.daily_summary).not.toBe(after.customer.today_feedback);
    expect(after.coach.daily_summary).toBe("今日回報已記錄；下次依系統重點追蹤即可。");
  });

  it("fixture outputs remain internally clean after the generation path", () => {
    const output = getFixtureScenarioOutput("A_normal");
    expect(findRepeatedSentences(output.customer.today_feedback)).toHaveLength(0);
    expect(findRepeatedSentences(output.coach.daily_summary)).toHaveLength(0);
    expect(isCopiedConsumerText(output.coach.daily_summary, [output.customer.today_feedback])).toBe(
      false,
    );
  });
});
