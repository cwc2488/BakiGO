/**
 * Human Coach Voice — reply-shape contract for Go21.
 *
 * Internal reasoning stays rich (goal, timeline, memory, moves, understanding).
 * Customer-facing language must sound like a mature LINE private coach:
 * opinion OK, short OK, silence OK — not a packed nutrition-response format.
 *
 * This is NOT a phrase blacklist and NOT a template bank for production speech.
 * It tells the live model what *shape* is appropriate this turn.
 */

import type { Go21ConversationalMoveResult } from "@/lib/go21/conversational-move";
import { detectGo21ConversationalMove } from "@/lib/go21/conversational-move";

export type Go21ReplyShape =
  | "one_beat"
  | "short_opinion"
  | "short_ack"
  | "light_compromise"
  | "direct_answer"
  | "explain_when_needed"
  | "serious_safety"
  | "free";

export type Go21HumanCoachReplyContract = {
  replyShape: Go21ReplyShape;
  /** Soft length hint for the model — not a hard character quota. */
  lengthHint: "one_sentence" | "short" | "normal" | "longer_ok";
  /** What this turn must NOT pack by default. */
  doNotForce: string[];
  /** Positive coaching permission. */
  may: string[];
  /** One-line guidance for the live prompt. */
  guidance: string;
};

const HEALTH_APP_STRUCTURE_RE =
  /(?:偏離|影響|偏重).{0,40}(?:目標|減脂).{0,80}(?:搭配|建議|可以選|換成).{0,80}(?:蛋白質|蔬菜|沙拉).{0,80}(?:保護|護住|邁進|加油)?/u;

const PACKED_COACHING_BEATS_RE =
  /(?:以你|以減脂|對你的目標).{0,30}(?:偏重|影響|負擔).{0,60}(?:下一餐|建議|換成|可以選).{0,60}(?:蛋白質|雞胸|蔬菜|清淡)/u;

/**
 * Heuristic for eval/tests: multi-beat health-app structure, not just banned slogans.
 * Do not use this to rewrite production replies into templates.
 */
export function coachMessageLooksLikeHealthAppStructure(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (HEALTH_APP_STRUCTURE_RE.test(text) || PACKED_COACHING_BEATS_RE.test(text)) return true;
  const hasRisk = /偏重|負擔會重|影響.*目標|偏離.*目標|對減脂/.test(text);
  const hasAlt = /換成|建議|可以選|搭配|蛋白質清楚|雞胸|生菜/.test(text);
  const hasEncourage = /加油|繼續保持|朝著目標|保護目標|護住目標/.test(text);
  const hasQuestion = /[？?]\s*$/u.test(text) || /要不要|你覺得|還是/.test(text);
  const beatCount = [hasRisk, hasAlt, hasEncourage, hasQuestion].filter(Boolean).length;
  // Three or more packed beats in one ordinary turn ≈ health-app format
  if (beatCount >= 3 && text.length > 40) return true;
  // Risk + alternative + education-ish length without needing the third slogan
  if (hasRisk && hasAlt && text.length > 70 && /均衡|熱量|營養|目標/.test(text)) return true;
  return false;
}

