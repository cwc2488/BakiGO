import {
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  type CoachingDailyGenerationOutputJson,
  type CoachingInterventionLevel,
} from "@/types/coaching-ai";
import {
  buildCoachingAiFixtureGenerationInput,
  detectCoachingAiFixtureScenario,
  type CoachingAiFixtureScenario,
} from "@/lib/coaching/ai/coaching-ai-fixtures";
import type { CoachingAiProvider, GenerateDailyCoachInput, GenerateDailyCoachResult } from "@/lib/coaching/ai/coaching-ai-provider";
import { COACHING_DAILY_AI_PROMPT_VERSION } from "@/lib/coaching/ai/model-config";
import { parseCoachingDailyGenerationOutput } from "@/lib/coaching/ai/coaching-daily-output-schema";

function fixtureOutputForScenario(
  scenario: CoachingAiFixtureScenario,
  finalInterventionLevel: CoachingInterventionLevel,
): CoachingDailyGenerationOutputJson {
  if (scenario === "A_normal") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "今天有完整回報，節奏很穩，這就是陪跑最需要的持續力。",
        today_feedback: "三餐、水量和睡眠都在正常範圍，整體表現平衡。",
        adjustment_priorities: [],
        tomorrow_focus: "維持早餐奶昔節奏",
      },
      coach: {
        daily_summary: "回報完整，短期執行穩定。",
        recurring_issue: null,
        improved_issue: "整體參與度穩定",
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: ["3 餐皆有回報", "water 1800ml", "sleep 7h30m"],
      },
    };
  }

  if (scenario === "B_breakfast_deviation") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "你有回報就已经很棒，我們一起把下一餐調回計畫節奏。",
        today_feedback: "早餐選了蛋餅奶茶，和計畫的奶昔不同；午餐、晚餐相對正常。",
        adjustment_priorities: ["早餐改回奶昔或增加蛋白質選項"],
        tomorrow_focus: "早餐先準備好奶昔",
      },
      coach: {
        daily_summary: "單餐偏離，整體仍可拉回。",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: ["breakfast text: 蛋餅 + 奶茶", "lunch/dinner 正常回報"],
      },
    };
  }

  return {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      encouragement: "我看到你仍在堅持回報，這很重要；我們把要求提高一點，但一起用更簡單的方式做到。",
      today_feedback: "最近幾天晚睡和早餐不穩的模式仍在，今天睡眠也偏晚。",
      adjustment_priorities: ["先把早餐固定成可完成的最低版本", "睡眠往前 30 分鐘"],
      tomorrow_focus: "23:30 前躺床",
    },
    coach: {
      daily_summary: "出現重複的早餐/睡眠模式，需提高關注但仍保持支持語氣。",
      recurring_issue: "早餐不穩 + 晚睡",
      improved_issue: null,
      proposed_intervention_level: finalInterventionLevel === "watch" ? "watch" : "normal",
      coach_attention_required: finalInterventionLevel !== "normal",
      attention_reason: finalInterventionLevel !== "normal" ? "recent late sleep + breakfast misses" : null,
      evidence: ["rolling late sleep days", "recent breakfast misses"],
    },
  };
}

export class FixtureCoachingAiProvider implements CoachingAiProvider {
  async generateDailyCoach(input: GenerateDailyCoachInput): Promise<GenerateDailyCoachResult> {
    const scenario = detectCoachingAiFixtureScenario(input.generationInput);
    const output = fixtureOutputForScenario(scenario, input.finalInterventionLevel);
    const validation = parseCoachingDailyGenerationOutput(output);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    return {
      output: validation.data,
      model: "fixture_coaching_daily_v1",
      promptVersion: COACHING_DAILY_AI_PROMPT_VERSION,
      rawJson: JSON.stringify(output),
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        imageCount: input.preparedMealImages.length,
      },
      latencyMs: 1,
    };
  }
}

export function getFixtureScenarioOutput(scenario: CoachingAiFixtureScenario): CoachingDailyGenerationOutputJson {
  const { finalInterventionLevel } = buildCoachingAiFixtureGenerationInput(scenario);
  return fixtureOutputForScenario(scenario, finalInterventionLevel);
}
