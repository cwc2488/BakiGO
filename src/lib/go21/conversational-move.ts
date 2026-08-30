/**
 * Natural Conversation Layer — understand the conversational move before coaching.
 *
 * Short Taiwanese replies often mean: decide, correct, confirm, reject, continue.
 * When prior coach turn set a topic (e.g. dinner hamburger), 「吃沙拉」 is usually
 * a decision — not a fresh meal report that needs nutrition education.
 */

export const GO21_CONVERSATIONAL_MOVES = [
  "correction",
  "misunderstanding_repair",
  "decision",
  "confirmation",
  "rejection",
  "continuation",
  "temporal_correction",
  "answer_to_question",
  "acknowledgement",
] as const;

export type Go21ConversationalMove = (typeof GO21_CONVERSATIONAL_MOVES)[number];

export type Go21ConversationalMoveResult = {
  move: Go21ConversationalMove;
  /** Soft confidence — heuristics, not a rigid classifier. */
  confidence: "high" | "medium" | "low";
  /** Extracted decision/correction content when present. */
  decidedFood: string | null;
  /** Temporal shift when present (e.g. 明天). */
  temporalHint: string | null;
  /** Why this move was chosen (for tests / debug). */
  reason: string;
  /** Prior coach was actively discussing food / alternatives / a question. */
  priorCoachWasCoachingFood: boolean;
};

/** Health-app / SOP voice — avoid unless genuinely warranted this turn. */
export const GO21_HEALTH_APP_VOICE_RE =
  /朝著目標邁進|這樣能更均衡|考慮搭配一些蛋白質|更好地控制整體熱量|整體熱量|營養更均衡|為了你的目標|加油[！!]?(?:\s|$)|繼續保持下去|很棒的選擇[，,]?\s*這樣/u;

const CORRECTION_RE =
  /我是說|不是啦|不是阿|不是啊|你搞錯|搞錯了|聽錯|你沒聽懂|沒聽懂|我的意思是|我是指|講錯了|弄錯了|搞误会|搞誤會/u;

const TEMPORAL_CORRECTION_RE =
  /我是說(?:明天|後天|昨天|今天|今晚|明早)|不是(?:今天|今晚|明天)|改成?(?:明天|後天|昨天)/u;

const CONFIRM_RE = /^(?:好|好啊|好呀|好的|可以|可以啊|可以呀|嗯|嗯嗯|ok|OK|Ok|行|沒問題|就這樣|對|對啊|對呀|是|是啊)[。.!！～~]*$/u;

const REJECT_RE =
  /^(?:不要|不要啦|算了|先不要|先算了|不用|不用了|改天|再說|沒有|先這樣)[。.!！～~]*$/u;

const ACK_RE = /^(?:收到|瞭解|了解|知道了|嗯哼|哈哈|哈|😂|👍|👌)[。.!！～~]*$/u;

const CONTINUATION_RE = /^(?:那|那[…]…?)?(?:雞排|漢堡|沙拉|便當|滷肉飯|炸雞|麵|飯|甜點|飲料|宵夜).{0,6}呢[？?]?$/u;

const DECISION_FOOD_RE =
  /^(?:那?[我們]?[就]?|好[，,]?\s*|那就|改成?|改吃|換成?|改成吃)?(?:吃|喝)?\s*([^\n。！？?]{1,16}(?:沙拉|雞胸|便當|滷肉飯|漢堡|雞排|麵|飯|粥|燙青菜|水煮蛋|優格|水果|茶|豆漿)[^\n。！？?]{0,8})$/u;

const SHORT_FOOD_CHOICE_RE =
  /^(?:吃|喝)?\s*([^\n。！？?\s]{1,12}(?:沙拉|雞胸|便當|滷肉飯|漢堡|雞排|麵|粥|水果|茶))\s*[。.!！]*$/u;

const MISUNDERSTAND_RE = /你沒聽懂|聽不懂嗎|講清楚|我不是這個意思|你誤會/u;

export type Go21RecentTurnLike = {
  role: string;
  content: string;
};

/**
 * Detect the conversational move for this customer message given recent turns.
 * Returns null when the turn should fall through to normal coaching reasoning.
 */
