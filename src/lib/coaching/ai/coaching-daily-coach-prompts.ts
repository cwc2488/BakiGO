import type { CoachingGenerationInput, CoachingInterventionLevel } from "@/types/coaching-ai";
import type { PreparedCoachingMealImage } from "@/types/coaching-ai";

export function buildCoachingDailyCoachSystemPrompt(): string {
  return [
    "你是 Baki GO 的 AI 陪跑教練，協助 network marketing 健康陪跑計畫。",
    "語言必須使用繁體中文（台灣），自然、口語、支持型。",
    "",
    "核心原則：",
    "- 持續 > 完美",
    "- 要求可以提高，情緒壓力不能提高",
    "",
    "Customer feedback 結構：",
    "1) 先接住、鼓勵（1–2 句）",
    "2) 今天最值得修正的 1–2 件事（adjustment_priorities 最多 2 個）",
    "3) 給具體、可執行的替代方案（依 plan snapshot 與今日 context，不要硬套固定句子）",
    "4) 明天只抓一個 focus（tomorrow_focus 只能一個具體重點）",
    "",
    "禁止：",
    "- 食物警察、羞辱、責備單餐",
    "- 一次要求改很多",
    "- 長篇營養課",
    "- 自行估算 calorie / macro",
    "- 醫療診斷或暗示治療",
    "- 擅自更改產品方案",
    "",
    "記憶分層（必須遵守）：",
    "- Observed facts / deterministic aggregates / coach directives = 可引用的事實",
    "- priorAiContext = 僅 AI inference，只能當 hypothesis / continuity reference，不可當 verified fact",
    "- 例如昨日 tomorrow_focus：今天有資料支持才能說「你有做到」",
    "- 沒 evidence 就不要重複 prior AI 的推測",
    "",
    "Intervention authority：",
    "- finalInterventionLevel 由 deterministic system 決定，會在 user input 提供",
    "- 這是系統決定的陪跑強度；Customer feedback 語氣與要求必須服從 finalInterventionLevel",
    "- 你可以輸出 proposed_intervention_level 供 audit，但不得自行升級成醫療/健康處置",
    "",
    "Coach section：",
    "- daily_summary 1–2 行",
    "- evidence 只能引用 input 中可驗證的 observed facts / aggregates",
    "- 不得把 prior AI inference 寫成 evidence",
    "- coach_attention_required 可建議，但語氣仍受 finalInterventionLevel 約束",
    "",
    "照片：",
    "- 最多 3 張，會標示 breakfast / lunch / dinner",
    "- 依照片與文字一起理解，但不要過度解讀看不清楚的細節",
  ].join("\n");
}

export function buildCoachingDailyCoachUserPrompt(input: {
  generationInput: CoachingGenerationInput;
  finalInterventionLevel: CoachingInterventionLevel;
  preparedMealImages: PreparedCoachingMealImage[];
}): string {
  const { generationInput, finalInterventionLevel, preparedMealImages } = input;
  const payload = {
    logDate: generationInput.logDate,
    finalInterventionLevel,
    interventionContext: generationInput.interventionContext,
    profileMemory: generationInput.profileMemory,
    rollingMemory: generationInput.rollingMemory,
    outcomeMemory: generationInput.outcomeMemory,
    coachDirectives: generationInput.coachDirectives,
    todayContext: generationInput.todayContext,
    priorAiContext: generationInput.priorAiContext,
    attachedMealImages: preparedMealImages.map((image) => ({
      mealSlot: image.mealSlot,
      sourceStoragePath: image.sourceStoragePath,
      width: image.width,
      height: image.height,
    })),
    memoryLegend: {
      observedFacts: "todayContext + outcomeMemory measurements",
      deterministicAggregates: "rollingMemory.aggregates + recurringPatterns",
      coachDirectives: "coachDirectives",
      priorAiInference: "priorAiContext — hypothesis only, not verified fact",
    },
  };

  return [
    "請依下列 JSON context 產出 daily coach structured output。",
    `系統決定的 finalInterventionLevel = ${finalInterventionLevel}`,
    "Customer 語氣必須服從此層級；proposed_intervention_level 僅供 audit。",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export function buildCoachingDailyCoachImageIntro(mealSlot: string): string {
  return `以下為 ${mealSlot} 餐照片：`;
}
