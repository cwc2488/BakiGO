import { describe, expect, it } from "vitest";
import { buildCoachingAiFixtureGenerationInput } from "@/lib/coaching/ai/coaching-ai-fixtures";
import { evaluateCoachingAiOutputQuality } from "@/lib/coaching/ai/coaching-ai-quality-check";
import { getFixtureScenarioOutput } from "@/lib/coaching/ai/fixture-coaching-ai-provider";
import {
  buildCoachingDailyCoachSystemPrompt,
  buildCoachingDailyCoachUserPrompt,
} from "@/lib/coaching/ai/coaching-daily-coach-prompts";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { COACHING_DAILY_GENERATION_OUTPUT_VERSION } from "@/types/coaching-ai";
import type { CoachingDailyGenerationOutputJson } from "@/types/coaching-ai";

function cloneOutput(scenario: "A_normal" | "B_breakfast_deviation" | "C_watch_pattern"): CoachingDailyGenerationOutputJson {
  return structuredClone(getFixtureScenarioOutput(scenario));
}

function statusOf(
  report: ReturnType<typeof evaluateCoachingAiOutputQuality>,
  id: string,
): "pass" | "warn" | "fail" | undefined {
  return [...report.customer, ...report.coach].find((item) => item.id === id)?.status;
}

