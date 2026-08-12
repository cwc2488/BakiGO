import { describe, expect, it } from "vitest";
import { buildCoachingAiFixtureGenerationInput } from "@/lib/coaching/ai/coaching-ai-fixtures";
import { buildCoachingDecisionContext } from "@/lib/coaching/ai/coaching-signal-engine";
import {
  OpenAiCoachingAiProvider,
  parseDailyCoachProviderJson,
} from "@/lib/coaching/ai/coaching-ai-provider";
import { evaluateCoachingAiOutputQuality } from "@/lib/coaching/ai/coaching-ai-quality-check";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { observeCoachingMeals } from "@/lib/coaching/ai/observe-coaching-meals";
import { loadPreparedCoachingEvalMealImages } from "@/lib/coaching/ai/coaching-eval-fixture-images";
import { buildRecentCoachActionMemory } from "@/lib/coaching/coach-actions/build-recent-coach-action-memory";
import { inferCoachActionMaterial, type CoachingCoachActionRecord } from "@/types/coaching-coach-actions";

const LIVE = Boolean(process.env.OPENAI_API_KEY?.trim()) && process.env.COACHING_AI_EVAL_LIVE === "1";

function actionRecord(note: string): CoachingCoachActionRecord {
  return {
    id: "ai-ca-action",
    enrollmentId: "fixture-enroll",
    customerId: "fixture-cust",
    ownerMemberId: "fixture-member",
    actionType: "acknowledged",
    status: "acknowledged",
    note,
    relatedReasonCodes: ["recurring_late_sleep"],
    evidenceRefs: [],
    relatedLogDate: "2026-08-11",
    relatedMeasurementId: null,
    isMaterial: inferCoachActionMaterial({ actionType: "acknowledged", note }),
    supersededBy: null,
    createdAt: "2026-08-11T10:00:00.000+08:00",
    resolvedAt: null,
    updatedAt: "2026-08-11T10:00:00.000+08:00",
  };
}

