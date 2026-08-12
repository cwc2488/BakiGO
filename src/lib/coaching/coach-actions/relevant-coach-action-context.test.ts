import { describe, expect, it } from "vitest";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { buildRecentCoachActionMemory } from "@/lib/coaching/coach-actions/build-recent-coach-action-memory";
import {
  buildRelevantCoachActionContext,
  extractDistinctiveCoachContextFragments,
  relevantCoachActionContextAsOfIso,
} from "@/lib/coaching/coach-actions/build-relevant-coach-action-context";
import type { CoachingCoachActionRecord } from "@/types/coaching-coach-actions";
import { evaluateCoachingAiOutputQuality } from "@/lib/coaching/ai/coaching-ai-quality-check";
import {
  applyCoachingDecisionContextToOutput,
  ensureRelevantCoachActionContextWording,
} from "@/lib/coaching/ai/apply-coaching-decision-context";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION, type CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";

function actionRecord(overrides: Partial<CoachingCoachActionRecord> & { note: string }): CoachingCoachActionRecord {
  return {
    id: overrides.id ?? `action-${overrides.note.slice(0, 4)}`,
    enrollmentId: "enroll-1",
    customerId: "cust-1",
    ownerMemberId: "owner-1",
    actionType: overrides.actionType ?? "acknowledged",
    status: overrides.status ?? "acknowledged",
    note: overrides.note,
    relatedReasonCodes: overrides.relatedReasonCodes ?? ["recurring_late_sleep"],
    evidenceRefs: [],
    relatedLogDate: overrides.relatedLogDate ?? "2026-08-11",
    relatedMeasurementId: null,
    isMaterial: overrides.isMaterial ?? true,
    supersededBy: null,
    createdAt: overrides.createdAt ?? "2026-08-11T10:00:00.000+08:00",
    resolvedAt: overrides.resolvedAt ?? null,
    updatedAt: overrides.updatedAt ?? "2026-08-11T10:00:00.000+08:00",
  };
}

function sampleOutput(text: string): CoachingDailyGenerationOutputJson {
  return {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      encouragement: "你有認真回報，這點很好。",
      today_feedback: text,
      daily_food_summary: "今天飲食大致可觀察。",
      customer_voice_response: null,
      adjustment_priorities: ["晚睡模式"],
      tomorrow_focus: "睡眠往前",
      follow_up_for_tomorrow: null,
      lifestyle_feedback: { sleep: text, hydration: null, exercise: null },
      meal_feedback: {
        breakfast: { summary: "早餐有回報", good_point: null, adjustment: null, follow_up_question: null },
        lunch: { summary: "午餐有回報", good_point: null, adjustment: null, follow_up_question: null },
        dinner: { summary: "晚餐有回報", good_point: null, adjustment: null, follow_up_question: null },
      },
    },
    coach: {
      daily_summary: text,
      recurring_issue: "late_sleep_pattern",
      improved_issue: null,
      proposed_intervention_level: "watch",
      coach_attention_required: false,
      attention_reason: null,
      evidence: ["late_sleep_pattern"],
      follow_ups: [],
      photo_reuse_flags: [],
      daily_nutrition_assessment: null,
    },
  };
}

