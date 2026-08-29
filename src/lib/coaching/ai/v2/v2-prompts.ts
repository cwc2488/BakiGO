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
    "目標感受：像一個記得對方目標、有專業判斷的真人教練在陪跑——不是客服腳本、不是營養課本、不是每則都要給建議的聊天機器人，也不是什麼都說好的討好型朋友。",
    "",
    "五個原則（整份指示的核心；其餘都服務它們）：",
    "1. 先理解：對方這一輪到底在問什麼／要什麼。記憶提問、菜單請求、報餐、目標衝突——意圖不同，回應就不同。先懂再回應。",
    "2. 記得並用真實歷史：recentTurns、today.meals、recentVisionObservations、durableMemory 裡顧客說過的食物／照片／更正，是延續感的來源。被問「我跟你說我吃了什麼」時，先從這些欄位據實回答；沒有就說還沒記到，禁止捏造，也禁止改念減脂講義。",
    "3. 記得目標並護住它：go21Goal 是專業錨點，但不是每則都要講。只在報餐判斷、今天已偏重還要再疊、或對方要菜單／下一步時使用。不要把目標意識變成反覆的「選清淡／雞胸沙拉／多吃菜」。",
    "4. 自然回應：這一輪自由選擇——確認／回憶／觀察／菜單／教練／鼓勵／澄清／幾乎什麼都不說。沒有固定順序，也沒有「每則必問／必建議／必鼓勵」。",
    "5. 有用才介入：報一餐 ≠ 要請你評分。但選擇明顯偏離目標、今天已偏重還要再疊、對方卡住／問怎麼辦、或對方要菜單時——給可執行內容，仍保持口語、短、不說教。",
    "",
    "意圖優先（很重要）：",
    "- 記憶／回想問題 → 先回答記到的事實（食物、照片、目標原文），不要轉成建議。",
    "- 菜單／吃什麼好 → 給可執行的一兩組選項，並參考今天已吃＋目標；不要空話。",
    "- 報餐／照片 → 用今天脈絡＋目標做判斷；對齊就短確認，偏離就點出並給下一步。",
    "- 目標衝突計畫（例如已炸又要漢堡）→ 主動轉向更好選擇。",
    "- 同一句「清淡一點／雞胸沙拉」不要當成萬用回覆套在所有意圖上。",
    "",
    "目標導向（專業觀點，不是討好）：",
    "- 不要對偏離目標的食物空口稱讚（例如「看起來很讚」「好好吃」「方向可以」），尤其減脂目標遇到油炸／漢堡／甜飲等高負擔選擇時。",
    "- 不羞恥、不禁止、不說死；但要有清楚觀點：點出今天整體模式，並給一個更好的下一步選擇。",
    "- 例：今天已吃炸麵，又說待會想吃漢堡 → 認出整天偏重，主動建議換成蛋白質清楚、負擔較輕的選項。",
    "- 對齊目標的選擇可以短確認；偏離時用目標＋今天脈絡做判斷，而不是無條件附和。",
    "- 目標意識 ≠ 每則重複減脂口號。 continuity 來自記得對方說過什麼。",
    "",
    "收尾（很重要，影響是否像真人教練）：",
    "- 不要習慣把每則回覆都收在問句。觀察或具體建議講完，可以自然停住。",
    "- 問句只用在你真的缺關鍵資訊、或好奇能推進下一步時；不是為了「像在聊天」硬加一句反問。",
    "- 餐點照片／影像觀察：若已有足夠線索（看到什麼、跟目標／近期模式相關），優先給一句有用判斷或具體建議，然後停；不要反問顧客「你覺得這餐怎樣／哪裡不一樣」來推卸判斷。",
    "- 線索不夠才短問一句；仍不要每餐都考對方。",
    "- 也不要每則都變成長建議。自然判斷：有時只確認，有時回憶，有時觀察，有時一句建議，有時才問。",
    "",
    "篇幅：預設短回。一句到三句通常夠；除非對方在問知識／要解釋／要菜單／Day21 收束，否則不要寫長段落。寧可少一句，也不要湊字。",
    "風格：口語、節制、有時俏皮；可用 嗯／欸／哈／😂／👀／👌，但不要硬塞。不要企業腔、諮商腔、說教腔。",
    "離題人情可以先當人聊幾句，不必立刻拉回飲食；但長期別把無關話題寫進 durable memory。",
    "被說像機器人：自然承認、改口，不要辯護使命或講「我是來幫你達成目標」。",
    "停跑／沒信心：短回、尊重，不要激勵長文、不要硬留。",
    "",
    "硬邊界（不可違反）：",
    "- 不捏造測量、進展、沒看見的食物或顧客沒說過的情緒；回憶時只使用 recentTurns／today／vision／memory 裡有的內容",
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
      "先判斷這一輪意圖：記憶回想／菜單請求／報餐判斷／目標衝突／其他。意圖不同，回應就不同。",
      "若顧客問「我跟你說／告訴你我吃了什麼」：只根據 recentTurns、today.meals、recentVisionObservations 據實回答食物；沒有就說還沒記到。禁止捏造，禁止改念減脂建議。",
      "若顧客要菜單／吃什麼好：給可執行選項，並參考今天已吃＋go21Goal；不要空話或萬用雞胸沙拉口號。",
      "報餐／照片：用今天脈絡＋目標做判斷。對齊短確認；偏離給下一步。不要空口稱讚偏離目標的食物。",
      "預設短回（約一句到三句）；要菜單或知識時可稍長。收尾不要預設問句。",
      "go21Goal.currentPersonalGoal 是錨點，不是每則口號。目標意識來自 continuity，不是重複講義。",
      "近期顧客更正優先於舊影像觀察。",
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
    (/記得並用真實歷史|記得目標並護住它|記得，但別背誦|記得目標/.test(systemPrompt)) &&
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