export function detectGo21ConversationalMove(input: {
  freeMessage: string | null | undefined;
  recentTurns: Go21RecentTurnLike[];
}): Go21ConversationalMoveResult | null {
  const msg = (input.freeMessage ?? "").trim();
  if (!msg) return null;

  const priorCoach = findLastCoachTurn(input.recentTurns);
  const priorCoachText = priorCoach?.content?.trim() ?? "";
  const priorCoachWasCoachingFood = priorCoachDiscussedFood(priorCoachText);
  const priorAskedQuestion = /[？?]\s*$/u.test(priorCoachText) || /要不要|好不好|怎麼想|你覺得/.test(priorCoachText);

  // Explicit misunderstanding repair
  if (MISUNDERSTAND_RE.test(msg)) {
    return {
      move: "misunderstanding_repair",
      confidence: "high",
      decidedFood: extractFoodMention(msg),
      temporalHint: extractTemporalHint(msg),
      reason: "customer_says_misunderstood",
      priorCoachWasCoachingFood,
    };
  }

  // Temporal correction (subset of correction — handle first for clearer replies)
  if (TEMPORAL_CORRECTION_RE.test(msg) || (CORRECTION_RE.test(msg) && /明天|後天|昨天|今晚/.test(msg))) {
    return {
      move: "temporal_correction",
      confidence: "high",
      decidedFood: extractFoodMention(msg),
      temporalHint: extractTemporalHint(msg),
      reason: "temporal_correction",
      priorCoachWasCoachingFood,
    };
  }

  // Correction of coach misunderstanding (我是說晚餐改成沙拉)
  if (
    CORRECTION_RE.test(msg) ||
    ((/改成|改吃|換成/.test(msg) || /我是說/.test(msg)) && priorCoachWasCoachingFood)
  ) {
    const food = extractFoodMention(msg) ?? extractDecisionFood(msg);
    if (CORRECTION_RE.test(msg) || (food && priorCoachWasCoachingFood)) {
      return {
        move: "correction",
        confidence: CORRECTION_RE.test(msg) ? "high" : "medium",
        decidedFood: food,
        temporalHint: extractTemporalHint(msg),
        reason: "correction_of_prior_interpretation",
        priorCoachWasCoachingFood,
      };
    }
  }

  // Bare confirmation / rejection / ack — only meaningful after coach spoke
  if (priorCoachText && CONFIRM_RE.test(msg)) {
    return {
      move: "confirmation",
      confidence: "high",
      decidedFood: null,
      temporalHint: null,
      reason: "short_confirmation",
      priorCoachWasCoachingFood,
    };
  }
  if (priorCoachText && REJECT_RE.test(msg)) {
    return {
      move: "rejection",
      confidence: "high",
      decidedFood: null,
      temporalHint: null,
      reason: "short_rejection",
      priorCoachWasCoachingFood,
    };
  }
  if (priorCoachText && ACK_RE.test(msg)) {
    return {
      move: "acknowledgement",
      confidence: "high",
      decidedFood: null,
      temporalHint: null,
      reason: "short_acknowledgement",
      priorCoachWasCoachingFood,
    };
  }

  // Continuation question about another food after coach discussed options
  if (priorCoachWasCoachingFood && CONTINUATION_RE.test(msg)) {
    return {
      move: "continuation",
      confidence: "high",
      decidedFood: extractFoodMention(msg),
      temporalHint: null,
      reason: "continuation_about_related_food",
      priorCoachWasCoachingFood,
    };
  }

  // Decision: short food choice after coach discussed dinner/alternatives/hamburger
  if (priorCoachWasCoachingFood) {
    const decided = extractDecisionFood(msg) ?? (SHORT_FOOD_CHOICE_RE.test(msg) ? msg.replace(/^吃/, "").trim() : null);
    if (decided && msg.length <= 24 && !/[？?]/.test(msg) && !/為什麼|怎麼辦|菜單/.test(msg)) {
      // Prefer decision over re-coaching hamburger
      return {
        move: "decision",
        confidence: msg.length <= 12 || /那|改|就/.test(msg) ? "high" : "medium",
        decidedFood: decided.replace(/^(?:吃|喝)/, "").trim() || decided,
        temporalHint: null,
        reason: "short_decision_after_coach_food_topic",
        priorCoachWasCoachingFood,
      };
    }
  }

  // Answer to prior coach question (short non-food)
  if (priorAskedQuestion && msg.length <= 20 && !/為什麼|怎麼辦/.test(msg) && !/[？?]/.test(msg)) {
    return {
      move: "answer_to_question",
      confidence: "medium",
      decidedFood: extractFoodMention(msg),
      temporalHint: null,
      reason: "answer_to_prior_coach_question",
      priorCoachWasCoachingFood,
    };
  }

  return null;
}

/** True when this move should suppress re-coaching / health-app education this turn. */
export function conversationalMovePrefersNaturalAck(move: Go21ConversationalMove): boolean {
  return (
    move === "correction" ||
    move === "misunderstanding_repair" ||
    move === "decision" ||
    move === "confirmation" ||
    move === "rejection" ||
    move === "acknowledgement" ||
    move === "temporal_correction" ||
    move === "answer_to_question"
  );
}

export type Go21NaturalReplyContext = {
  /** Today's already-eaten heavy foods (for opinionated continuation). */
  todayHeavyFoods?: string[];
  alreadyHeavyToday?: boolean;
};

/**
 * Compose a short natural reply for a detected move (fixture / offline path).
 * Thin helpers that stay human and stop — not a production speech template bank.
 * Live OpenAI path should follow humanCoachReplyContract, not copy these lines.
 */