describe("RelevantCoachActionContext", () => {
  it("CM-A — relevant late-sleep memory selects overtime context", () => {
    const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
    const memory = buildRecentCoachActionMemory([
      actionRecord({ note: "最近因工作加班晚睡。" }),
    ]);
    const relevant = buildRelevantCoachActionContext({
      memory,
      decisionContext,
      asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
    });

    expect(relevant.activeIssueKeys).toEqual(expect.arrayContaining(["recurring_late_sleep", "late_sleep_pattern"]));
    expect(relevant.knownContexts).toHaveLength(1);
    expect(relevant.knownContexts[0]!.note).toContain("加班");
    expect(extractDistinctiveCoachContextFragments(relevant.knownContexts[0]!.note)).toEqual(
      expect.arrayContaining(["加班"]),
    );
  });

  it("CM-B — irrelevant hydration memory is not selected for sleep coaching", () => {
    const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
    const memory = buildRecentCoachActionMemory([
      actionRecord({
        note: "已換大水壺，這週先觀察水分。",
        relatedReasonCodes: ["recurring_low_hydration"],
      }),
    ]);
    const relevant = buildRelevantCoachActionContext({
      memory,
      decisionContext,
      asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
    });

    expect(relevant.knownContexts).toHaveLength(0);
  });

  it("CM-C — multiple memories prioritize active-reason match", () => {
    const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
    const memory = buildRecentCoachActionMemory([
      actionRecord({
        id: "sleep",
        note: "最近因工作加班晚睡。",
        relatedReasonCodes: ["recurring_late_sleep"],
        createdAt: "2026-08-11T09:00:00.000+08:00",
      }),
      actionRecord({
        id: "water",
        note: "已換大水壺。",
        relatedReasonCodes: ["recurring_low_hydration"],
        createdAt: "2026-08-11T11:00:00.000+08:00",
      }),
      actionRecord({
        id: "meal",
        note: "週末聚餐，先觀察隔天執行。",
        relatedReasonCodes: ["recurring_meal_execution"],
        createdAt: "2026-08-11T12:00:00.000+08:00",
      }),
    ]);
    const relevant = buildRelevantCoachActionContext({
      memory,
      decisionContext,
      asOfIso: relevantCoachActionContextAsOfIso(generationInput.logDate),
    });

    expect(relevant.knownContexts.map((item) => item.id)).toEqual(["sleep"]);
    expect(relevant.knownContexts[0]!.note).toContain("加班");
  });

  it("CM-D — resolved or stale context is not forced to carry forward", () => {
    const { decisionContext, generationInput } = buildScenarioDecisionContext("C_watch_pattern");
    const asOfIso = relevantCoachActionContextAsOfIso(generationInput.logDate);
    const memory = buildRecentCoachActionMemory([
      actionRecord({
        id: "resolved",
        note: "最近因工作加班晚睡。",
        status: "resolved",
        resolvedAt: "2026-08-10T12:00:00.000+08:00",
      }),
      actionRecord({
        id: "stale",
        note: "出差期間晚睡。",
        createdAt: "2026-08-01T10:00:00.000+08:00",
      }),
    ]);
    const relevant = buildRelevantCoachActionContext({
      memory,
      decisionContext,
      asOfIso,
    });

    expect(relevant.knownContexts).toHaveLength(0);
  });

  it("CM-E — optimistic coach context does not override deterministic outcome authority", () => {
    const packed = buildScenarioDecisionContext("K_weight_down_muscle_loss");
    const generationInput = {
      ...packed.generationInput,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord({
          note: "我覺得他最近很好，身體結果看起來很棒。",
          relatedReasonCodes: ["outcome_worsening"],
        }),
      ]),
    };
    const decisionContext = packed.decisionContext;
    expect(decisionContext.outcomeAssessment.outcomeStatus).toBe("mixed");

    const output = sampleOutput("體重有下降，但肌肉流失較明顯，不能只看成減脂成功。繼續穩定執行。");
    const quality = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      generationInput,
      decisionContext,
      mealObservations: decisionContext.mealObservations,
    });

    expect(
      [...quality.customer, ...quality.coach].find((item) => item.id === "coach_action_not_outcome_authority")
        ?.status,
    ).toBe("pass");
    expect(decisionContext.outcomeAssessment.outcomeStatus).not.toBe("improving");
  });

  it("quality — relevant context carry-forward fails when wording forgets known fragments", () => {
    const { decisionContext, generationInput: base } = buildScenarioDecisionContext("C_watch_pattern");
    const generationInput = {
      ...base,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord({ note: "最近因工作加班晚睡。" }),
      ]),
    };
    const quality = evaluateCoachingAiOutputQuality({
      output: sampleOutput("最近比較晚睡，可以了解看看是什麼原因。"),
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      generationInput,
      decisionContext,
      mealObservations: decisionContext.mealObservations,
    });
    expect(
      [...quality.coach].find((item) => item.id === "coach_action_relevant_context_carry_forward")?.status,
    ).toBe("fail");
  });

  it("quality — relevant context carry-forward passes when situational fragments are used", () => {
    const { decisionContext, generationInput: base } = buildScenarioDecisionContext("C_watch_pattern");
    const generationInput = {
      ...base,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord({ note: "最近因工作加班晚睡。" }),
      ]),
    };
    const quality = evaluateCoachingAiOutputQuality({
      output: sampleOutput("最近加班影響睡眠，這幾天先觀察加班期間能不能把入睡時間稍微提前。"),
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      generationInput,
      decisionContext,
      mealObservations: decisionContext.mealObservations,
    });
    expect(
      [...quality.coach].find((item) => item.id === "coach_action_relevant_context_carry_forward")?.status,
    ).toBe("pass");
    expect(
      [...quality.coach].find((item) => item.id === "coach_action_memory_no_redundant_ask")?.status,
    ).toBe("pass");
  });

  it("apply layer carries relevant known context when GPT omits it", () => {
    const { decisionContext, generationInput: base } = buildScenarioDecisionContext("C_watch_pattern");
    const generationInput = {
      ...base,
      recentCoachActionMemory: buildRecentCoachActionMemory([
        actionRecord({ note: "最近因工作加班晚睡。" }),
      ]),
    };
    const forgotten = sampleOutput("最近比較晚睡，飲食整體還可以。");
    const applied = applyCoachingDecisionContextToOutput(forgotten, decisionContext, {
      generationInput,
    });
    expect(applied.coach.daily_summary).toContain("加班");
    expect(applied.customer.today_feedback).toContain("加班");
    const quality = evaluateCoachingAiOutputQuality({
      output: applied,
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      generationInput,
      decisionContext,
      mealObservations: decisionContext.mealObservations,
    });
    expect(
      [...quality.coach].find((item) => item.id === "coach_action_relevant_context_carry_forward")?.status,
    ).toBe("pass");
  });
});
