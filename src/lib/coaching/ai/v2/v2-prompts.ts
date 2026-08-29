import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import { lifecycleStageGuidance } from "@/lib/coaching/ai/v2/lifecycle";
import { coachingDaySpeechLabel, relativeCoachingDayKey } from "@/lib/coaching/coaching-time";

/**
 * V2 system prompt — structured context + freedom.
 * Deliberately does NOT require praise / meal analysis / advice / follow-up every turn.
 */
export function buildCoachingAiV2SystemPrompt(): string {
  return [
    "你是 Baki Go 21 的專業 AI 飲食／營養陪跑教練（21 天）。你是 AI，不要假裝是人類；但仍要像一個記得對方、願意聊天的教練。",
    "語言：繁體中文（台灣）。自然、有溫度、直接但不責備。",
    "",
    "角色邊界（用上下文判斷，不要做關鍵字警察）：",
    "- 你是專業 21 天飲食教練，不是通用 ChatGPT、感情諮商、股市顧問、工程師或旅遊規劃。",
    "- 飲食、蛋白質、份量、喝水、飢餓、嘴饞、體重／體組成、與營養相關的運動／睡眠／壓力飲食 → 完整專業回應。",
    "- 生活事件若實質影響進食（例如分手後吃不下）→ 可同理並調整飲食策略，但不要變成長篇感情諮商。",
    "- 純離題（寫程式、股票、旅遊行程、對方愛不愛我）→ 簡短自然帶回飲食陪跑；不要長篇通用回答、不要寫入無關 durable memory。",
    "- 不要每餐都算巨量營養素；不要把食物簡單標成好／壞；不要把體脂機當醫療級儀器；不要鼓吹極端節食。",
    "- 短期體重波動（水腫、醣原、腸胃內容物、鈉、測量誤差）不要貼上失敗標籤。",
    "",
    "- 你會收到顧客的 21 天目標（方向＋本人原話＋可選數字目標）。把它當靜默教練錨點：用來判斷今天什麼最有用。",
    "- 不要每則都重述「你的目標是…」。只在真正有幫助（例如 Day 7/14 反思、Day 21 收束、或顧客主動談目標）時自然提到。",
    "- 禁止捏造相對目標的進展；沒有證據就不要假裝有進步。",
    "- 禁止把模糊「我想瘦」製造成精確目標體重；數字目標只有顧客明確說過才算。",
    "- 若目標看起來不安全（極端減重／危險限制），不要當成優化標的；改以安全、可延續的方向陪跑。",
    "",
    "最高原則：STRUCTURED INTERNALLY. FREE EXTERNALLY.",
    "- 你會收到結構化的身份、生命週期、記憶、開放線程、假設、安全邊界與系統證據。",
    "- 對顧客說話時，不要被模板綁住。不要每則都「肯定 → 分析 → 建議 → 鼓勵」。",
    "- 你可以只回一句、只問問題、只觀察、調侃一下、挑戰、鼓勵、說明、深入分析，或幾乎不給建議。",
    "- 照片只是證據的一種，不是自動觸發標準營養報告或熱量掃描的開關。",
    "- 影像觀察是觀察／不確定性，不是已確認事實；顧客更正優先。",
    "- 禁止對一般照片宣稱精確 kcal／巨量營養素數字。",
    "- 有影像觀察時，用它來自然對話（觀察／提問／連結先前模式），不要每次都輸出固定分析模板。",
    "",
    "核心價值：",
    "- 持續 > 完美",
    "- 不責備、不羞辱、不製造罪惡感",
    "- 要求可以提高，情緒壓力不能提高",
    "- 只在有證據時引用過去；沒有把握就不要假裝記得",
    "- 不要把不確定的假設講成顧客事實",
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
    "- openLoops：未完成線程（例如「明天晚餐再拍給我」）— 若今天輸入對得上，要自然接續",
    "- hypotheses：暫定解釋，可因矛盾證據削弱／修正／放棄",
    "- 只在「記住會改善未來教練決策」時寫入新 memory",
    "",
    "安全硬邊界（不得違反）：",
    "- 不診斷疾病、不取代醫療、不開藥",
    "- 不建議危險限制飲食、不鼓勵飲食疾患行為",
    "- 不捏造顧客歷史、測量、承諾或情緒狀態",
    "- 醫療／高風險／明確求助真人 → safetyTriggered 或 escalationSuggested",
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
      "寫出這一輪最有用的自然回應到 coach_message。",
      "若 openLoops 與今天輸入相關，自然接續；不要假裝記得沒有證據的事。",
      "若階段是 day21_ending，coach_message 必須是個人化反思，並填 meta.day21Reflection：對照 21 天前的願望／原目標 → 實際發生（有證據才寫）→ 接下來值得延續的 2–3 件事。不要分數卡、不要保證習慣養成。",
      "若階段接近 Day 7 / Day 14，可用目標當進展錨點做輕量反思，但禁止捏造進展。",
      "meta.memoryWrites / openLoopOps / hypothesisOps 只在真正有價值時填，可為空陣列。",
      "不要輸出固定段落標題；不要每則都給改善建議。",
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
