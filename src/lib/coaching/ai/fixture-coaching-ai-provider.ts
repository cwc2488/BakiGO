import {
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  type CoachingDailyGenerationOutputJson,
  type CoachingInterventionLevel,
} from "@/types/coaching-ai";
import {
  buildCoachingAiFixtureGenerationInput,
  type CoachingAiFixtureScenario,
} from "@/lib/coaching/ai/coaching-ai-fixtures";
import type { CoachingAiProvider, GenerateDailyCoachInput, GenerateDailyCoachResult } from "@/lib/coaching/ai/coaching-ai-provider";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { COACHING_DAILY_AI_PROMPT_VERSION } from "@/lib/coaching/ai/model-config";
import { parseCoachingDailyGenerationOutput } from "@/lib/coaching/ai/coaching-daily-output-schema";
import type { CoachingDecisionContext } from "@/types/coaching-signals";

function pickScenarioFromDecision(decision: CoachingDecisionContext): CoachingAiFixtureScenario {
  if (decision.priorities.some((item) => item.signalKey.includes("low_protein") || item.signalKey.includes("sugary_drink"))) {
    return "B_breakfast_deviation";
  }
  if (decision.priorities.some((item) => item.signalKey === "late_sleep_pattern")) {
    return "C_watch_pattern";
  }
  return "A_normal";
}

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
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: [],
      },
    };
  }

  if (scenario === "B_breakfast_deviation") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "你有完整回報，這已經很棒；我們一起把明天早餐調回更好執行的版本。",
        today_feedback: "早餐選了蛋餅奶茶，和計畫的奶昔不同；午餐、晚餐相對正常。先處理影響最大的兩點即可。",
        adjustment_priorities: ["早餐蛋白質", "含糖飲料替代"],
        tomorrow_focus: "早餐蛋白質",
      },
      coach: {
        daily_summary: "單餐偏離，整體仍可拉回；不因單次外食/偏離升級關注。",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: [],
      },
    };
  }

  return {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      encouragement: "我看到你仍願意持續回報，這很重要；我們把要求提高一點，但一起用更簡單的方式做到。",
      today_feedback: "最近晚睡模式仍在，早餐也不穩。先把睡眠往前，再做可完成的早餐最低版本。",
      adjustment_priorities: ["晚睡模式", "補上可完成的早餐"],
      tomorrow_focus: "睡眠往前",
    },
    coach: {
      daily_summary: "出現重複晚睡模式，需提高要求但仍保持支持語氣。",
      recurring_issue: "late_sleep_pattern",
      improved_issue: null,
      proposed_intervention_level: finalInterventionLevel === "watch" ? "watch" : "normal",
      coach_attention_required: false,
      attention_reason: null,
      evidence: [],
    },
  };
}

export class FixtureCoachingAiProvider implements CoachingAiProvider {
  async generateDailyCoach(input: GenerateDailyCoachInput): Promise<GenerateDailyCoachResult> {
    const scenario = pickScenarioFromDecision(input.decisionContext);
    const raw = fixtureOutputForScenario(scenario, input.finalInterventionLevel);
    const output = applyCoachingDecisionContextToOutput(raw, input.decisionContext);
    const validation = parseCoachingDailyGenerationOutput(output);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    return {
      output: validation.data,
      model: "fixture_coaching_daily_v2b7",
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
  const packed = buildScenarioDecisionContext(scenario);
  const raw = fixtureOutputForScenario(scenario, packed.finalInterventionLevel);
  return applyCoachingDecisionContextToOutput(raw, packed.decisionContext);
}
