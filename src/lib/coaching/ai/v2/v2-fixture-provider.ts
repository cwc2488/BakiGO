import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type {
  CoachingAiV2GenerationDraft,
  CoachingAiV2Intention,
  CoachingAiV2MemoryBundle,
} from "@/types/coaching-ai-v2";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import type { GenerateCoachingAiV2Input } from "@/lib/coaching/ai/v2/generate-v2";

/**
 * Context-aware fixture generator for tests/eval without OpenAI.
 * Intentionally varies response shape — not a canned template array shuffle.
 */
export function generateFixtureV2Draft(input: GenerateCoachingAiV2Input): CoachingAiV2GenerationDraft {
  const { decisionContext, memory, freeMessage, channel } = input;
  const day = memory.lifecycle.dayNumber;
  const stage = memory.lifecycle.stage;
  const logDate = input.generationInput.logDate;

  if (channel === "day21" || stage === "day21_ending") {
    return buildDay21Draft(input);
  }

  if (freeMessage?.trim() && !hasMealEvidence(decisionContext)) {
    return {
      coachMessage: buildCasualReply(freeMessage, memory),
      meta: emptyMeta("casual", day, stage),
    };
  }

  // Open-loop callback
  const matchingLoop = memory.openLoops.find((loop) => {
    if (loop.status !== "open" && loop.status !== "waiting") return false;
    if (loop.dueLogDate && loop.dueLogDate === logDate) return true;
    if (/晚餐|dinner/i.test(loop.subject) && hasDinnerEvidence(decisionContext)) return true;
    if (/下午|點心|snack/i.test(loop.subject) && /點心|下午|餓/.test(customerText(input))) {
      return true;
    }
    return false;
  });
  if (matchingLoop) {
    return {
      coachMessage: `好，這就是我之前想看的：${matchingLoop.subject}。${describeTodayBriefly(decisionContext)}我們對照看一下跟預期差多少。`,
      meta: {
        ...emptyMeta("follow_up", day, stage),
        openLoopOps: [
          {
            op: "resolve",
            id: matchingLoop.id,
            resolutionNote: "customer_provided_followup_evidence",
          },
        ],
      },
    };
  }

  // Hypothesis revision before no-advice — contradictory evidence matters even on "good" days
  const activeHyp = memory.hypotheses.find((h) => h.status === "active" || h.status === "weakened");
  if (activeHyp && contradictsUnderEatingHypothesis(activeHyp.statement, decisionContext)) {
    return {
      coachMessage: `我先前覺得可能跟白天吃太少有關，但今天看起來不像。${describeTodayBriefly(decisionContext)}這條假設我先放下，改觀察別的線索。`,
      meta: {
        ...emptyMeta("test_hypothesis", day, stage),
        hypothesisOps: [
          {
            op: "contradict",
            id: activeHyp.id,
            evidence: "daytime_intake_not_low_today",
            confidence: Math.max(0.1, activeHyp.confidence - 0.25),
          },
        ],
      },
    };
  }

  // Safety already handled upstream; no-advice path
  if (isNoAdviceContext(decisionContext, freeMessage)) {
    return {
      coachMessage: pickNoAdviceLine(decisionContext, freeMessage),
      meta: emptyMeta("acknowledge", day, stage),
    };
  }

  // Pattern formation (days 4–7+)
  if (
    (stage === "find_patterns" || stage === "experiment" || stage === "build_autonomy") &&
    looksLikeEveningOvereatPattern(decisionContext, memory)
  ) {
    const hypCreate =
      memory.hypotheses.length === 0
        ? [
            {
              op: "create" as const,
              statement: "傍晚／晚餐容易失控，可能跟白天吃太少或下午飢餓有關",
              supportingEvidence: ["multi_day_evening_signal"],
              confidence: 0.55,
            },
          ]
        : [];
    return {
      coachMessage:
        stage === "find_patterns"
          ? "我看了這幾天，有件事你可能沒注意到：問題未必只在晚餐本身，比較像白天偏少、下午很餓，晚上再補回來。"
          : "還是那個假設：下午容易餓，然後晚餐容易補過頭。要不要明天下午先試一個小點心，我們再看晚餐？",
      meta: {
        ...emptyMeta(stage === "find_patterns" ? "investigate" : "test_hypothesis", day, stage),
        hypothesisOps: hypCreate,
        openLoopOps:
          stage === "experiment" || stage === "build_autonomy"
            ? [
                {
                  op: "create" as const,
                  subject: "下午點心實驗",
                  detail: "觀察下午點心後晚餐是否比較穩",
                  dueLogDate: addCalendarDays(logDate, 1),
                  status: "waiting" as const,
                },
              ]
            : [],
        memoryWrites: [
          {
            category: "pattern" as const,
            content: "傍晚飢餓／晚餐容易偏離，疑似與白天攝取不足有關",
            confidence: 0.55,
          },
        ],
      },
    };
  }

  // Understand stage — observe first
  if (stage === "understand") {
    return {
      coachMessage: buildUnderstandReply(decisionContext, input),
      meta: {
        ...emptyMeta("observe", day, stage),
        memoryWrites: extractEarlyMemory(input),
        openLoopOps: maybeCreateObserveLoop(decisionContext, logDate),
      },
    };
  }

  // Autonomy nudge (not every time — only when on-track-ish)
  if (stage === "build_autonomy" && decisionContext.dailyNutritionAssessment.level === "on_track") {
    return {
      coachMessage: "你先看一下今天這餐，你覺得哪裡跟前幾天不一樣？我先不搶答。",
      meta: emptyMeta("challenge", day, stage),
    };
  }

  // Default contextual freeform — varies by nutrition level & voice
  return {
    coachMessage: buildDefaultContextualReply(decisionContext, memory, input),
    meta: {
      ...emptyMeta(pickDefaultIntention(decisionContext), day, stage),
      openLoopOps: maybeCreateObserveLoop(decisionContext, logDate),
      memoryWrites: extractEarlyMemory(input).slice(0, 1),
    },
  };
}

