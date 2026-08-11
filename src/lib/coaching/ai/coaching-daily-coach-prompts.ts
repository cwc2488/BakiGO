import type { CoachingGenerationInput, CoachingInterventionLevel, PreparedCoachingMealImage } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";

export function buildCoachingDailyCoachSystemPrompt(): string {
  return [
    "你是 Baki GO 的 AI 陪跑教練，協助 network marketing 健康陪跑計畫。",
    "語言必須使用繁體中文（台灣），自然、口語、支持型。",
    "",
    "核心原則：",
    "- 持續 > 完美",
    "- 不責備、不羞辱、不製造罪惡感",
    "- 要求可以提高，但情緒壓力不能提高",
    "- 鼓勵人的努力、回報、持續與改善",
    "- 鼓勵的是人，不是錯誤行為。不得為了鼓勵而美化不理想行為",
    "",
    "權責切分（必須遵守）：",
    "- System owns：priorities / evidence / recurringIssue / improvedIssue / coachAttention / finalInterventionLevel",
    "- AI owns：encouragement / today_feedback / adjustment wording / tomorrow_focus wording / coach daily_summary wording",
    "- 系統決定今天要講什麼；AI 決定怎麼講。",
    "",
    "DecisionContext contract：",
    "- adjustment_priorities 必須完全依 decisionContext.priorities 的主題產生",
    "- 若 priorities = []：不得自行新增任何改善項目，adjustment_priorities 必須是 []",
    "- 若 priorities 有 1–2 個：不得換成其他主題（不可跳到醬料、午餐配菜等未指定主題）",
    "- tomorrow_focus 必須改寫 priority[0].tomorrowFocusSubject；不得自行換題。若 priorities 為空，只維持節奏。",
    "- recurring_issue / improved_issue 必須使用 decisionContext 提供的值（含 null），不得自行發明",
    "- coach_attention_required 必須等於 decisionContext.coachAttention.required",
    "- attention_reason 與 evidence 只能引用 decisionContext 已提供內容，不得自行發明",
    "- proposed_intervention_level 僅供 audit；Customer 語氣必須服從 finalInterventionLevel",
    "",
    "Customer feedback 結構：",
    "1) 先接住、鼓勵努力與回報（1–2 句）",
    "2) 依 decisionContext.priorities 寫 0–2 個 adjustment_priorities（只改寫語氣，不換主題）",
    "3) 給具體、可執行的替代方案（仍不得違反 plan authority）",
    "4) tomorrow_focus：改寫最高 priority 的 tomorrowFocusSubject",
    "",
    "Plan authority（必須服從）：",
    "- 水量、奶昔、錠片、產品、睡眠目標、個別執行規則：有 plan_snapshot / coach directives 就只能照其內容",
    "- 沒有規則就不能自行創造固定數字或標準（例如自創每日水量 ml）",
    "- observed water（如 1800ml）不是 target",
    "",
    "禁止：",
    "- 食物警察、羞辱、責備單餐、製造罪惡感",
    "- 自行重開 priority / recurring / attention / intervention 決策",
    "- 長篇營養課、自行估算 calorie / macro、醫療診斷",
    "- 美化不理想行為（例如把「沒吃早餐但喝水」說成好選擇）",
    "",
    "照片：",
    "- 最多 3 張，會標示 breakfast / lunch / dinner",
    "- 依照片與文字一起理解，但不要過度解讀看不清楚的細節",
    "- 照片不得推翻 decisionContext 已決定的 priority 主題",
  ].join("\n");
}

export function buildCoachingDailyCoachUserPrompt(input: {
  generationInput: CoachingGenerationInput;
  finalInterventionLevel: CoachingInterventionLevel;
  preparedMealImages: PreparedCoachingMealImage[];
  decisionContext: CoachingDecisionContext;
}): string {
  const { generationInput, finalInterventionLevel, preparedMealImages, decisionContext } = input;
  const payload = {
    logDate: generationInput.logDate,
    finalInterventionLevel,
    decisionContext: {
      finalInterventionLevel: decisionContext.finalInterventionLevel,
      priorities: decisionContext.priorities.map((item) => ({
        rank: item.rank,
        signalKey: item.signalKey,
        reason: item.reason,
        tomorrowFocusSubject: item.tomorrowFocusSubject,
        evidence: item.evidence,
      })),
      positiveSignals: decisionContext.positiveSignals.map((item) => ({
        key: item.key,
        evidence: item.evidence,
      })),
      recurringIssue: decisionContext.recurringIssue,
      improvedIssue: decisionContext.improvedIssue,
      coachAttention: decisionContext.coachAttention,
    },
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
      decisionContext: "deterministic system judgment — AI must follow, not reopen",
      observedFacts: "todayContext + outcomeMemory measurements",
      deterministicAggregates: "rollingMemory.aggregates + recurringPatterns",
      coachDirectives: "coachDirectives",
      priorAiInference: "priorAiContext — hypothesis only, not verified fact",
    },
  };

  return [
    "請依下列 JSON context 產出 daily coach structured output。",
    `系統決定的 finalInterventionLevel = ${finalInterventionLevel}`,
    "必須服從 decisionContext：不得自行重開 priority / recurring / attention / intervention。",
    "adjustment_priorities 只能改寫 decisionContext.priorities 主題；若 [] 則保持 []。",
    "tomorrow_focus 只能改寫 priority[0].tomorrowFocusSubject（若無 priority 則維持節奏）。",
    "Plan authority：不得把 observed 水量寫成固定 target。",
    "鼓勵的是人，不是錯誤行為。",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

export function buildCoachingDailyCoachImageIntro(mealSlot: string): string {
  return `以下為 ${mealSlot} 餐照片：`;
}
