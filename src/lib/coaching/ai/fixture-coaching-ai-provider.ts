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
  if (decision.dailyNutritionAssessment.level === "off_track" || decision.dailyNutritionAssessment.level === "needs_adjustment") {
    if (decision.mealObservations.some((item) => item.observedFoods.join("").includes("roti"))) {
      return "E_full_day_off_track";
    }
  }
  if (
    decision.customerVoice.some((item) => item.key === "hunger_reported") &&
    decision.mealObservations.filter((item) => item.shakeObserved).length >= 2 &&
    !decision.mealObservations.some((item) => item.signals.includes("fried_food") || item.signals.includes("starch_concentrated"))
  ) {
    return "G_shake_hunger";
  }
  if (decision.priorities.some((item) => item.signalKey.includes("hunger") || item.signalKey.includes("customer_voice"))) {
    return "D_hunger_shake_fried_rice";
  }
  if (
    decision.mealObservations.filter((item) => item.signals.includes("fried_food")).length === 1 &&
    decision.dailyNutritionAssessment.level === "on_track"
  ) {
    return "F_single_meal_fried";
  }
  if (
    decision.dailyNutritionAssessment.level === "on_track" &&
    decision.priorities.length === 0 &&
    decision.mealObservations.length >= 3
  ) {
    return "H_on_track_day";
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
        daily_nutrition_assessment: null,
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
        daily_nutrition_assessment: null,
      },
    };
  }

  if (scenario === "D_hunger_shake_fried_rice") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "今天還是有完整回報，這很重要；先聽你說還是會很餓。",
        today_feedback: "我看到早晚餐偏奶昔、午餐有炒飯；水分比計畫少一些。先處理飢餓與可執行的下一餐。",
        daily_food_summary:
          "如果以減脂來看，今天午餐炒飯偏澱粉油脂，早晚餐又偏奶昔，整天比較容易餓也比較偏離。明天先挑一餐補蛋白質＋有咀嚼感的食物。",
        meal_feedback: {
          breakfast: {
            summary: "早餐主要回報奶昔。",
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
            summary: "晚餐主要回報奶昔。",
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
        customer_voice_response:
          "你說還是會很餓，我有注意到。從今天回報看起來，有幾餐比較偏液體或澱粉，有可能比較快餓。先不用硬撐。",
        adjustment_priorities: ["回應飢餓", "補水往計畫靠近"],
        tomorrow_focus: "先把容易餓的那餐補穩",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "客戶回報飢餓；早晚餐奶昔；午餐炒飯；水分未達計畫。",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "normal",
        coach_attention_required: false,
        attention_reason: null,
        evidence: ["customer_note:還是會很餓", "lunch:炒飯", "water 3000/5000"],
        follow_ups: [],
        photo_reuse_flags: [],
        daily_nutrition_assessment: null,
      },
    };
  }

  if (scenario === "E_full_day_off_track") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "三餐都有認真回報，這點很好。",
        today_feedback: "如果以減脂來看，今天整體的飲食確實比較偏離目前的方向，但不是某一餐完全不能吃。",
        daily_food_summary:
          "如果以減脂來看，今天三餐的油脂和精製澱粉比較集中。不是某一餐完全不能吃，而是三餐累積起來會讓今天比較偏離減脂方向。明天不用全部重來，先挑一餐改成蛋白質＋蔬菜比較完整的組合。",
        meal_feedback: {
          breakfast: {
            summary: "早餐是炒飯，澱粉與油脂偏集中。",
            good_point: null,
            adjustment: "可改成蛋白質＋蔬菜為主。",
            follow_up_question: null,
          },
          lunch: {
            summary: "午餐 roti 配 curry，澱粉偏多。",
            good_point: null,
            adjustment: "份量收一點，或搭配更多蛋白質。",
            follow_up_question: null,
          },
          dinner: {
            summary: "晚餐有肉骨與炸物。",
            good_point: null,
            adjustment: "炸物先減一次就好。",
            follow_up_question: null,
          },
        },
        lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
        customer_voice_response: null,
        adjustment_priorities: ["挑一餐改成蛋白質＋蔬菜", "減少整天澱粉油脂累積"],
        tomorrow_focus: "挑一餐改成蛋白質＋蔬菜",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "整天多餐偏離減脂方向，需調整但不可羞辱。",
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

  if (scenario === "F_single_meal_fried") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "早午餐都回報得很清楚，這點很好。",
        today_feedback: "整體方向大致可以，晚餐炸物先提醒一下就好，不用因為一餐覺得整天失敗。",
        daily_food_summary:
          "今天早午餐大致穩，只有晚餐偏炸物。整天還不算偏離，明天晚餐改回較清爽的蛋白質＋蔬菜即可。",
        meal_feedback: {
          breakfast: emptyMealFeedback("早餐蛋白質與蔬菜都有。"),
          lunch: emptyMealFeedback("午餐便當大致正常。"),
          dinner: {
            summary: "晚餐是炸雞。",
            good_point: null,
            adjustment: "下次改烤或煎會更接近減脂方向。",
            follow_up_question: null,
          },
        },
        lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
        customer_voice_response: null,
        adjustment_priorities: [],
        tomorrow_focus: "維持目前節奏",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "單餐炸物，不升級關注。",
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

  if (scenario === "G_shake_hunger") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "你願意誠實寫下還是會很餓，這點很重要。",
        today_feedback: "我們先不用硬撐，明天試著把其中一餐補完整，看飽足感有沒有比較好。",
        daily_food_summary:
          "早晚餐主要是奶昔，午餐相對完整。若蛋白質與有咀嚼感的食物偏少，整天比較容易餓；明天先補其中一餐即可。",
        meal_feedback: {
          breakfast: emptyMealFeedback("早餐主要回報奶昔。"),
          lunch: emptyMealFeedback("午餐有雞胸沙拉。"),
          dinner: emptyMealFeedback("晚餐主要回報奶昔。"),
        },
        lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
        customer_voice_response:
          "你說還是會很餓，我有注意到。從今天回報看起來，有幾餐比較偏液體，有可能比較快餓。",
        adjustment_priorities: ["先回應飢餓感受"],
        tomorrow_focus: "先把容易餓的那餐補穩",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "飢餓＋雙奶昔，追問預算最多一次。",
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

  if (scenario === "H_on_track_day") {
    return {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "今天三餐方向清楚，回報也很完整，這樣陪跑會越來越穩。",
        today_feedback: "沒有需要硬找的問題，維持這個節奏就很好。",
        daily_food_summary: "今天三餐整體符合減脂方向，蛋白質與蔬菜都有看到，先維持即可。",
        meal_feedback: {
          breakfast: emptyMealFeedback("早餐奶昔有搭配蛋。"),
          lunch: emptyMealFeedback("午餐雞胸沙拉很穩。"),
          dinner: emptyMealFeedback("晚餐魚＋青菜＋一小碗飯。"),
        },
        lifestyle_feedback: { hydration: null, sleep: null, exercise: null },
        customer_voice_response: null,
        adjustment_priorities: [],
        tomorrow_focus: "維持目前節奏",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "正常減脂日，無需硬找問題。",
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
        daily_nutrition_assessment: null,
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