function emptyMeta(
  intention: CoachingAiV2Intention,
  day: number | null,
  stage: CoachingAiV2MemoryBundle["lifecycle"]["stage"],
): CoachingAiV2GenerationDraft["meta"] {
  return {
    intention,
    lifecycleDay: day,
    lifecycleStage: stage,
    memoryWrites: [],
    openLoopOps: [],
    hypothesisOps: [],
    safetyTriggered: false,
    escalationSuggested: false,
    escalationReason: null,
    day21Reflection: null,
  };
}

function hasMealEvidence(decision: CoachingDecisionContext): boolean {
  return decision.mealObservations.some(
    (o) => o.observedFoods.length > 0 || o.signals.length > 0 || Boolean(o.shakeObserved),
  );
}

function hasDinnerEvidence(decision: CoachingDecisionContext): boolean {
  return decision.mealObservations.some(
    (o) => o.mealSlot === "dinner" && (o.observedFoods.length > 0 || o.signals.length > 0),
  );
}

function customerText(input: GenerateCoachingAiV2Input): string {
  return [
    input.freeMessage,
    input.generationInput.todayContext.customerNote,
    ...input.generationInput.todayContext.primaryMeals.map((m) => m.textNote),
  ]
    .filter(Boolean)
    .join(" ");
}

function isNoAdviceContext(
  decision: CoachingDecisionContext,
  freeMessage: string | null | undefined,
): boolean {
  if (freeMessage && /還可以|沒事|先這樣|謝謝|哈哈|累/.test(freeMessage) && !hasMealEvidence(decision)) {
    return true;
  }
  if (
    decision.dailyNutritionAssessment.level === "on_track" &&
    decision.priorities.length === 0 &&
    decision.customerVoice.length === 0
  ) {
    return true;
  }
  return false;
}

function pickNoAdviceLine(
  decision: CoachingDecisionContext,
  freeMessage: string | null | undefined,
): string {
  if (freeMessage && /累|疲/.test(freeMessage)) {
    return "聽起來今天很累。先休息沒關係，飲食這塊我先不念你。";
  }
  if (freeMessage && /還可以|沒事|謝謝/.test(freeMessage)) {
    return "好，那今天先這樣。有想聊的再跟我說就好。";
  }
  if (decision.dailyNutritionAssessment.level === "on_track") {
    return "可以喔，今天這餐我反而沒什麼要念你的。";
  }
  return "收到。";
}

function describeTodayBriefly(decision: CoachingDecisionContext): string {
  const foods = decision.mealObservations.flatMap((o) => o.observedFoods).slice(0, 4);
  if (foods.length === 0) return "";
  return `今天看到有${foods.join("、")}。`;
}

