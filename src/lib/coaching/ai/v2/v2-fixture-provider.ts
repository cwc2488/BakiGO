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

  // Disengagement / stop — brief, never motivational essay
  if (freeMessage && /想結束|結束這個陪跑|很沒信心|不想繼續|退出陪跑/.test(freeMessage)) {
    return {
      coachMessage:
        "聽起來你今天真的有點撐不住了。是這個陪跑方式不適合你，還是最近整體壓力比較大？",
      meta: emptyMeta("acknowledge", day, stage),
    };
  }

  // Meta feedback about the AI — acknowledge, don't defend
  if (freeMessage && /機器人|很AI|很制式|像客服|營養課本/.test(freeMessage)) {
    return {
      coachMessage: "被你抓到了 😂 我剛剛講得太像腳本，這句當沒看到，我們照平常聊天。",
      meta: emptyMeta("casual", day, stage),
    };
  }

  // Explicit information request — longer answer OK
  if (freeMessage && /為什麼|怎麼幫|有什麼幫助|原理/.test(freeMessage) && /蛋白|減脂|熱量|代謝/.test(freeMessage)) {
    return {
      coachMessage:
        "簡單說：蛋白質比較能讓你有飽足感，也比較能保住肌肉。減脂時如果只狂砍熱量、蛋白質又很少，人容易餓、肌肉也比較容易掉，後面更難維持。不是魔法，是讓過程比較穩。",
      meta: emptyMeta("educate", day, stage),
    };
  }

  // Vision recall — use recent observations / turn memory (no new vision call)
  const visionRecall = matchVisionRecall(input);
  if (visionRecall) {
    return {
      coachMessage: visionRecall,
      meta: emptyMeta("acknowledge", day, stage),
    };
  }

  // Photo / vision observation — acknowledge, don't lecture
  if (freeMessage && /\[影像觀察/.test(freeMessage)) {
    const food = extractVisionFoodLabel(freeMessage);
    return {
      coachMessage: food ? `看到啦，是${food} 👀` : "照片收到了 👀",
      meta: emptyMeta("observe", day, stage),
    };
  }

  // Simple food log — acknowledge only (no nutrition correction obligation)
  const simpleFood = matchSimpleFoodLog(freeMessage);
  if (simpleFood) {
    return {
      coachMessage: `收到，${simpleFood} 👌`,
      meta: emptyMeta("acknowledge", day, stage),
    };
  }

  // Goal-relevant late craving — use goal silently (no verbatim recitation)
  if (
    freeMessage &&
    /突然.*想吃|超想吃|宵夜|十一點|23:|晚上.*想吃/.test(freeMessage) &&
    input.go21Goal?.personalGoal &&
    /宵夜|晚上|失控|亂吃/.test(input.go21Goal.personalGoal)
  ) {
    return {
      coachMessage: "欸，這就是晚上那關 👀 先喝口水或泡杯茶撐一下？真的餓再吃也沒關係。",
      meta: emptyMeta("encourage", day, stage),
    };
  }

  // Pattern: repeated afternoon skip / evening hunger
  if (
    freeMessage &&
    /晚上又餓|又餓爆|又超餓/.test(freeMessage) &&
    looksLikeEveningOvereatPattern(decisionContext, memory)
  ) {
    return {
      coachMessage:
        "我發現一件事：比較像下午空太久，晚上才一次餓爆。我反而想先看下午那段。",
      meta: emptyMeta("observe", day, stage),
    };
  }

  if (freeMessage?.trim() && !hasMealEvidence(decisionContext)) {
    return {
      coachMessage: buildCasualReply(freeMessage, memory, input),
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

function buildCasualReply(
  freeMessage: string,
  memory: CoachingAiV2MemoryBundle,
  input: GenerateCoachingAiV2Input,
): string {
  if (/女朋友|男友|不理我|分手|吵架/.test(freeMessage)) {
    return "靠，這聽起來比晚餐還煩 😅 她最近一直都這樣嗎？";
  }
  if (/加班|工作|開會/.test(freeMessage)) {
    const prior = memory.durableMemory.find((m) => /工作|加班|忙/.test(m.content));
    if (prior) return "又是工作把節奏打亂？今天先撐住最基本的就好。";
    return "工作日這樣很常見。";
  }
  if (/睡|失眠|熬夜/.test(freeMessage)) {
    return "睡眠差真的會讓後面更好餓。今天先不硬撐完美。";
  }
  if (/嘴饞|想吃|宵夜|十一點|突然很想吃/.test(freeMessage)) {
    const goal = input.go21Goal?.personalGoal ?? "";
    if (/宵夜|晚上|失控|亂吃/.test(goal)) {
      return "欸，這就是晚上那關 👀 先喝口水或泡杯茶撐一下？真的餓再吃也沒關係。";
    }
    return "突然想吃很常見。先喝口水撐一下，還是你現在真的餓？";
  }
  if (/還可以|沒事|先這樣|謝謝|哈哈/.test(freeMessage)) {
    return "好，我知道了。";
  }
  if (/累|疲/.test(freeMessage)) {
    return "難怪，今天感覺真的被榨乾了 😵‍💫";
  }
  return `嗯，${freeMessage.slice(0, 18)}${freeMessage.length > 18 ? "…" : ""}`;
}

function matchSimpleFoodLog(freeMessage: string | null | undefined): string | null {
  if (!freeMessage?.trim()) return null;
  const text = freeMessage.trim();
  // Avoid matching vision-enriched or question messages
  if (/\[影像觀察|為什麼|怎麼|？|\?/.test(text)) return null;
  const m = text.match(
    /(?:晚餐|午餐|早餐|宵夜|剛剛)?(?:吃了|吃|喝了|喝)?\s*([^\n。！？]{1,20}(?:飯|麵|漢堡|奶茶|紅茶|咖啡|雞胸|泡麵|蛋糕|滷肉|沙拉|便當|壽司))/,
  );
  if (m?.[1]) return m[1].trim();
  if (/^(?:晚餐|午餐|早餐).{0,12}$/.test(text) && /飯|麵|堡|茶|肉/.test(text)) {
    return text.replace(/^(?:晚餐|午餐|早餐)(?:吃了|吃)?/, "").trim() || text;
  }
  return null;
}

function matchVisionRecall(input: GenerateCoachingAiV2Input): string | null {
  const msg = input.freeMessage ?? "";
  if (!/剛剛拍|我拍了什麼|剛傳的|那張照片|剛剛.*什麼/.test(msg)) return null;

  const fromObs = input.recentVisionObservations?.[0];
  if (fromObs?.correction?.trim()) {
    return `${fromObs.correction.trim()}啊 😂`;
  }
  if (fromObs?.summary?.trim()) {
    const food = extractVisionFoodLabel(fromObs.summary) ?? fromObs.summary.slice(0, 12);
    return `${food}啊 😂`;
  }

  for (const turn of [...input.memory.recentTurns].reverse()) {
    if (turn.role !== "customer") continue;
    const correction = turn.content.match(/\[顧客更正\]\s*([^\n]+)/)?.[1]?.trim();
    if (correction) return `${correction}啊 😂`;
    const vision = turn.content.match(/\[近期影像觀察[^\]]*\]\s*([^\n]+)/)?.[1]?.trim();
    if (vision) {
      const food = extractVisionFoodLabel(vision) ?? vision.slice(0, 12);
      return `${food}啊 😂`;
    }
  }
  return "我這邊還對不太起來上一張，你再用一句話說說看？";
}

function extractVisionFoodLabel(text: string): string | null {
  const patterns = [
    /(?:看起來像|像是|像|為|是)\s*([^\s，,。！？\n]{1,12})/,
    /(無糖紅茶|紅茶|奶茶|綠茶|咖啡|白飯|麵|湯|蛋|沙拉)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
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