describe("coaching AI prompt calibration V2-A", () => {
  it("prompt encodes core V2-A principles", () => {
    const systemPrompt = buildCoachingDailyCoachSystemPrompt();
    expect(systemPrompt).toContain("持續 > 完美");
    expect(systemPrompt).toContain("不責備、不羞辱、不製造罪惡感");
    expect(systemPrompt).toContain("鼓勵的是人，不是錯誤行為");
    expect(systemPrompt).toContain("DecisionContext contract");
    expect(systemPrompt).toContain("Plan authority");
    expect(systemPrompt).toContain("不能自行創造固定數字");
    expect(systemPrompt).toContain("系統決定今天要講什麼；AI 決定怎麼講");

    const packed = buildScenarioDecisionContext("A_normal");
    const userPrompt = buildCoachingDailyCoachUserPrompt({
      generationInput: packed.generationInput,
      finalInterventionLevel: packed.finalInterventionLevel,
      preparedMealImages: [],
      decisionContext: packed.decisionContext,
    });
    expect(userPrompt).toContain("鼓勵的是人，不是錯誤行為");
    expect(userPrompt).toContain("adjustment_priorities 最多 2 個，只能改寫 priorities 主題");
  });

  it("A_normal allows 0 priorities and passes quality", () => {
    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("A_normal");
    const output = cloneOutput("A_normal");
    expect(output.customer.adjustment_priorities).toEqual([]);

    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel,
      generationInput,
    });

    expect(statusOf(report, "customer_adjustment_priorities_count")).toBe("pass");
    expect(statusOf(report, "customer_normal_allows_zero_priorities")).toBe("pass");
    expect(report.overall).not.toBe("fail");
  });

  it("rejects more than 2 priorities", () => {
    const output = cloneOutput("A_normal");
    output.customer.adjustment_priorities = ["a", "b", "c"];
    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: "normal",
    });
    expect(statusOf(report, "customer_adjustment_priorities_count")).toBe("fail");
  });

  it("plan authority fails when inventing fixed water target absent from plan", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("A_normal");
    const output = cloneOutput("A_normal");
    output.customer.today_feedback = "整體不錯，但請每天喝到 2000ml。";

    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: "normal",
      generationInput,
    });
    expect(statusOf(report, "customer_plan_authority")).toBe("fail");
  });

  it("plan authority passes when numeric target appears in coach directives", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("A_normal");
    const withDirective = {
      ...generationInput,
      coachDirectives: {
        currentFocus: "水分",
        currentPriority: "補水",
        coachInstruction: "每日水分目標 2000ml",
        effectiveFrom: "2026-08-01",
      },
    };

    const output = cloneOutput("A_normal");
    output.customer.today_feedback = "請依教練指示把水量補到 2000ml。";

    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: "normal",
      generationInput: withDirective,
    });
    expect(statusOf(report, "customer_plan_authority")).toBe("pass");
  });

  it("does not praise bad behavior", () => {
    const output = cloneOutput("C_watch_pattern");
    output.customer.encouragement = "沒吃早餐但喝水是好選擇，繼續保持。";
    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: "watch",
    });
    expect(statusOf(report, "customer_no_praise_bad_behavior")).toBe("fail");
  });

  it("B_breakfast_deviation prioritizes protein and sugary drink, not sauce/lunch sides", () => {
    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("B_breakfast_deviation");
    const good = cloneOutput("B_breakfast_deviation");
    const goodReport = evaluateCoachingAiOutputQuality({
      output: good,
      finalInterventionLevel,
      generationInput,
    });
    expect(statusOf(goodReport, "customer_breakfast_deviation_priority_order")).toBe("pass");
    expect(statusOf(goodReport, "customer_tomorrow_focus_continuity")).toBe("pass");
    expect(good.customer.tomorrow_focus).toMatch(/早餐|奶昔|蛋白質/);

    const bad = cloneOutput("B_breakfast_deviation");
    bad.customer.adjustment_priorities = ["午餐少醬料", "配菜再多一點青菜"];
    bad.customer.tomorrow_focus = "晚餐少火鍋";
    const badReport = evaluateCoachingAiOutputQuality({
      output: bad,
      finalInterventionLevel,
      generationInput,
    });
    expect(statusOf(badReport, "customer_breakfast_deviation_priority_order")).toBe("fail");
    expect(statusOf(badReport, "customer_tomorrow_focus_continuity")).toBe("fail");
  });

  it("tomorrow_focus must continue highest priority", () => {
    const output = cloneOutput("B_breakfast_deviation");
    output.customer.adjustment_priorities = ["早餐蛋白質先到位", "含糖飲料替代"];
    output.customer.tomorrow_focus = "午餐少醬料";
    const report = evaluateCoachingAiOutputQuality({
      output,
      finalInterventionLevel: "normal",
    });
    expect(statusOf(report, "customer_tomorrow_focus_continuity")).toBe("fail");
  });

  it("recurring_issue requires evidence and rolling support", () => {
    const { generationInput } = buildCoachingAiFixtureGenerationInput("B_breakfast_deviation");
    const noEvidence = cloneOutput("B_breakfast_deviation");
    noEvidence.coach.recurring_issue = "早餐不穩";
    noEvidence.coach.evidence = [];
    expect(
      statusOf(
        evaluateCoachingAiOutputQuality({
          output: noEvidence,
          finalInterventionLevel: "normal",
          generationInput,
        }),
        "coach_recurring_requires_evidence",
      ),
    ).toBe("fail");

    const noRolling = cloneOutput("B_breakfast_deviation");
    noRolling.coach.recurring_issue = "早餐不穩";
    noRolling.coach.evidence = ["today breakfast text"];
    expect(
      statusOf(
        evaluateCoachingAiOutputQuality({
          output: noRolling,
          finalInterventionLevel: "normal",
          generationInput,
        }),
        "coach_recurring_requires_evidence",
      ),
    ).toBe("fail");

    const { generationInput: watchInput, finalInterventionLevel } =
      buildCoachingAiFixtureGenerationInput("C_watch_pattern");
    const watch = cloneOutput("C_watch_pattern");
    expect(
      statusOf(
        evaluateCoachingAiOutputQuality({
          output: watch,
          finalInterventionLevel,
          generationInput: watchInput,
        }),
        "coach_recurring_requires_evidence",
      ),
    ).toBe("pass");
  });

  it("improved_issue requires evidence otherwise null", () => {
    const output = cloneOutput("A_normal");
    output.coach.improved_issue = "睡眠變好";
    output.coach.evidence = [];
    expect(
      statusOf(
        evaluateCoachingAiOutputQuality({
          output,
          finalInterventionLevel: "normal",
        }),
        "coach_improved_requires_evidence",
      ),
    ).toBe("fail");
  });

  it("single meal deviation does not alone require coach attention", () => {
    const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput("B_breakfast_deviation");
    const output = cloneOutput("B_breakfast_deviation");
    output.coach.coach_attention_required = true;
    output.coach.attention_reason = "今天早餐偏離";
    expect(
      statusOf(
        evaluateCoachingAiOutputQuality({
          output,
          finalInterventionLevel,
          generationInput,
        }),
        "coach_single_meal_not_attention",
      ),
    ).toBe("fail");
  });

  it("fixture A/B/C golden outputs pass V2-A quality gates", () => {
    for (const scenario of ["A_normal", "B_breakfast_deviation", "C_watch_pattern"] as const) {
      const { generationInput, finalInterventionLevel } = buildCoachingAiFixtureGenerationInput(scenario);
      const output = getFixtureScenarioOutput(scenario);
      expect(output.version).toBe(COACHING_DAILY_GENERATION_OUTPUT_VERSION);
      const report = evaluateCoachingAiOutputQuality({
        output,
        finalInterventionLevel,
        generationInput,
      });
      expect(report.overall, scenario).not.toBe("fail");
      expect(output.customer.adjustment_priorities.length).toBeLessThanOrEqual(2);
    }
  });
});