function looksLikeEveningOvereatPattern(
  decision: CoachingDecisionContext,
  memory: CoachingAiV2MemoryBundle,
): boolean {
  const dinnerHeavy = decision.mealObservations.some(
    (o) =>
      o.mealSlot === "dinner" &&
      (o.signals.includes("fried_food") ||
        o.signals.includes("starch_concentrated") ||
        o.signals.includes("sugary_drink")),
  );
  const lightDay =
    decision.mealObservations.filter((o) => o.mealSlot !== "dinner" && o.shakeObserved).length >=
      1 || decision.customerVoice.some((v) => v.key === "hunger_reported");
  const priorPattern = memory.durableMemory.some((m) => /傍晚|晚餐|下午/.test(m.content));
  return (dinnerHeavy && lightDay) || priorPattern;
}

function contradictsUnderEatingHypothesis(
  statement: string,
  decision: CoachingDecisionContext,
): boolean {
  if (!/白天|太少|不足|下午/.test(statement)) return false;
  const solidMeals = decision.mealObservations.filter(
    (o) => o.solidFoodObserved || o.observedFoods.length >= 2,
  ).length;
  return solidMeals >= 2 && !decision.customerVoice.some((v) => v.key === "hunger_reported");
}

function buildUnderstandReply(
  decision: CoachingDecisionContext,
  input: GenerateCoachingAiV2Input,
): string {
  const note = input.generationInput.todayContext.customerNote?.trim();
  if (note) {
    return `先記下來了：你提到「${note.slice(0, 40)}」。這幾天我想先多看、少念，搞懂你的節奏再一起調。`;
  }
  if (hasMealEvidence(decision)) {
    return `${describeTodayBriefly(decision)}前幾天我先觀察為主，暫時不急著給你一堆建議。`;
  }
  return "這幾天我想先了解你的作息跟吃法，先觀察、少糾正。你有想讓我先知道的限制或偏好也可以直接講。";
}

function buildCasualReply(freeMessage: string, memory: CoachingAiV2MemoryBundle): string {
  if (/加班|工作|開會/.test(freeMessage)) {
    const prior = memory.durableMemory.find((m) => /工作|加班|忙/.test(m.content));
    if (prior) {
      return "又是工作把節奏打亂？上次你也提過類似的，沒關係，今天先撐住最基本的就好。";
    }
    return "工作日這樣很常見。我先聽你說，飲食這塊有需要再一起想簡單做法。";
  }
  if (/睡|失眠|熬夜/.test(freeMessage)) {
    return "睡眠差真的會讓後面更好餓或更想吃重的。今天先不硬撐完美。";
  }
  return `嗯，我聽到了。${freeMessage.slice(0, 24)}${freeMessage.length > 24 ? "…" : ""} — 你想多聊這件事，還是只是跟我說一聲？`;
}

function buildDefaultContextualReply(
  decision: CoachingDecisionContext,
  memory: CoachingAiV2MemoryBundle,
  input: GenerateCoachingAiV2Input,
): string {
  const hunger = decision.customerVoice.some((v) => v.key === "hunger_reported");
  const level = decision.dailyNutritionAssessment.level;
  const open = memory.openLoops[0];

  if (hunger) {
    return "你說還是會餓，這個我有注意到。我先不急著下結論，想多看幾天是哪一段最容易餓。";
  }
  if (level === "off_track") {
    return `${describeTodayBriefly(decision)}以減脂方向來看，今天整體確實偏了；不是要罵你，是讓我們知道要調哪一段。`;
  }
  if (level === "needs_adjustment") {
    return `${describeTodayBriefly(decision)}有一點可以調，但不用整天生氣。我們抓一個最值得動的點就好。`;
  }
  if (open) {
    return `對了，我們上次還掛著「${open.subject}」。今天若有相關再讓我看一眼。其他的，先照你的節奏。`;
  }
  const name = input.generationInput.profileMemory.displayName;
  return `${name ? `${name}，` : ""}今天這樣我就先記著。有想問的再丟給我。`;
}

function pickDefaultIntention(decision: CoachingDecisionContext): CoachingAiV2Intention {
  if (decision.customerVoice.length > 0) return "acknowledge";
  if (decision.dailyNutritionAssessment.level === "off_track") return "challenge";
  if (decision.dailyNutritionAssessment.level === "needs_adjustment") return "educate";
  return "observe";
}

function extractEarlyMemory(input: GenerateCoachingAiV2Input) {
  const writes: CoachingAiV2GenerationDraft["meta"]["memoryWrites"] = [];
  const note = input.generationInput.todayContext.customerNote?.trim();
  if (note && note.length >= 4) {
    writes.push({
      category: "customer_statement",
      content: note.slice(0, 200),
      confidence: 0.7,
    });
  }
  const occupation = input.generationInput.profileMemory.customerContext.occupation;
  if (occupation) {
    writes.push({
      category: "constraint",
      content: `職業／生活型態：${occupation}`,
      confidence: 0.8,
    });
  }
  return writes;
}

