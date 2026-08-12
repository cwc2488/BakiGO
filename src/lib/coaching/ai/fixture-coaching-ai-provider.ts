import {
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  type CoachingDailyGenerationOutputJson,
  type CoachingInterventionLevel,
} from "@/types/coaching-ai";
import type { CoachingAiFixtureScenario } from "@/lib/coaching/ai/coaching-ai-fixtures";
import type { CoachingAiProvider, GenerateDailyCoachInput, GenerateDailyCoachResult } from "@/lib/coaching/ai/coaching-ai-provider";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { buildScenarioDecisionContext } from "@/lib/coaching/ai/build-scenario-decision-context";
import { COACHING_DAILY_AI_PROMPT_VERSION } from "@/lib/coaching/ai/model-config";
import { parseCoachingDailyGenerationOutput } from "@/lib/coaching/ai/coaching-daily-output-schema";
import type { CoachingDecisionContext } from "@/types/coaching-signals";

function pickScenarioFromDecision(decision: CoachingDecisionContext): CoachingAiFixtureScenario {
  if (decision.priorities.some((item) => item.signalKey.includes("hunger") || item.signalKey.includes("customer_voice"))) {
    return "D_hunger_shake_fried_rice";
  }
  if (decision.priorities.some((item) => item.signalKey.includes("low_protein") || item.signalKey.includes("sugary_drink"))) {
    return "B_breakfast_deviation";
  }
  if (decision.priorities.some((item) => item.signalKey === "late_sleep_pattern")) {
    return "C_watch_pattern";
  }
  return "A_normal";
}

function emptyMealFeedback(summary: string) {
  return {
    summary,
    good_point: null as string | null,
    adjustment: null as string | null,
    follow_up_question: null as string | null,
  };
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
        daily_food_summary: "今天三餐都有回報，內容看起來大致穩定。",
        meal_feedback: {
          breakfast: emptyMealFeedback("早餐有回報。"),
          lunch: emptyMealFeedback("午餐有回報。"),
          dinner: emptyMealFeedback("晚餐有回報。"),
        },
        lifestyle_feedback: {
          hydration: null,
          sleep: null,
          exercise: null,
        },
        customer_voice_response: null,
        adjustment_priorities: [],
        tomorrow_focus: "維持早餐奶昔節奏",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "回報完整，短期執行穩定。",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: [],
        follow_ups: [],
        photo_reuse_flags: [],
      },
    };
  }

  if (scenario === "B_breakfast_deviation") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "你有完整回報，這已經很棒；我們一起把明天早餐調回更好執行的版本。",
        today_feedback: "早餐選了蛋餅奶茶，和計畫的奶昔不同；午餐、晚餐相對正常。先處理影響最大的兩點即可。",
        daily_food_summary: "早餐偏離成蛋餅＋奶茶，午餐晚餐大致正常。",
        meal_feedback: {
          breakfast: {
            summary: "早餐是蛋餅配奶茶。",
            good_point: null,
            adjustment: "明天改回較有蛋白質的版本。",
            follow_up_question: null,
          },
          lunch: emptyMealFeedback("午餐大致正常。"),
          dinner: emptyMealFeedback("晚餐大致正常。"),
        },
        lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
        customer_voice_response: null,
        adjustment_priorities: ["早餐蛋白質", "含糖飲料替代"],
        tomorrow_focus: "早餐蛋白質",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "單餐偏離，整體仍可拉回；不因單次外食/偏離升級關注。",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: [],
        follow_ups: [],
        photo_reuse_flags: [],
      },
    };
  }

  if (scenario === "D_hunger_shake_fried_rice") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "今天還是有完整回報，這很重要；先聽你說還是會很餓。",
        today_feedback: "我看到早晚餐偏奶昔、午餐有炒飯；水分比計畫少一些。先處理飢餓與可執行的下一餐。",
        daily_food_summary: "早晚餐看起來偏奶昔，午餐是炒飯；蛋白質／青菜是否有搭配還需要確認。",
        meal_feedback: {
          breakfast: {
            summary: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
            good_point: "有照計畫回報奶昔。",
            adjustment: null,
            follow_up_question: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
          },
          lunch: {
            summary: "午餐看起來是炒飯。",
            good_point: null,
            adjustment: "下次可搭配一點蛋白質或青菜會更穩。",
            follow_up_question: null,
          },
          dinner: {
            summary: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
            good_point: null,
            adjustment: null,
            follow_up_question: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
          },
        },
        lifestyle_feedback: {
          hydration: "水分有回報，但還沒到計畫目標。",
          sleep: "睡眠時數足夠，但入睡時間偏晚。",
          exercise: "有運動回報，很棒。",
        },
        customer_voice_response: "你說還是會很餓，我會先幫你看哪一餐比較容易餓，再一起調可執行的版本。",
        adjustment_priorities: ["回應飢餓", "補水往計畫靠近"],
        tomorrow_focus: "先把容易餓的那餐補穩",
        follow_up_for_tomorrow: "明天早／晚餐除了奶昔，還有吃其他東西嗎？會不會還是很餓？",
      },
      coach: {
        daily_summary: "客戶回報飢餓；早晚餐奶昔需追問是否有其他食物；午餐炒飯；水分未達計畫。",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: ["customer_note:還是會很餓", "lunch:炒飯", "water 3000/5000"],
        follow_ups: [
          {
            subject: "meal_sufficiency",
            question: "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？",
            status: "pending",
          },
        ],
        photo_reuse_flags: [],
      },
    };
  }

  return {
    version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
    customer: {
      encouragement: "我看到你仍願意持續回報，這很重要；我們把要求提高一點，但一起用更簡單的方式做到。",
      today_feedback: "最近晚睡模式仍在，早餐也不穩。先把睡眠往前，再做可完成的早餐最低版本。",
      daily_food_summary: "早餐偏不穩，其他餐點需要再補完整回報。",
      meal_feedback: {
        breakfast: {
          summary: "早餐偏不完整。",
          good_point: null,
          adjustment: "先做可完成的最低版本。",
          follow_up_question: null,
        },
        lunch: emptyMealFeedback("午餐有回報。"),
        dinner: emptyMealFeedback("晚餐有回報。"),
      },
      lifestyle_feedback: {
        hydration: null,
        sleep: "睡眠時間偏晚，但我們先把躺床時間往前一點。",
        exercise: null,
      },
      customer_voice_response: null,
      adjustment_priorities: ["晚睡模式", "補上可完成的早餐"],
      tomorrow_focus: "睡眠往前",
      follow_up_for_tomorrow: "明天還會不會那麼晚睡？",
    },
    coach: {
      daily_summary: "出現重複晚睡模式，需提高要求但仍保持支持語氣。",
      recurring_issue: "late_sleep_pattern",
      improved_issue: null,
      proposed_intervention_level: finalInterventionLevel === "watch" ? "watch" : "normal",
      coach_attention_required: false,
      attention_reason: null,
      evidence: [],
      follow_ups: [{ subject: "sleep", question: "明天還會不會那麼晚睡？", status: "pending" }],
      photo_reuse_flags: [],
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
      model: "fixture-coaching-ai",
      promptVersion: COACHING_DAILY_AI_PROMPT_VERSION,
      rawJson: JSON.stringify(raw),
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
  return applyCoachingDecisionContextToOutput(
    fixtureOutputForScenario(scenario, packed.decisionContext.finalInterventionLevel),
    packed.decisionContext,
  );
}