describe("Phase 3d controlled AI eval (AI-CA1～AI-CA4)", () => {
  it("AI-CA quality checks pass offline for acknowledgement-aware wording", () => {
    const fixture = buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const withMemory = {
      ...fixture.generationInput,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord("最近因工作加班晚睡，本週先觀察。"),
      ]),
    };

    const report = evaluateCoachingAiOutputQuality({
      output: {
        version: 1,
        customer: {
          encouragement: "你有認真回報。",
          today_feedback: "已知近期加班影響睡眠，這週先持續觀察作息。",
          daily_food_summary: "今天飲食大致可觀察。",
          customer_voice_response: null,
          adjustment_priorities: [],
          tomorrow_focus: "延續觀察加班期間的睡眠狀況。",
          follow_up_for_tomorrow: null,
          lifestyle_feedback: { sleep: "睡眠時數尚可，入睡偏晚。", hydration: null, exercise: null },
          meal_feedback: {
            breakfast: { summary: "早餐有回報", good_point: null, adjustment: null, follow_up_question: null },
            lunch: { summary: "午餐有回報", good_point: null, adjustment: null, follow_up_question: null },
            dinner: { summary: "晚餐有回報", good_point: null, adjustment: null, follow_up_question: null },
          },
        },
        coach: {
          daily_summary: "晚睡持續，但教練已確認加班 context，改追蹤是否改善。",
          recurring_issue: "晚睡",
          improved_issue: null,
          proposed_intervention_level: "watch",
          coach_attention_required: false,
          attention_reason: null,
          evidence: ["recurring_late_sleep", "coach_action_overtime"],
          follow_ups: [],
          photo_reuse_flags: [],
          daily_nutrition_assessment: null,
        },
      },
      finalInterventionLevel: "watch",
      generationInput: withMemory,
    });

    const checks = [...report.customer, ...report.coach];
    expect(checks.find((item) => item.id === "coach_action_memory_no_redundant_ask")?.status).toBe("pass");
    expect(checks.find((item) => item.id === "coach_action_not_outcome_authority")?.status).toBe("pass");
  });

  it.skipIf(!LIVE)("AI-CA1 — without coach action, may ask late-sleep reason", async () => {
    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const fixture = buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const generationInput = { ...fixture.generationInput, recentCoachActionMemory: null };
    const preparedMealImages = await loadPreparedCoachingEvalMealImages("C_watch_pattern");
    const observed = await observeCoachingMeals({ apiKey, generationInput, preparedMealImages });
    const decisionContext = buildCoachingDecisionContext({
      generationInput,
      mealObservations: observed.observations,
      customerVoice: extractCustomerVoiceSignals(generationInput.todayContext.customerNote),
      finalInterventionLevelOverride: fixture.finalInterventionLevel,
    });
    const provider = new OpenAiCoachingAiProvider(apiKey);
    const result = await provider.generateDailyCoach({
      generationInput,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      decisionContext,
      preparedMealImages,
    });
    const output = parseDailyCoachProviderJson(result.rawJson);
    const blob = `${output.coach.daily_summary} ${output.coach.attention_reason ?? ""} ${output.customer.tomorrow_focus}`;
    // Soft live expectation: without memory, clarification about late sleep is allowed.
    expect(blob.length).toBeGreaterThan(0);
  }, 120_000);

  it.skipIf(!LIVE)("AI-CA2 — with overtime coach action, must not re-ask why late sleep", async () => {
    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const fixture = buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const generationInput = {
      ...fixture.generationInput,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord("最近因工作加班晚睡，本週先觀察。"),
      ]),
    };
    const preparedMealImages = await loadPreparedCoachingEvalMealImages("C_watch_pattern");
    const observed = await observeCoachingMeals({ apiKey, generationInput, preparedMealImages });
    const decisionContext = buildCoachingDecisionContext({
      generationInput,
      mealObservations: observed.observations,
      customerVoice: extractCustomerVoiceSignals(generationInput.todayContext.customerNote),
      finalInterventionLevelOverride: fixture.finalInterventionLevel,
    });
    const provider = new OpenAiCoachingAiProvider(apiKey);
    const result = await provider.generateDailyCoach({
      generationInput,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      decisionContext,
      preparedMealImages,
    });
    const output = parseDailyCoachProviderJson(result.rawJson);
    const quality = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      generationInput,
      mealObservations: decisionContext.mealObservations,
    });
    expect([...quality.customer, ...quality.coach].find((item) => item.id === "coach_action_memory_no_redundant_ask")?.status).toBe(
      "pass",
    );
  }, 120_000);

  it.skipIf(!LIVE)("AI-CA3 — handled but pattern persists: acknowledgement-aware follow-up allowed", async () => {
    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const fixture = buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const generationInput = {
      ...fixture.generationInput,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord("已詢問，Customer 最近因工作加班晚睡。"),
      ]),
    };
    const preparedMealImages = await loadPreparedCoachingEvalMealImages("C_watch_pattern");
    const observed = await observeCoachingMeals({ apiKey, generationInput, preparedMealImages });
    const decisionContext = buildCoachingDecisionContext({
      generationInput,
      mealObservations: observed.observations,
      customerVoice: extractCustomerVoiceSignals(generationInput.todayContext.customerNote),
      finalInterventionLevelOverride: "watch",
    });
    const provider = new OpenAiCoachingAiProvider(apiKey);
    const result = await provider.generateDailyCoach({
      generationInput,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      decisionContext,
      preparedMealImages,
    });
    const output = parseDailyCoachProviderJson(result.rawJson);
    const blob = `${output.coach.daily_summary} ${output.customer.today_feedback} ${output.customer.tomorrow_focus}`;
    // Must not ignore the sleep issue entirely.
    expect(/睡|作息|加班/.test(blob)).toBe(true);
    const quality = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      generationInput,
      mealObservations: decisionContext.mealObservations,
    });
    expect([...quality.customer, ...quality.coach].find((item) => item.id === "coach_action_memory_no_redundant_ask")?.status).toBe(
      "pass",
    );
  }, 120_000);

  it.skipIf(!LIVE)("AI-CA4 — coach opinion cannot rewrite deterministic outcome", async () => {
    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const fixture = buildCoachingAiFixtureGenerationInput("K_weight_down_muscle_loss");
    const generationInput = {
      ...fixture.generationInput,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord("我覺得他最近很好，身體結果看起來很棒。"),
      ]),
    };
    const preparedMealImages = await loadPreparedCoachingEvalMealImages("K_weight_down_muscle_loss");
    const observed = await observeCoachingMeals({ apiKey, generationInput, preparedMealImages });
    const decisionContext = buildCoachingDecisionContext({
      generationInput,
      mealObservations: observed.observations,
      customerVoice: extractCustomerVoiceSignals(generationInput.todayContext.customerNote),
      finalInterventionLevelOverride: fixture.finalInterventionLevel,
    });

    // Authority stays on deterministic assessment regardless of coach note.
    expect(decisionContext.outcomeAssessment.outcomeStatus).not.toBe("improving");

    const provider = new OpenAiCoachingAiProvider(apiKey);
    const result = await provider.generateDailyCoach({
      generationInput,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      decisionContext,
      preparedMealImages,
    });
    const output = parseDailyCoachProviderJson(result.rawJson);
    const quality = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      generationInput,
      mealObservations: decisionContext.mealObservations,
    });
    expect([...quality.customer, ...quality.coach].find((item) => item.id === "coach_action_not_outcome_authority")?.status).toBe(
      "pass",
    );
  }, 120_000);
});
