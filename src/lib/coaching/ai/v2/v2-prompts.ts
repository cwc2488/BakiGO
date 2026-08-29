import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import { lifecycleStageGuidance } from "@/lib/coaching/ai/v2/lifecycle";
import { coachingDaySpeechLabel, relativeCoachingDayKey } from "@/lib/coaching/coaching-time";
import { GO21_SHORT_RESPONSE_POLICY } from "@/lib/go21/conversation-quality";

/**
 * V2 system prompt — structured context + freedom.
 * Deliberately does NOT require praise / meal analysis / advice / follow-up every turn.
 */
export function buildCoachingAiV2SystemPrompt(): string {
  return [
    "你是 Baki Go 21 的專業 AI 飲食／營養陪跑教練（21 天）。你是 AI，不要假裝是人類；但仍要像一個記得對方、願意聊天的真人營養教練。",
    "語言：繁體中文（台灣）。自然、有溫度、直接但不責備。口語一點沒關係；不要企業話術、不要諮商腔、不要說教。",
    "",
    "對話節奏（核心）：",
    `- ${GO21_SHORT_RESPONSE_POLICY.principles[0]}`,
    `- ${GO21_SHORT_RESPONSE_POLICY.principles[1]}（${GO21_SHORT_RESPONSE_POLICY.defaultCharHint}）`,
    `- ${GO21_SHORT_RESPONSE_POLICY.principles[2]}`,
    `- ${GO21_SHORT_RESPONSE_POLICY.principles[3]}`,
    `- ${GO21_SHORT_RESPONSE_POLICY.principles[4]}`,
    `- ${GO21_SHORT_RESPONSE_POLICY.principles[5]}`,
    `- ${GO21_SHORT_RESPONSE_POLICY.principles[6]}`,
    "- 長文只在：顧客明確要求詳細說明、安全需要、複雜決策、或 Day 7/14/21 反思時。",
    "- 可以沒有問題。允許：一句確認、一個觀察、一個小建議、短鼓勵，或乾脆只回一句。",
    "",
    "聲音：簡潔、觀察入微、溫暖、針對「剛剛發生的事」、偶爾自然俏皮；不要過度興奮、不要每則都給完整營養課。",
    "避免套話反覆出現：例如「這樣我們就可以…」「這會有助於你的減脂目標…」「接下來的幾天…」「有任何問題隨時告訴我…」「你覺得怎麼樣？」",
    "",
    "角色邊界（用上下文判斷，不要做關鍵字警察）：",
    "- 你是專業 21 天飲食教練，不是通用 ChatGPT、感情諮商、股市顧問、工程師或旅遊規劃。",
    "- 飲食、蛋白質、份量、喝水、飢餓、嘴饞、體重／體組成、與營養相關的運動／睡眠／壓力飲食 → 專業但可短回。",
    "- 生活事件若實質影響進食 → 可同理並調整飲食策略，但不要變成長篇感情諮商。",
    "- 純離題 → 簡短自然帶回飲食陪跑；不要長篇通用回答、不要寫入無關 durable memory。",
    "- 不要每餐都算巨量營養素；不要把食物簡單標成好／壞；不要把體脂機當醫療級儀器；不要鼓吹極端節食。",
    "- 短期體重波動不要貼上失敗標籤。",
    "",
    "21 天目標（靜默錨點）：",
    "- 你會收到顧客的 21 天目標（方向＋本人原話＋可選數字目標）。用來判斷今天什麼最有用。",
    "- 不要每則都重述「你的目標是…／為了你的減脂目標」。顧客要「感覺」你記得，不是聽你背誦。",
    "- 禁止捏造相對目標的進展；沒有證據就不要假裝有進步。",
    "- 禁止把模糊「我想瘦」製造成精確目標體重。",
    "- 若目標看起來不安全，不要當成優化標的。",
    "",
    "影像與記憶：",
    "- 照片只是證據的一種，不是自動觸發營養報告的開關。",
    "- 影像觀察是觀察／不確定性，不是已確認事實；顧客更正優先，之後請用更正後的說法。",
    "- recentTurns / recentVisionObservations 裡若有上一張照片觀察（例如紅茶），顧客問「我剛剛拍了什麼」時要能直接回答，不要裝忘。",
    "- 禁止捏造影像沒看到的食物；禁止對一般照片宣稱精確 kcal。",
    "- 有影像觀察時，用它來自然對話（觀察／確認還有沒有其他食物），不要輸出固定分析模板或未確認前的減脂說教。",
    "",
    "情緒與停跑：",
    "- 若顧客說很沒信心、想結束陪跑：短回、同理、弄清楚原因；不要激勵長文、不要愧疚、不要硬挽留。",
    "- 若明確要停止：尊重，必要時一句確認即可。",
    "",
    "最高原則：STRUCTURED INTERNALLY. FREE EXTERNALLY.",
    "- 對顧客說話時，不要被模板綁住。不要每則都「肯定 → 分析 → 建議 → 鼓勵」。",
    "- 你可以只回一句、只問問題、只觀察、調侃一下、挑戰、鼓勵、說明，或幾乎不給建議。",
    "",
    "核心價值：",
    "- 持續 > 完美",
    "- 不責備、不羞辱、不製造罪惡感",
    "- 要求可以提高，情緒壓力不能提高",
    "- 只在有證據時引用過去；沒有把握就不要假裝記得",
    "- 近期顧客明確發言優先於舊的推斷記憶",
    "",
    "決策：先判斷這輪最有用的 coaching intention，再自然回應。",
    "intention 可為：observe / acknowledge / investigate / encourage / educate / challenge / reinforce / test_hypothesis / follow_up / detect_risk / escalate / casual / reflect",
    "不要對顧客暴露 chain-of-thought 或 intention 標籤。",
    "",
    "生命週期：階段只是引導，不是腳本。可依上下文偏離。",
    "",
    "記憶規則：",
    "- recentTurns：近期對話，保持連貫",
    "- durableMemory：值得長期記住的事",
    "- openLoops：未完成線程 — 若今天輸入對得上，要自然接續",
    "- hypotheses：暫定解釋，可因矛盾證據削弱／修正／放棄",
    "- 只在「記住會改善未來教練決策」時寫入新 memory",
    "",
    "安全硬邊界（不得違反）：",
    "- 不診斷疾病、不取代醫療、不開藥",
    "- 不建議危險限制飲食、不鼓勵飲食疾患行為",
    "- 不捏造顧客歷史、測量、承諾或情緒狀態",
    "- 醫療／高風險／明確求助真人 → safetyTriggered 或 escalationSuggested",
    "- 安全回覆可以比一般對話稍長；安全優先於簡短。",
    "",
    "輸出：",
    "- coach_message：給顧客看的唯一主要訊息（自然散文）",
    "- meta：內部用，顧客看不到",
    "- 不要為了填欄位而硬寫讚美／建議／追問",
  ].join("\n");
}

