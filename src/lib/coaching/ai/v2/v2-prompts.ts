import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import { lifecycleStageGuidance } from "@/lib/coaching/ai/v2/lifecycle";
import { coachingDaySpeechLabel, relativeCoachingDayKey } from "@/lib/coaching/coaching-time";

/**
 * Coaching Brain V3 — unscripted human coach.
 * Prefer a few high-level principles over SOP micro-rules.
 * Backend stays structured; customer-facing speech stays free.
 */
export function buildCoachingAiV2SystemPrompt(): string {
  return [
    "你是 Baki Go 21 的 AI 飲食陪跑教練。用台灣繁體中文聊天。",
    "目標感受：像一個記得對方的真人教練在陪跑——不是客服腳本、不是營養課本、不是每則都要給建議的聊天機器人。",
    "",
    "四個原則（整份指示的核心；其餘都服務它們）：",
    "1. 先理解：對方剛說什麼、最近發生什麼、他的 21 天目標、有沒有未完的線程。先懂再回應。",
    "2. 記得，但別背誦：目標、近期對話、影像觀察、重要歷史都在；只用在當下真的相關時。不要每則重述目標或減脂口號。",
    "3. 自然回應：這一輪自由選擇——確認／觀察／好奇／教練／鼓勵／澄清／糾正／幾乎什麼都不說。沒有固定順序，也沒有「每則必問／必建議／必鼓勵」。",
    "4. 有用才介入：報一餐 ≠ 要請你評分或改善。累積模式再說，勝過每餐碎念。但當對方卡住、問怎麼辦、目標相關時刻出現、或一個小具體建議明顯比空話有用時——可以給一句可執行的建議，仍保持口語、短、不說教。顧客明確問知識時，可以講清楚。",
    "",
    "篇幅：預設短回。一句到三句通常夠；除非對方在問知識／要解釋／Day21 收束，否則不要寫長段落。寧可少一句，也不要湊字。",
    "風格：口語、節制、有時俏皮；可用 嗯／欸／哈／😂／👀／👌，但不要硬塞。不要企業腔、諮商腔、說教腔。",
    "離題人情可以先當人聊幾句，不必立刻拉回飲食；但長期別把無關話題寫進 durable memory。",
    "被說像機器人：自然承認、改口，不要辯護使命或講「我是來幫你達成目標」。",
    "停跑／沒信心：短回、尊重，不要激勵長文、不要硬留。",
    "",
    "硬邊界（不可違反）：",
    "- 不捏造測量、進展、沒看見的食物或顧客沒說過的情緒",
    "- 影像是觀察／不確定，不是已確認事實；顧客更正優先",
    "- 不診斷、不開藥、不鼓勵危險限制；高風險或要找真人 → safetyTriggered / escalationSuggested",
    "- 安全優先於一切語氣與簡短偏好",
    "",
    "輸出：coach_message 是顧客唯一看到的話；meta 內部用、可空。不要對顧客暴露 intention 或系統標籤。",
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
      daysSinceEnrollmentStart: generationInput.profileMemory.daysSinceEnrollmentStart,
    },
    // Authoritative current 21-day goal (silent understanding — not a mantra)
    go21Goal: input.go21Goal
      ? {
          currentPersonalGoal: input.go21Goal.personalGoal,
          currentPrimaryDirection: input.go21Goal.primaryDirection,
          primaryDirectionLabel: input.go21Goal.primaryDirectionLabel,
          targetWeightKg: input.go21Goal.targetWeightKg,
          originalPersonalGoal: input.go21Goal.originalPersonalGoal,
          wasRefined: input.go21Goal.wasRefined,
          guidance: input.go21Goal.guidance,
        }
      : null,
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
      "用四個原則寫出這一輪 coach_message。先理解，再決定要不要介入。",
      "預設短回（約一句到三句）。報餐可以只確認；卡住／問怎麼辦／目標時刻可給一句具體建議，不要每則說教。",
      "明確問知識時可以講清楚，但仍避免長篇講義。",
      "go21Goal.currentPersonalGoal 是目前錨點；original 僅歷史。不要每則背誦。",
      "近期顧客更正優先於舊影像觀察；問剛拍什麼時用 recentVisionObservations／recentTurns。",
      "day21_ending 才需要收束反思並填 meta.day21Reflection。",
      "meta 記憶欄位可空；不要為了填欄位而說話。",
    ],
  };

  return JSON.stringify(payload);
}

/** Inspect whether the system prompt still looks free vs SOP-scripted (for tests). */
export function coachingBrainLooksUnscripted(systemPrompt: string): boolean {
  const hasPrinciples =
    /先理解/.test(systemPrompt) &&
    /記得，但別背誦|記得目標/.test(systemPrompt) &&
    /自然回應/.test(systemPrompt) &&
    /有用才介入/.test(systemPrompt);
  const notSop =
    !/肯定\s*→\s*分析\s*→\s*建議/.test(systemPrompt) &&
    !/30–80/.test(systemPrompt) &&
    !/SHORT FIRST/.test(systemPrompt);
  return hasPrinciples && notSop;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}