function maybeCreateObserveLoop(
  decision: CoachingDecisionContext,
  logDate: string,
): CoachingAiV2GenerationDraft["meta"]["openLoopOps"] {
  if (
    decision.customerVoice.some((v) => v.key === "hunger_reported") ||
    decision.mealObservations.some((o) => o.mealSlot === "dinner" && o.signals.length > 0)
  ) {
    return [
      {
        op: "create",
        subject: "明天晚餐觀察",
        detail: "確認晚上是否比較容易偏離",
        dueLogDate: addCalendarDays(logDate, 1),
        status: "waiting",
      },
    ];
  }
  return [];
}

function buildDay21Draft(input: GenerateCoachingAiV2Input): CoachingAiV2GenerationDraft {
  const { memory } = input;
  const patterns = memory.durableMemory
    .filter((m) => m.category === "pattern" || m.category === "insight")
    .map((m) => m.content);
  const worked = memory.durableMemory
    .filter((m) => m.category === "strategy_worked")
    .map((m) => m.content);
  const failed = memory.durableMemory
    .filter((m) => m.category === "strategy_failed")
    .map((m) => m.content);
  const statements = memory.durableMemory
    .filter((m) => m.category === "customer_statement" || m.category === "motivation")
    .map((m) => m.content);
  const hyp = memory.hypotheses.map((h) => h.statement);

  const majorPatterns =
    patterns.length > 0
      ? patterns.slice(0, 3)
      : hyp.slice(0, 2).length > 0
        ? hyp.slice(0, 2)
        : ["回報節奏有建立，但飲食型態證據仍有限"];

  const goalWish =
    input.go21Goal?.originalPersonalGoal ||
    input.go21Goal?.personalGoal ||
    input.generationInput.profileMemory.goal ||
    "減脂／調整生活節奏";

  const reflection = {
    startingSituation: statements[0] ?? `21 天前，你希望：${goalWish}`,
    majorPatterns,
    meaningfulChanges:
      worked.length > 0 ? worked.slice(0, 3) : ["持續回報本身是可觀察到的改變"],
    recurringDifficulties:
      failed.length > 0
        ? failed.slice(0, 3)
        : memory.openLoops.map((l) => l.subject).slice(0, 2).length
          ? memory.openLoops.map((l) => l.subject).slice(0, 2)
          : ["偶發偏離仍會出現"],
    triggers: memory.durableMemory
      .filter((m) => m.category === "trigger")
      .map((m) => m.content)
      .slice(0, 3),
    experimentsAttempted: memory.durableMemory
      .filter((m) => m.category === "strategy_worked" || m.category === "strategy_failed")
      .map((m) => m.content)
      .slice(0, 4),
    whatWorked: worked.length > 0 ? worked.slice(0, 3) : ["願意誠實回報"],
    whatDidNot: failed.length > 0 ? failed.slice(0, 3) : ["尚未形成穩定的替代策略"],
    sustainable: ["維持每日回報", "對飢餓時段保持覺察"].slice(0, 3),
    nextActions: [
      majorPatterns[0] ? `繼續觀察：${majorPatterns[0].slice(0, 40)}` : "維持回報節奏",
      "遇到偏離時先標出時段，再決定要不要調",
      "需要時找真人教練一起看卡關點",
    ].slice(0, 3),
  };

  const coachMessage = [
    "21 天先停在這裡。不是畢業典禮講稿，是根據我們實際走過的內容。",
    `一開始：${reflection.startingSituation}`,
    `我看到的主要模式：${reflection.majorPatterns.join("；")}`,
    `有感覺的改變：${reflection.meaningfulChanges.join("；")}`,
    `還容易卡住的地方：${reflection.recurringDifficulties.join("；")}`,
    `比較值得帶走的下一步：${reflection.nextActions.join("；")}`,
  ].join("\n");

  return {
    coachMessage,
    meta: {
      ...emptyMeta("reflect", 21, "day21_ending"),
      day21Reflection: reflection,
      memoryWrites: [
        {
          category: "insight",
          content: `Day21 摘要：${reflection.majorPatterns[0] ?? "完成一輪觀察"}`,
          confidence: 0.7,
        },
      ],
    },
  };
}