export function buildCoachingAiV2UserPrompt(input: {
  generationInput: CoachingGenerationInput;
  decisionContext: CoachingDecisionContext;
  memory: CoachingAiV2MemoryBundle;
  channel: "daily_log" | "free_message" | "day21";
  freeMessage?: string | null;
  go21Goal?: {
    primaryDirection: string;
    primaryDirectionLabel: string;
    personalGoal: string;
    targetWeightKg: number | null;
    originalPersonalGoal: string | null;
    wasRefined: boolean;
    guidance: string;
  } | null;
  recentVisionObservations?: Array<{
    summary: string;
    correction: string | null;
  }> | null;
}): string {
  const { generationInput, decisionContext, memory, channel } = input;
  const reportDayRelation = relativeCoachingDayKey(generationInput.logDate) ?? "historical";
  const reportDaySpeechLabel = coachingDaySpeechLabel(generationInput.logDate);
  const today = generationInput.todayContext;
  const stage = memory.lifecycle.stage;

  const compactToday = {
    logDate: generationInput.logDate,
    reportDayRelation,
    reportDaySpeechLabel,
    submitted: today.submitted,
    meals: today.primaryMeals.map((m) => ({
      slot: m.mealSlot,
      note: truncate(m.textNote, 120),
      hasPhoto: Boolean(m.storagePath),
    })),
    secondaryNotes: today.secondaryMealNotes
      .filter((m) => m.textNote?.trim())
      .map((m) => ({ slot: m.mealSlot, note: truncate(m.textNote, 80) })),
    waterMl: today.waterMl,
    sleep: {
      bedtime: today.sleepBedtime,
      wake: today.sleepWakeTime,
      duration: today.sleepDurationLabel,
    },
    exerciseNote: truncate(today.exerciseNote, 120),
    bowelMovementCount: today.bowelMovementCount,
    customerNote: truncate(today.customerNote, 400),
  };

  const compactDecision = {
    finalInterventionLevel: decisionContext.finalInterventionLevel,
    dailyNutritionLevel: decisionContext.dailyNutritionAssessment.level,
    priorities: decisionContext.priorities.slice(0, 2).map((p) => ({
      reason: p.reason,
      tomorrowFocusSubject: p.tomorrowFocusSubject,
    })),
    mealObservations: decisionContext.mealObservations.map((o) => ({
      slot: o.mealSlot,
      foods: o.observedFoods.slice(0, 6),
      signals: o.signals.slice(0, 4),
      shakeObserved: o.shakeObserved,
      solidFoodObserved: o.solidFoodObserved,
      confidence: o.confidence,
    })),
    customerVoice: decisionContext.customerVoice.map((v) => ({
      key: v.key,
      excerpt: truncate(v.rawExcerpt, 80),
    })),
    recurringIssue: decisionContext.recurringIssue?.label ?? null,
    improvedIssue: decisionContext.improvedIssue?.label ?? null,
    goalLabel: decisionContext.goalContext.goalLabel,
    measurementStage: decisionContext.goalContext.measurementStage,
    outcomeStatus: decisionContext.outcomeAssessment.outcomeStatus,
    outcomeSummary: truncate(decisionContext.outcomeAssessment.customerSummary, 160),
  };

  const payload = {
    channel,
    freeMessage: input.freeMessage ? truncate(input.freeMessage, 1600) : null,
    lifecycle: {
      dayNumber: memory.lifecycle.dayNumber,
      stage,
      intensiveActive: memory.lifecycle.intensiveActive,
      daysRemaining: memory.lifecycle.daysRemaining,
      guidance: lifecycleStageGuidance(stage),
    },
    profile: {
      displayName: generationInput.profileMemory.displayName,
      goal: generationInput.profileMemory.goal,
      daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
    },
    go21Goal: input.go21Goal ?? null,
    recentVisionObservations: (input.recentVisionObservations ?? []).slice(0, 3),
    today: compactToday,
    decisionContext: compactDecision,
    rollingPatterns: generationInput.rollingMemory.recurringPatterns.slice(0, 6),
    recentTurns: memory.recentTurns.map((t) => ({
      role: t.role,
      channel: t.channel,
      logDate: t.logDate,
      content: truncate(t.content, 280),
      intention: t.intention,
    })),
    durableMemory: memory.durableMemory.map((m) => ({
      id: m.id,
      category: m.category,
      content: m.content,
      confidence: m.confidence,
    })),
    openLoops: memory.openLoops.map((l) => ({
      id: l.id,
      subject: l.subject,
      detail: l.detail,
      status: l.status,
      dueLogDate: l.dueLogDate,
    })),
    hypotheses: memory.hypotheses.map((h) => ({
      id: h.id,
      statement: h.statement,
      confidence: h.confidence,
      status: h.status,
      supporting: h.supportingEvidence.slice(0, 3),
      contradicting: h.contradictingEvidence.slice(0, 3),
    })),
    instructions: [
      "寫出這一輪最有用的自然回應到 coach_message。SHORT FIRST。",
      "若 openLoops 與今天輸入相關，自然接續；不要假裝記得沒有證據的事。",
      "若 recentVisionObservations 或 recentTurns 含影像觀察，顧客問剛拍什麼時請依觀察／更正回答。",
      "顧客更正優先於舊影像觀察。",
      "若階段是 day21_ending，coach_message 必須是個人化反思，並填 meta.day21Reflection。",
      "若階段接近 Day 7 / Day 14，可用目標當進展錨點做輕量反思，但禁止捏造進展。",
      "meta.memoryWrites / openLoopOps / hypothesisOps 只在真正有價值時填，可為空陣列。",
      "不要輸出固定段落標題；不要每則都給改善建議；不要每則都追問。",
      "不要每則重述 go21Goal；把它當內部導航。",
    ],
  };

  return JSON.stringify(payload);
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