export function composeGo21NaturalConversationalReply(
  result: Go21ConversationalMoveResult,
  context: Go21NaturalReplyContext = {},
): string {
  const food = result.decidedFood ? cleanFood(result.decidedFood) : null;
  const priorHeavy = context.todayHeavyFoods?.[0] ?? null;

  switch (result.move) {
    case "misunderstanding_repair":
    case "correction":
      if (food) {
        return `喔，我剛剛理解錯了 😂\n你是說晚餐改吃${food}。可以啊。`;
      }
      if (result.temporalHint) {
        return `喔，我剛剛聽錯時間了 😂 你是說${result.temporalHint}。懂了。`;
      }
      return "喔，我剛剛理解錯了 😂 你剛剛那句我重新聽過了。";

    case "temporal_correction":
      return result.temporalHint
        ? `喔，你是說${result.temporalHint}。好，我改過來。`
        : "喔，時間我搞錯了。好，我改過來。";

    case "decision":
      if (food) {
        // Do NOT re-analyze the previous hamburger / add protein lecture
        return `好，那晚餐就${food}。`;
      }
      return "好，那就這樣。";

    case "confirmation":
      return "嗯，好。";

    case "rejection":
      return "好，那先不算。";

    case "acknowledgement":
      return "嗯。";

    case "continuation":
      if (food) {
        // Opinion first — no risk→alt→question pack
        if (/雞排|漢堡|炸|鹹酥雞|披薩/.test(food)) {
          if (context.alreadyHeavyToday && priorHeavy) {
            return `今天我比較不推${food}，你${priorHeavy}已經吃過了 😂`;
          }
          if (context.alreadyHeavyToday) {
            return `今天我比較不推${food}，你前面已經偏炸的了 😂`;
          }
          return `你今天真的很想吃炸的齁 😂`;
        }
        return `${food}也可以。`;
      }
      return "嗯？你是想換成那個嗎。";

    case "answer_to_question":
      if (food) return `好，${food}。`;
      return "好，我知道了。";
  }
}

/** Prompt guidance block — principles, not a script. */
export function buildConversationalMovePromptGuidance(
  result: Go21ConversationalMoveResult | null,
): string | null {
  if (!result) {
    return "先判斷這一輪是不是對話動作（更正／決定／確認／拒絕／接話／時間更正）。若是，先接住對話，不要重播上一輪教練分析。";
  }
  const bits = [
    `conversationalMove=${result.move}`,
    `confidence=${result.confidence}`,
    result.decidedFood ? `decidedFood=${result.decidedFood}` : null,
    result.temporalHint ? `temporalHint=${result.temporalHint}` : null,
    result.move === "continuation"
      ? "接話：給一句有觀點的話就好（可不推／可折衷／可輕吐槽），不要長篇風險說明＋替代清單＋追問。"
      : "先理解對話動作再決定要不要教練。更正時先認錯並更新理解，不要辯護或重講舊解釋。決定／確認時短回即可，不要加熱量／蛋白質／均衡／加油。",
  ];
  return bits.filter(Boolean).join("；");
}

export function coachMessageSoundsLikeHealthApp(message: string): boolean {
  return GO21_HEALTH_APP_VOICE_RE.test(message);
}

function findLastCoachTurn(turns: Go21RecentTurnLike[]): Go21RecentTurnLike | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === "coach") return turns[i];
  }
  return null;
}

function priorCoachDiscussedFood(text: string): boolean {
  if (!text) return false;
  return (
    /漢堡|沙拉|晚餐|午餐|早餐|宵夜|炸|雞胸|便當|蛋白質|換|改|菜單|吃|偏重|負擔/.test(text) ||
    /待會|等一下|今晚|這一餐/.test(text)
  );
}

function extractDecisionFood(msg: string): string | null {
  const m1 = msg.match(DECISION_FOOD_RE);
  if (m1?.[1]) return cleanFood(m1[1]);
  const m2 = msg.match(SHORT_FOOD_CHOICE_RE);
  if (m2?.[1]) return cleanFood(m2[1]);
  // 「那我吃沙拉」「晚餐改成沙拉」「改吃沙拉」
  const m3 = msg.match(
    /(?:改成|改吃|換成|吃|喝)\s*([^\n。！？?]{1,12}(?:沙拉|雞胸|便當|滷肉飯|漢堡|雞排|麵|粥|水果|茶))/,
  );
  if (m3?.[1]) return cleanFood(m3[1]);
  return null;
}

function extractFoodMention(msg: string): string | null {
  const m = msg.match(
    /([^\n。！？?\s]{0,8}(?:沙拉|雞胸|便當|滷肉飯|漢堡|雞排|炸雞|麵|粥|水果|茶|豆漿|燙青菜))/,
  );
  return m?.[1] ? cleanFood(m[1]) : null;
}

function extractTemporalHint(msg: string): string | null {
  if (/明天/.test(msg)) return "明天";
  if (/後天/.test(msg)) return "後天";
  if (/昨天/.test(msg)) return "昨天";
  if (/今晚|今天晚上/.test(msg)) return "今晚";
  if (/今天/.test(msg)) return "今天";
  return null;
}

function cleanFood(value: string): string {
  return value
    .replace(/^(?:那?[我們]?[就]?|好|改成?|換成?|改吃|吃|喝|晚餐|午餐|早餐)/, "")
    .replace(/[。.!！～~\s]+$/g, "")
    .trim();
}