export function buildGo21HumanCoachReplyContract(input: {
  freeMessage?: string | null;
  recentTurns?: Array<{ role: string; content: string }>;
  conversationalMove?: Go21ConversationalMoveResult | null;
  channel?: "daily_log" | "free_message" | "day21";
  alreadyHeavyToday?: boolean;
}): Go21HumanCoachReplyContract {
  const msg = (input.freeMessage ?? "").trim();
  const move =
    input.conversationalMove ??
    detectGo21ConversationalMove({
      freeMessage: msg,
      recentTurns: input.recentTurns ?? [],
    });

  const baseDoNotForce = [
    "風險說明",
    "營養教育",
    "替代建議",
    "鼓勵語句",
    "Goal 口號",
    "收尾問句",
  ];

  if (input.channel === "day21") {
    return {
      replyShape: "explain_when_needed",
      lengthHint: "longer_ok",
      doNotForce: ["空洞畢業詞", "勵志長文"],
      may: ["用真實理解收束", "點出學到的事"],
      guidance: "Day21 可以講清楚；仍避免客服／健康 App 腔。",
    };
  }

  if (!msg) {
    return shortOpinionContract(baseDoNotForce, "無文字時短回即可。");
  }

  // Safety / serious — allow seriousness (caller may already short-circuit)
  if (/自殺|自殘|厭食|暴食.*吐|瀉藥|極端節食/.test(msg)) {
    return {
      replyShape: "serious_safety",
      lengthHint: "normal",
      doNotForce: ["玩笑", "俏皮"],
      may: ["認真回應", "必要時升級真人"],
      guidance: "安全優先；語氣認真，不要硬短。",
    };
  }

  // Detailed nutrition question — explain properly
  if (/為什麼|原理|差在哪|有什麼幫助|怎麼算|熱量大概|蛋白質要吃多少/.test(msg)) {
    return {
      replyShape: "explain_when_needed",
      lengthHint: "longer_ok",
      doNotForce: ["勵志", "Goal 口號", "硬加問句"],
      may: ["把原理講清楚", "給具體數字或例子"],
      guidance: "這是營養／原理問題——回答清楚；不要塞鼓勵或問句湊篇幅。",
    };
  }

  if (move) {
    switch (move.move) {
      case "confirmation":
      case "acknowledgement":
      case "rejection":
        return {
          replyShape: "short_ack",
          lengthHint: "one_sentence",
          doNotForce: baseDoNotForce,
          may: ["一句接住", "停住"],
          guidance: "短確認／拒絕／嗯——一句接住就停。不要重播上一輪分析。",
        };
      case "decision":
      case "correction":
      case "misunderstanding_repair":
      case "temporal_correction":
      case "answer_to_question":
        return {
          replyShape: "one_beat",
          lengthHint: "one_sentence",
          doNotForce: baseDoNotForce,
          may: ["承認理解", "短確認決定", "改時間"],
          guidance: "先接住對話動作，一句到兩句；不要重講舊餐分析，不要蛋白質／均衡課。",
        };
      case "continuation":
        return {
          replyShape: input.alreadyHeavyToday ? "short_opinion" : "short_opinion",
          lengthHint: "one_sentence",
          doNotForce: [...baseDoNotForce, "完整風險→替代→問句流程"],
          may: ["直接講推不推", "輕吐槽", "給一個折衷", "停住"],
          guidance:
            "接話（那雞排呢）——給一句有觀點的話即可。可以不推、可以折衷、可以笑一下；不要長篇解釋＋替代清單＋追問。",
        };
    }
  }

  // Desire / indulgence / preference pushback — human coach attitudes
  if (/可是我很想吃|好想吃|超想吃|就是想吃/.test(msg)) {
    return {
      replyShape: "light_compromise",
      lengthHint: "short",
      doNotForce: ["說教長文", "Goal 口號", "完整營養課"],
      may: ["懂他想吃", "給一個折衷", "堅持今天不推", "停住"],
      guidance: "對方在堅持想吃——可以懂、可以折衷、可以仍不推；不要講義。",
    };
  }
  if (/想放縱|就是想放縱|今天放縱|放縱一下/.test(msg)) {
    return {
      replyShape: "light_compromise",
      lengthHint: "short",
      doNotForce: ["羞辱", "勵志長文", "禁止一切"],
      may: ["允許有範圍的放縱", "劃一條底線", "停住"],
      guidance: "放縱意圖——可以答應並劃一條線（例如飲料別再甜）；不要否定情緒。",
    };
  }
  if (/你覺得呢|你覺得怎樣|怎麼看/.test(msg)) {
    return {
      replyShape: "short_opinion",
      lengthHint: "short",
      doNotForce: ["中立長文", "把球踢回去"],
      may: ["直接給意見", "說推或不推"],
      guidance: "對方問你覺得呢——給清楚觀點，短答；不要反問搪塞。",
    };
  }
  if (/不要雞胸|不要.*肉|我不吃|超討厭/.test(msg)) {
    return {
      replyShape: "one_beat",
      lengthHint: "one_sentence",
      doNotForce: ["說服他改吃雞胸", "營養教育"],
      may: ["記住偏好", "換別的蛋白質說法", "短回"],
      guidance: "偏好拒絕——記住並換方向，不要硬推同一食物。",
    };
  }
  if (/^那明天呢|^明天呢|那後天/.test(msg)) {
    return {
      replyShape: "short_opinion",
      lengthHint: "short",
      doNotForce: baseDoNotForce,
      may: ["談明天", "短答"],
      guidance: "時間接話——短答明天／後天怎麼看；不要重播今天整套分析。",
    };
  }
  if (/^好啦|^啦$|^呵呵|^哈哈/.test(msg) && msg.length <= 6) {
    return {
      replyShape: "short_ack",
      lengthHint: "one_sentence",
      doNotForce: baseDoNotForce,
      may: ["嗯", "好", "停住"],
      guidance: "語氣收尾——極短回，不要再開課。",
    };
  }

  // Menu request — actionable but not a lecture pack
  if (/菜單|吃什麼好|有什麼推薦|今晚吃什麼/.test(msg)) {
    return {
      replyShape: "direct_answer",
      lengthHint: "normal",
      doNotForce: ["勵志", "Goal 口號", "硬加問句"],
      may: ["給一兩組可執行選項"],
      guidance: "菜單請求——給可執行選項；不要空話或萬用雞胸沙拉口號堆疊。",
    };
  }

  // Planning heavy food after already heavy day — opinion first, alternative optional
  if (
    input.alreadyHeavyToday &&
    /想吃|待會|等一下|打算/.test(msg) &&
    /雞排|漢堡|炸|鹹酥雞|披薩|奶茶|宵夜/.test(msg)
  ) {
    return {
      replyShape: "short_opinion",
      lengthHint: "short",
      doNotForce: [...baseDoNotForce, "必須給替代清單"],
      may: ["直接說今天不推", "點出今天已炸過", "可選給一個折衷", "停住"],
      guidance:
        "今天已偏重又要再疊——先講清楚觀點（可不推）。替代是可選的一句，不是必備段落；不要風險＋教育＋替代＋鼓勵＋問句全包。",
    };
  }

  return {
    replyShape: "free",
    lengthHint: "short",
    doNotForce: baseDoNotForce,
    may: ["短確認", "意見", "建議", "幾乎不說", "需要時才解釋"],
    guidance:
      "預設短回、有觀點。多數日常回合一句到兩句就夠。不要預設塞滿風險說明＋營養教育＋替代＋鼓勵＋問句。",
  };
}

function shortOpinionContract(
  doNotForce: string[],
  guidance: string,
): Go21HumanCoachReplyContract {
  return {
    replyShape: "short_opinion",
    lengthHint: "short",
    doNotForce,
    may: ["意見", "短回", "停住"],
    guidance,
  };
}

/** Prompt block injected beside conversationalMove — shape, not scripted lines. */
export function formatHumanCoachReplyContractForPrompt(
  contract: Go21HumanCoachReplyContract,
): Record<string, unknown> {
  return {
    replyShape: contract.replyShape,
    lengthHint: contract.lengthHint,
    doNotForce: contract.doNotForce,
    may: contract.may,
    guidance: contract.guidance,
  };
}
