import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type {
  CoachingAiV2GenerationDraft,
  CoachingAiV2Intention,
  CoachingAiV2MemoryBundle,
} from "@/types/coaching-ai-v2";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import type { GenerateCoachingAiV2Input } from "@/lib/coaching/ai/v2/generate-v2";
import {
  collectReportedFoods,
  detectGo21CoachIntent,
  formatFoodRecallReply,
  formatGoalRecallReply,
  formatMenuSuggestionReply,
} from "@/lib/go21/coach-intent";
import { buildGo21TemporalTimeline } from "@/lib/go21/temporal-meal-state";
import { synthesizeDay21Understanding } from "@/lib/go21/premium-understanding";
import {
  composeGo21NaturalConversationalReply,
  conversationalMovePrefersNaturalAck,
  detectGo21ConversationalMove,
} from "@/lib/go21/conversational-move";
import { buildGo21HumanCoachReplyContract } from "@/lib/go21/human-coach-voice";

/**
 * Context-aware fixture generator for tests/eval without OpenAI.
 * Intentionally varies response shape — not a canned template array shuffle.
 * Reads longitudinalUnderstanding when present (Premium Coaching Brain).
 * Natural Conversation Layer: understand conversational moves before coaching.
 */
export function generateFixtureV2Draft(input: GenerateCoachingAiV2Input): CoachingAiV2GenerationDraft {
  const { decisionContext, memory, freeMessage, channel } = input;
  const day = memory.lifecycle.dayNumber;
  const stage = memory.lifecycle.stage;
  const logDate = input.generationInput.logDate;
  const intent = detectGo21CoachIntent({ freeMessage });
  const understanding = input.longitudinalUnderstanding ?? null;
  const utteranceMode = understanding?.utteranceMode ?? null;

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

  const todayHeavyFoods = listTodayHeavyFoodLabels(input);
  const alreadyHeavyToday =
    todayHeavyFoods.length > 0 || hasHeavySignalsToday(decisionContext);

  // Natural Conversation Layer — understand the move BEFORE coaching
  const conversational = detectGo21ConversationalMove({
    freeMessage,
    recentTurns: memory.recentTurns.map((t) => ({ role: t.role, content: t.content })),
  });
  if (conversational && conversationalMovePrefersNaturalAck(conversational.move)) {
    return {
      coachMessage: composeGo21NaturalConversationalReply(conversational, {
        todayHeavyFoods,
        alreadyHeavyToday,
      }),
      meta: emptyMeta("acknowledge", day, stage),
    };
  }
  if (conversational?.move === "continuation") {
    return {
      coachMessage: composeGo21NaturalConversationalReply(conversational, {
        todayHeavyFoods,
        alreadyHeavyToday,
      }),
      meta: emptyMeta("casual", day, stage),
    };
  }

  // Short human turns that aren't always classified as conversational moves
  const humanShort = matchHumanShortTurnReply(freeMessage, {
    alreadyHeavyToday,
    todayHeavyFoods,
    go21Goal: input.go21Goal,
  });
  if (humanShort) {
    return {
      coachMessage: humanShort.message,
      meta: emptyMeta(humanShort.intention, day, stage),
    };
  }

  // Memory / clarification — answer the question from real history first (never invent)
  if (intent === "memory_food_recall" || utteranceMode === "memory_check") {
    if (intent === "memory_goal_recall") {
      /* fall through below */
    } else if (intent === "memory_food_recall" || /吃|喝|餐/.test(freeMessage ?? "")) {
      return {
        coachMessage: buildFoodRecallReply(input),
        meta: emptyMeta("acknowledge", day, stage),
      };
    }
  }
  if (intent === "memory_goal_recall") {
    const goalReply = formatGoalRecallReply({
      personalGoal: input.go21Goal?.personalGoal,
      primaryDirectionLabel: input.go21Goal?.primaryDirectionLabel,
    });
    return {
      coachMessage: goalReply ?? "你還沒設定清楚的 21 天目標，想的話我們可以現在補一句。",
      meta: emptyMeta("acknowledge", day, stage),
    };
  }
  if (intent === "memory_photo_recall") {
    const visionRecall = matchVisionRecall(input);
    return {
      coachMessage: visionRecall ?? buildFoodRecallReply(input),
      meta: emptyMeta("acknowledge", day, stage),
    };
  }

  // Revised understanding — acknowledge we were wrong when customer brings counter-evidence
  const revisedInsight = understanding?.emergingObservations.find((o) =>
    /降級|反證|改觀察/.test(o.statement),
  );
  if (
    revisedInsight &&
    freeMessage &&
    /午餐吃完整|中午有好好吃|晚上很穩|晚上沒亂吃/.test(freeMessage)
  ) {
    return {
      coachMessage:
        "嗯，我先前覺得晚上失控主要來自中午吃太少，但你最近這幾天有點不一樣。這條我先修正，改看別的線索。",
      meta: emptyMeta("test_hypothesis", day, stage),
    };
  }

  // Longitudinal insight — only when durable understanding says shareable + turn is useful
  const shareable = understanding?.shareableInsights?.[0] ?? null;
  if (
    shareable &&
    freeMessage &&
    (utteranceMode === "reporting" ||
      utteranceMode === "seeking_help" ||
      /晚上又|又餓|又爆|宵夜|失控/.test(freeMessage)) &&
    !/菜單|吃什麼好/.test(freeMessage)
  ) {
    return {
      coachMessage: shareable.customerFacingHint,
      meta: {
        ...emptyMeta("investigate", day, stage),
        memoryWrites: [
          {
            category: "insight" as const,
            content: shareable.statement,
            confidence: shareable.confidence,
          },
        ],
        openLoopOps: understanding?.openExperiments?.[0]
          ? [
              {
                op: "create" as const,
                subject: understanding.openExperiments[0].description.slice(0, 40),
                detail: understanding.openExperiments[0].description,
                dueLogDate: addCalendarDays(logDate, 1),
                status: "waiting" as const,
              },
            ]
          : [],
      },
    };
  }

  // Menu request — actionable options; personalize from preferences when present
  if (intent === "menu_request" || utteranceMode === "asking_advice") {
    if (intent === "menu_request" || /菜單|吃什麼|怎麼選/.test(freeMessage ?? "")) {
      const foods = collectFoodsFromInput(input);
      const alreadyHeavy =
        foods.some((f) => /炸|漢堡|薯條|奶茶|蛋糕|泡麵|披薩|可樂|雞排/.test(f.label)) ||
        hasHeavySignalsToday(decisionContext);
      const dislike = understanding?.knownPreferences?.find((p) => p.polarity === "dislike");
      const like = understanding?.knownPreferences?.find((p) => p.polarity === "like");
      let menu = formatMenuSuggestionReply({
        primaryDirection: input.go21Goal?.primaryDirection,
        personalGoal: input.go21Goal?.personalGoal,
        alreadyHeavyToday: alreadyHeavy,
      });
      if (dislike?.content) {
        menu = `${menu}（我記得你不太喜歡${dislike.content}，這組先避開。）`;
      } else if (like?.content) {
        menu = `${menu}（可以往你比較愛的${like.content}方向靠一點。）`;
      }
      return {
        coachMessage: menu,
        meta: emptyMeta("educate", day, stage),
      };
    }
  }

  // Explicit information request — longer answer OK
  if (
    (utteranceMode === "factual_question" ||
      (freeMessage && /為什麼|怎麼幫|有什麼幫助|原理/.test(freeMessage))) &&
    freeMessage &&
    /蛋白|減脂|熱量|代謝/.test(freeMessage)
  ) {
    return {
      coachMessage:
        "簡單說：蛋白質比較能讓你有飽足感，也比較能保住肌肉。減脂時如果只狂砍熱量、蛋白質又很少，人容易餓、肌肉也比較容易掉，後面更難維持。不是魔法，是讓過程比較穩。",
      meta: emptyMeta("educate", day, stage),
    };
  }

  // Goal conflict / day-pattern steering — protect goal without shame lectures
  const goalSteer = matchGoalConflictSteering(input);
  if (goalSteer) {
    return {
      coachMessage: goalSteer,
      meta: emptyMeta("challenge", day, stage),
    };
  }

  // Vision recall fallback (legacy photo phrasing)
  const visionRecall = matchVisionRecall(input);
  if (visionRecall) {
    return {
      coachMessage: visionRecall,
      meta: emptyMeta("acknowledge", day, stage),
    };
  }

  // Photo / vision observation — useful judgment when cues exist; no self-eval quiz
  if (freeMessage && /\[影像觀察/.test(freeMessage)) {
    const food = extractVisionFoodLabel(freeMessage);
    const mealJudgment = buildMealPhotoJudgment(decisionContext, food, input.go21Goal);
    if (mealJudgment) {
      return {
        coachMessage: mealJudgment,
        meta: emptyMeta("educate", day, stage),
      };
    }
    return {
      coachMessage: food ? `看到啦，是${food} 👀` : "照片收到了 👀",
      meta: emptyMeta("observe", day, stage),
    };
  }

  // Simple food log — acknowledge only when not conflicting with goal
  // Early stage / reporting: keep short; never invent patterns from one event
  const simpleFood = matchSimpleFoodLog(freeMessage);
  if (simpleFood || utteranceMode === "reporting") {
    const conflict = simpleFood
      ? goalConflictsWithFoodChoice(input.go21Goal, simpleFood, decisionContext)
      : null;
    if (conflict) {
      return {
        coachMessage: conflict,
        meta: emptyMeta("challenge", day, stage),
      };
    }
    // Influence silently via active insights without claiming shareable pattern
    if (
      understanding?.activeInsights?.some((i) => i.patternKey === "small_lunch_evening_overeating") &&
      freeMessage &&
      /晚上|宵夜|餓/.test(freeMessage) &&
      !(understanding.shareableInsights?.length)
    ) {
      return {
        coachMessage: simpleFood
          ? `收到，${simpleFood}。我先記著晚上這段。`
          : "收到，我先記著晚上這段。",
        meta: emptyMeta("observe", day, stage),
      };
    }
    if (simpleFood) {
      return {
        coachMessage: `收到，${simpleFood} 👌`,
        meta: emptyMeta("acknowledge", day, stage),
      };
    }
    if (utteranceMode === "reporting" && freeMessage) {
      const short = freeMessage.replace(/\s+/g, " ").trim().slice(0, 24);
      return {
        coachMessage: short.length <= 12 ? `嗯，${short}。` : "收到 👌",
        meta: emptyMeta("acknowledge", day, stage),
      };
    }
  }

  // Goal-relevant late craving — use goal silently (no verbatim recitation)
  if (
    freeMessage &&
    /突然.*想吃|超想吃|宵夜|十一點|23:|晚上.*想吃/.test(freeMessage) &&
    input.go21Goal?.personalGoal &&
    /宵夜|晚上|失控|亂吃/.test(input.go21Goal.personalGoal)
  ) {
    return {
      coachMessage: "欸，這就是晚上那關 👀 先喝口水或泡杯茶撐一下，真的餓再吃也沒關係。",
      meta: emptyMeta("encourage", day, stage),
    };
  }

  // Pattern: repeated afternoon skip / evening hunger (legacy decision-context path)
  // Prefer durable understanding shareable path above; keep this as fallback without hallucinating on day 1
  if (
    freeMessage &&
    /晚上又餓|又餓爆|又超餓/.test(freeMessage) &&
    looksLikeEveningOvereatPattern(decisionContext, memory) &&
    stage !== "understand" &&
    (day == null || day >= 4)
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

  // Pattern formation (days 4–7+) — only when understanding does not already own this
  if (
    (stage === "find_patterns" || stage === "experiment" || stage === "build_autonomy") &&
    looksLikeEveningOvereatPattern(decisionContext, memory) &&
    !(understanding?.shareableInsights?.length)
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
          : "還是那個假設：下午容易餓，然後晚餐容易補過頭。明天下午可以先試一個小點心，我們再看晚餐。",
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

  // Autonomy nudge — observe / tip, do not push self-evaluation questions
  if (stage === "build_autonomy" && decisionContext.dailyNutritionAssessment.level === "on_track") {
    return {
      coachMessage: "今天這餐我覺得穩，你有在維持自己的節奏，這樣就好。",
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

function collectFoodsFromInput(input: GenerateCoachingAiV2Input) {
  const timeline = buildGo21TemporalTimeline({
    generationLogDate: input.generationInput.logDate,
    todayMealNotes: input.generationInput.todayContext.primaryMeals.map((m) => ({
      slot: m.mealSlot,
      note: m.textNote,
    })),
    recentTurns: input.memory.recentTurns.map((t) => ({
      role: t.role,
      content: t.content,
      logDate: t.logDate,
      metadata: t.metadata,
    })),
    visionSummaries: input.recentVisionObservations ?? undefined,
  });
  // Recall / continuity: only foods actually eaten today (+ vision), never stale plans.
  return collectReportedFoods({
    recentCustomerTurnContents: [],
    todayMealNotes: timeline.todayEaten.map((e) => ({
      slot: e.mealSlot ?? "unknown",
      note: e.label,
    })),
    visionSummaries: input.recentVisionObservations ?? undefined,
  });
}

function buildFoodRecallReply(input: GenerateCoachingAiV2Input): string {
  return formatFoodRecallReply(collectFoodsFromInput(input));
}

function recentCustomerFoodContext(input: GenerateCoachingAiV2Input): string {
  const timeline = buildGo21TemporalTimeline({
    generationLogDate: input.generationInput.logDate,
    todayMealNotes: input.generationInput.todayContext.primaryMeals.map((m) => ({
      slot: m.mealSlot,
      note: m.textNote,
    })),
    recentTurns: input.memory.recentTurns.map((t) => ({
      role: t.role,
      content: t.content,
      logDate: t.logDate,
      metadata: t.metadata,
    })),
    visionSummaries: input.recentVisionObservations ?? undefined,
    currentMessage: input.freeMessage,
  });
  return [
    ...timeline.todayEaten.map((e) => e.label),
    ...timeline.openPlansForToday.map((e) => e.label),
    input.freeMessage ?? "",
  ].join(" ");
}

function hasHeavySignalsToday(decision: CoachingDecisionContext): boolean {
  return decision.mealObservations.some((o) =>
    o.signals.some((s) =>
      ["fried_food", "sugary_drink", "starch_concentrated", "late_night"].includes(s),
    ),
  );
}

/**
 * When the live goal conflicts with today's pattern + the next planned choice,
 * challenge with a clear opinion — alternative optional, no empty praise.
 * Never invent "tonight's hamburger" unless that plan is still open today.
 */
function matchGoalConflictSteering(input: GenerateCoachingAiV2Input): string | null {
  const goal = input.go21Goal;
  if (!goal || !isFatLossOrientedGoal(goal)) return null;
  const msg = (input.freeMessage ?? "").trim();
  if (!msg) return null;

  const timeline = buildGo21TemporalTimeline({
    generationLogDate: input.generationInput.logDate,
    todayMealNotes: input.generationInput.todayContext.primaryMeals.map((m) => ({
      slot: m.mealSlot,
      note: m.textNote,
    })),
    recentTurns: input.memory.recentTurns.map((t) => ({
      role: t.role,
      content: t.content,
      logDate: t.logDate,
      metadata: t.metadata,
    })),
    currentMessage: msg,
  });

  const planningHeavy =
    HEAVY_FOOD_RE.test(msg) &&
    /等一下|待會|等等|打算|想吃|晚上想|再吃|後來|然後.*吃|準備吃|明天/.test(msg) &&
    !/吃了|喝了|吃完/.test(msg);

  const plannedLabel =
    timeline.openPlansForToday.find((p) => HEAVY_FOOD_RE.test(p.label))?.label ??
    (planningHeavy ? extractPlannedFoodLabel(msg) : null);

  const alreadyHeavy =
    timeline.todayEaten.some((e) => HEAVY_FOOD_RE.test(e.label)) ||
    hasHeavySignalsToday(input.decisionContext);

  if (planningHeavy && alreadyHeavy && plannedLabel) {
    const prior = timeline.todayEaten.find((e) => HEAVY_FOOD_RE.test(e.label))?.label;
    // One beat opinion — alternative optional, not a packed health-app format
    if (prior) {
      return `今天我比較不推${plannedLabel}，你${prior}已經吃過了 😂`;
    }
    return `今天我比較不推${plannedLabel}，前面已經偏炸的了 😂`;
  }
  if (planningHeavy && alreadyHeavy) {
    return "今天我比較不推再疊炸的，你前面已經吃過了 😂";
  }
  if (planningHeavy) {
    const label = plannedLabel ?? "這個";
    return `待會想吃${label}啊……今天我比較想讓你選輕一點的。`;
  }
  return null;
}

function listTodayHeavyFoodLabels(input: GenerateCoachingAiV2Input): string[] {
  const timeline = buildGo21TemporalTimeline({
    generationLogDate: input.generationInput.logDate,
    todayMealNotes: input.generationInput.todayContext.primaryMeals.map((m) => ({
      slot: m.mealSlot,
      note: m.textNote,
    })),
    recentTurns: input.memory.recentTurns.map((t) => ({
      role: t.role,
      content: t.content,
      logDate: t.logDate,
      metadata: t.metadata,
    })),
    visionSummaries: input.recentVisionObservations ?? undefined,
  });
  return timeline.todayEaten.filter((e) => HEAVY_FOOD_RE.test(e.label)).map((e) => e.label);
}

function matchHumanShortTurnReply(
  freeMessage: string | null | undefined,
  ctx: {
    alreadyHeavyToday: boolean;
    todayHeavyFoods: string[];
    go21Goal: GenerateCoachingAiV2Input["go21Goal"];
  },
): { message: string; intention: CoachingAiV2Intention } | null {
  const msg = (freeMessage ?? "").trim();
  if (!msg) return null;

  const contract = buildGo21HumanCoachReplyContract({
    freeMessage: msg,
    alreadyHeavyToday: ctx.alreadyHeavyToday,
    channel: "free_message",
  });

  if (
    /^(?:可是我很想吃|我很想吃|好想吃|超想吃|就是想吃)[。.!！～~]*$/u.test(msg) ||
    /^可是我很想吃/.test(msg)
  ) {
    if (ctx.alreadyHeavyToday) {
      return {
        message: "哈哈我知道，那至少飲料今天先別再甜的。",
        intention: "challenge",
      };
    }
    return { message: "想吃就吃一口，別整份爆掉就好。", intention: "acknowledge" };
  }
  if (/想放縱|就是想放縱|今天放縱|放縱一下/.test(msg)) {
    return {
      message: "可以啊，今天放縱也行，但飲料先別再甜的。",
      intention: "acknowledge",
    };
  }
  if (/你覺得呢|你覺得怎樣|怎麼看/.test(msg)) {
    if (ctx.alreadyHeavyToday) {
      return { message: "以今天來說，我比較不推再炸的。", intention: "challenge" };
    }
    return { message: "我覺得可以，但別配甜的。", intention: "educate" };
  }
  if (/不要雞胸|我不吃雞胸/.test(msg)) {
    return { message: "好，雞胸先拿掉，改魚或蛋也行。", intention: "acknowledge" };
  }
  if (/^那明天呢|^明天呢/.test(msg)) {
    return { message: "明天再看，今天先這樣。", intention: "casual" };
  }
  if (/^好啦[。.!！～~]*$/.test(msg)) {
    return { message: "嗯。", intention: "acknowledge" };
  }
  if (contract.replyShape === "short_ack" && msg.length <= 6) {
    return { message: "嗯。", intention: "acknowledge" };
  }
  return null;
}

function extractPlannedFoodLabel(msg: string): string | null {
  const m = msg.match(
    /(?:想吃|準備吃|打算吃|再吃)\s*([^\n。！？?]{1,12}(?:漢堡|炸雞|炸麵|薯條|披薩|奶茶|泡麵|雞排|蛋糕))?/,
  );
  if (m?.[1]) return m[1].trim();
  const heavy = msg.match(/漢堡|炸雞|炸麵|薯條|披薩|奶茶|泡麵|雞排|蛋糕/);
  return heavy?.[0] ?? null;
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
      return "欸，這就是晚上那關 👀 先喝口水或泡杯茶撐一下，真的餓再吃也沒關係。";
    }
    return "突然想吃很常見。先喝口水撐一下，真的餓再決定要不要吃。";
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
  // Plans are handled by goal-conflict steering — not simple food ack
  if (/等一下|待會|打算|準備吃|明天|後天|想吃(?!了)/.test(text) && !/吃了|剛吃|剛剛/.test(text)) {
    return null;
  }
  const m = text.match(
    /(?:晚餐|午餐|早餐|宵夜|剛剛)?(?:吃了|吃|喝了|喝)?\s*([^\n。！？]{1,20}(?:燒餅油條|燒餅|油條|飯|麵|漢堡|奶茶|紅茶|咖啡|雞胸|泡麵|蛋糕|滷肉|沙拉|便當|壽司|炸雞|炸麵|雞排|披薩|薯條|蛋|魚|肉|湯|水餃|鍋貼))/,
  );
  if (m?.[1]) return m[1].trim();
  if (
    /^(?:晚餐|午餐|早餐|宵夜).{0,16}$/.test(text) &&
    /飯|麵|堡|茶|肉|炸|燒餅|油條|雞|排|沙拉|便當/.test(text)
  ) {
    return text.replace(/^(?:晚餐|午餐|早餐|宵夜)(?:吃了|吃)?/, "").trim() || text;
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

const HEAVY_FOOD_RE =
  /炸|漢堡|薯條|奶茶|蛋糕|泡麵|炸雞|鹹酥雞|披薩|可樂|雞排|甜甜圈|炸麵|炸物|油條|燒餅/;

function isFatLossOrientedGoal(
  goal: GenerateCoachingAiV2Input["go21Goal"] | null | undefined,
): boolean {
  if (!goal) return false;
  if (goal.primaryDirection === "fat_loss_body") return true;
  return /減脂|瘦|體脂|體態|脂肪/.test(
    `${goal.personalGoal} ${goal.primaryDirectionLabel ?? ""}`,
  );
}

function goalConflictsWithFoodChoice(
  goal: GenerateCoachingAiV2Input["go21Goal"] | null | undefined,
  foodLabel: string,
  decision: CoachingDecisionContext,
): string | null {
  if (!isFatLossOrientedGoal(goal)) return null;
  if (!HEAVY_FOOD_RE.test(foodLabel) && !hasHeavySignalsToday(decision)) return null;
  // Short judgment — no packed “下一餐蛋白質清楚” health-app skeleton
  return `收到，${foodLabel}。這餐有點兇，下一餐收一點就好。`;
}

/**
 * When photo/vision cues are enough, prefer a useful judgment over asking
 * the customer to evaluate the meal themselves.
 */
function buildMealPhotoJudgment(
  decision: CoachingDecisionContext,
  food: string | null,
  goal?: GenerateCoachingAiV2Input["go21Goal"] | null,
): string | null {
  const foods =
    food != null && food.length > 0
      ? [food]
      : decision.mealObservations.flatMap((o) => o.observedFoods).slice(0, 3);
  const label = foods.length > 0 ? foods.join("、") : null;
  const level = decision.dailyNutritionAssessment.level;
  const heavySignals = hasHeavySignalsToday(decision);
  const heavyLabel = Boolean(label && HEAVY_FOOD_RE.test(label));
  const fatLoss = isFatLossOrientedGoal(goal);

  if (heavySignals || heavyLabel || level === "off_track" || level === "needs_adjustment") {
    if (fatLoss) {
      if (label) {
        return `這張看起來是${label}。有點兇，下一餐收一點就好。`;
      }
      return "這餐有點兇，下一餐收一點就好。";
    }
    if (label) {
      return `這張看起來是${label}。有點兇，下一餐收一點就好。`;
    }
    return "這餐有點兇，下一餐收一點就好。";
  }
  if (level === "on_track" || decision.mealObservations.some((o) => o.shakeObserved)) {
    if (label) return `看到${label}了，這餐我先記著。`;
    return "這餐看起來穩，我先記著。";
  }
  if (label && decision.mealObservations.length > 0) {
    return `看到${label}了 👀 這餐我先記著。`;
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

  // Day-pattern judgment from temporal timeline — never invent tonight from stale plans
  const dayPattern = matchTodayHeavyPatternReply(input);
  if (dayPattern) return dayPattern;

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

/**
 * When today already shows a heavy pattern vs fat-loss goal, coach the day —
 * using only todayEaten / openPlansForToday (never stale hamburger history).
 */
function matchTodayHeavyPatternReply(input: GenerateCoachingAiV2Input): string | null {
  if (!isFatLossOrientedGoal(input.go21Goal)) return null;
  const timeline = buildGo21TemporalTimeline({
    generationLogDate: input.generationInput.logDate,
    todayMealNotes: input.generationInput.todayContext.primaryMeals.map((m) => ({
      slot: m.mealSlot,
      note: m.textNote,
    })),
    recentTurns: input.memory.recentTurns.map((t) => ({
      role: t.role,
      content: t.content,
      logDate: t.logDate,
      metadata: t.metadata,
    })),
    currentMessage: input.freeMessage,
  });
  const heavyEaten = timeline.todayEaten.filter((e) => HEAVY_FOOD_RE.test(e.label));
  const heavyOpen = timeline.openPlansForToday.find((p) => HEAVY_FOOD_RE.test(p.label));
  if (heavyOpen && heavyEaten.length > 0) {
    return `今天我比較不推${heavyOpen.label}，你${heavyEaten[0].label}已經吃過了 😂`;
  }
  if (heavyEaten.length >= 2 || (heavyEaten.length >= 1 && hasHeavySignalsToday(input.decisionContext))) {
    const label = heavyEaten[heavyEaten.length - 1]?.label ?? "這餐";
    return `收到，${label}。今天前面有點兇，下一餐收一點就好。`;
  }
  if (heavyEaten.length === 1) {
    return `收到，${heavyEaten[0].label}。這餐有點兇，下一餐收一點就好。`;
  }
  return null;
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
  const occupation = input.generationInput.profileMemory.customerContext?.occupation;
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
  const understanding = input.longitudinalUnderstanding;
  const fromUnderstanding = understanding
    ? {
        majorPatterns: understanding.activeInsights.map((i) => i.statement).slice(0, 5),
        whatWorked: understanding.strategiesWorked.slice(0, 5),
        whatDidNot: understanding.strategiesFailed.slice(0, 5),
        recurringDifficulties: understanding.activeInsights
          .filter((i) => /difficulty|trigger|difficulty/.test(i.category) || i.category === "difficulty" || i.category === "trigger")
          .map((i) => i.statement)
          .slice(0, 5),
      }
    : synthesizeDay21Understanding(null);

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
    fromUnderstanding.majorPatterns.length > 0
      ? fromUnderstanding.majorPatterns.slice(0, 3)
      : patterns.length > 0
        ? patterns.slice(0, 3)
        : hyp.slice(0, 2).length > 0
          ? hyp.slice(0, 2)
          : ["回報節奏有建立，但飲食型態證據仍有限"];

  const goalWish =
    input.go21Goal?.originalPersonalGoal ||
    input.go21Goal?.personalGoal ||
    input.generationInput.profileMemory.goal ||
    "減脂／調整生活節奏";

  const whatWorked =
    fromUnderstanding.whatWorked.length > 0
      ? fromUnderstanding.whatWorked.slice(0, 3)
      : worked.length > 0
        ? worked.slice(0, 3)
        : ["願意誠實回報"];
  const whatDidNot =
    fromUnderstanding.whatDidNot.length > 0
      ? fromUnderstanding.whatDidNot.slice(0, 3)
      : failed.length > 0
        ? failed.slice(0, 3)
        : ["尚未形成穩定的替代策略"];
  const recurringDifficulties =
    fromUnderstanding.recurringDifficulties.length > 0
      ? fromUnderstanding.recurringDifficulties.slice(0, 3)
      : failed.length > 0
        ? failed.slice(0, 3)
        : memory.openLoops.map((l) => l.subject).slice(0, 2).length
          ? memory.openLoops.map((l) => l.subject).slice(0, 2)
          : ["偶發偏離仍會出現"];

  const reflection = {
    startingSituation: statements[0] ?? `21 天前，你希望：${goalWish}`,
    majorPatterns,
    meaningfulChanges: whatWorked,
    recurringDifficulties,
    triggers: [
      ...memory.durableMemory.filter((m) => m.category === "trigger").map((m) => m.content),
      ...(understanding?.activeInsights
        .filter((i) => i.category === "trigger")
        .map((i) => i.statement) ?? []),
    ].slice(0, 3),
    experimentsAttempted: [
      ...(understanding?.openExperiments.map((e) => e.description) ?? []),
      ...memory.durableMemory
        .filter((m) => m.category === "strategy_worked" || m.category === "strategy_failed")
        .map((m) => m.content),
    ].slice(0, 4),
    whatWorked,
    whatDidNot,
    sustainable: ["維持每日回報", "對飢餓時段保持覺察"].slice(0, 3),
    nextActions: [
      majorPatterns[0] ? `繼續觀察：${majorPatterns[0].slice(0, 40)}` : "維持回報節奏",
      whatWorked[0] ? `延續對你有用的：${whatWorked[0].slice(0, 36)}` : "遇到偏離時先標出時段，再決定要不要調",
      "需要時找真人教練一起看卡關點",
    ].slice(0, 3),
  };

  const coachMessage = [
    "21 天先停在這裡。不是畢業典禮講稿，是根據我們實際走過的內容。",
    `一開始：${reflection.startingSituation}`,
    `我看到的主要模式：${reflection.majorPatterns.join("；")}`,
    `對你比較有用的做法：${reflection.whatWorked.join("；")}`,
    `比較沒那麼有效的：${reflection.whatDidNot.join("；")}`,
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
