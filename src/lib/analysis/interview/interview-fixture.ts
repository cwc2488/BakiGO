import {
  blankTurnOutput,
  type InterviewAiTurn,
  type InterviewSessionState,
  type UnderstandingPatchItem,
} from "@/lib/analysis/interview/interview-contract";
import { INTERVIEW_UNDERSTANDING_KEYS } from "@/lib/analysis/interview/understanding-state";
import { EXPLAIN_AND_RETURN_CONTROL } from "@/lib/analysis/interview/interview-reasoner";

let activeFixtureTurnId = "u_1";

function withUpdate(base: InterviewAiTurn, patch: Partial<InterviewAiTurn> & {
  understanding_update?: Partial<Record<string, { value: string; kind: "unknown" | "fact" | "inference" }>>;
}): InterviewAiTurn {
  const update = patch.understanding_update;
  let understanding_patch: UnderstandingPatchItem[] = patch.understanding_patch ?? [];
  if (update) {
    understanding_patch = Object.entries(update)
      .filter((entry): entry is [string, { value: string; kind: "fact" | "inference" }] => {
        const v = entry[1];
        return Boolean(v && v.kind !== "unknown" && v.value);
      })
      .map(([field, v]) => ({
        field: field as UnderstandingPatchItem["field"],
        value: v.value,
        kind: v.kind,
        evidence_turn_ids: [activeFixtureTurnId],
        reasoning: v.kind === "inference" ? "fixture hypothesis" : "user stated",
      }));
  }
  const { understanding_update: _ignored, ...rest } = patch;
  return {
    ...base,
    ...rest,
    understanding_patch,
    conversion_signal: patch.conversion_signal ?? base.conversion_signal,
    safety_signal: patch.safety_signal ?? base.safety_signal,
  };
}

function fact(value: string) {
  return { value, kind: "fact" as const };
}
function inf(value: string) {
  return { value, kind: "inference" as const };
}

export function detectUserQuestionType(text: string): InterviewAiTurn["conversion_signal"]["type"] | "user_question" | null {
  const t = text.trim();
  if (/需要多久|要多久|幾週|多久才|要幾天/.test(t)) return "duration_question";
  if (/要怎麼做|怎麼開始|那要怎麼|怎麼進行/.test(t)) return "how_it_works";
  if (/多少錢|貴不貴|費用|價格/.test(t)) return "cost_question";
  if (/[?？]|嗎/.test(t) && /有人.*幫|陪我|教練|有人可以/.test(t)) return "support_interest";
  if (/\?|？/.test(t) && t.length < 40) return "user_question";
  return null;
}

export function detectProgrammaticSafety(text: string): boolean {
  return /醫生|醫師|血糖|紅字|吃藥|糖尿病|疾病|手術|懷孕/.test(text);
}

/**
 * Deterministic fixture used in tests / ANALYSIS_AI_USE_FIXTURE.
 * Encodes Golden A/B/C reasoning quality without requiring exact live wording.
 */
export function buildInterviewFixtureTurn(input: {
  state: InterviewSessionState;
  currentAnswer: string;
  userTurnId: string;
}): InterviewAiTurn {
  const text = input.currentAnswer.trim();
  activeFixtureTurnId = input.userTurnId;
  const base = blankTurnOutput();
  const qType = detectUserQuestionType(text);
  const medical = detectProgrammaticSafety(text);

  if (qType === "duration_question") {
    return withUpdate(base, {
      user_question_detected: true,
      next_action: "answer_then_ask",
      conversion_signal: { detected: true, type: "duration_question" },
      stage: "readiness",
      assistant_response:
        "這沒有固定週期。需要多久，取決於你想改到什麼程度、以及你實際做得到的改變是什麼。你現在問這個，比較像是在評估這件事會不會太久、太辛苦。",
      follow_up_question: "如果不是一次做到理想身材，而是先用一小段時間看看自己能不能開始有變化，你會比較願意試嗎？",
      reason_for_next_question: "User asked duration; answer without promise then probe trial readiness.",
      understanding_update: {
        readiness_stage: inf("在評估投入時間與辛苦程度"),
      },
    });
  }

  if (qType === "cost_question") {
    return withUpdate(base, {
      user_question_detected: true,
      next_action: "answer_then_ask",
      conversion_signal: { detected: true, type: "cost_question" },
      assistant_response: "這一階段不是在談費用或方案，我現在也沒有要向你收費。你問這個，比較像在評估划不划算、值不值得開始。",
      follow_up_question: null,
      reason_for_next_question: "User asked cost; answer first, no questionnaire follow-up required.",
    });
  }

  if (qType === "how_it_works") {
    return withUpdate(base, {
      user_question_detected: true,
      next_action: "answer_then_ask",
      conversion_signal: { detected: true, type: "how_it_works" },
      assistant_response: "我現在還在了解你卡住的方式，不會先丟一套計畫。",
      follow_up_question: null,
      reason_for_next_question: "User asked how it works; answer first.",
    });
  }

  if (/好像可以試試看|可以試試看/.test(text) && !/簡單方式/.test(text)) {
    return withUpdate(base, {
      next_action: "complete",
      stage: "complete",
      conversion_signal: { detected: true, type: "trial_interest" },
      assistant_response: "聽起來你不是完全不想開始，而是要一個你做得到、又不用一次放棄喜歡事物的方式。",
      follow_up_question: null,
      reason_for_next_question: "Trial interest + enough understanding.",
      understanding_update: {
        readiness_stage: fact("願意先試試看"),
        acceptable_change: inf("低摩擦、可保留喜歡食物的調整"),
      },
      evidence: [{ claim: text, source_turn_id: input.userTurnId, type: "fact" }],
    });
  }

  // Golden A — first-person wedding intent only. 「朋友都結婚了」 is not this.
  if (
    /結婚|婚宴|嫁|娶|婚禮/.test(text) &&
    !/好看|一輩子|放棄|沒變化|不適合/.test(text) &&
    !/朋友.{0,16}結婚|同事.{0,12}結婚|一個一個都結婚|大家都結婚/.test(text)
  ) {
    return withUpdate(base, {
      stage: "meaning_discovery",
      next_action: "ask",
      assistant_response: "你把改變跟結婚連在一起了。",
      follow_up_question: "你現在覺得自己的身材，跟「想結婚」之間最大的關係是什麼？",
      reason_for_next_question: "Marriage stated; body-marriage link unknown.",
      understanding_update: {
        immediate_trigger: fact("想結婚"),
        deeper_motivation: inf("結婚相關的外在形象／人生事件"),
      },
      evidence: [{ claim: "想結婚", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/婚宴/.test(text) && /好看/.test(text)) {
    return withUpdate(base, {
      stage: "meaning_discovery",
      next_action: "ask",
      assistant_response: "重點比較不像「減脂」本身，而是婚宴那天你希望自己看起來怎樣。",
      follow_up_question: "為什麼「婚宴要好看」對你特別重要？",
      reason_for_next_question: "Appearance at wedding is known; one meaning question, no trivia.",
      understanding_update: {
        stated_goal: fact("婚宴要好看"),
        desired_future: inf("婚宴留下自己理想中的樣子"),
      },
      evidence: [{ claim: "婚宴要好看", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/一輩子|只有一次/.test(text)) {
    return withUpdate(base, {
      stage: "barrier_discovery",
      next_action: "ask",
      assistant_response: "對你來說這件事的重量很大，比較像一生可能只有一次的畫面。",
      follow_up_question: "如果婚宴就在幾個月後，你覺得現在最可能讓你最後還是瘦不下來的原因是什麼？",
      reason_for_next_question: "Emotional significance sufficient; move to barrier.",
      understanding_update: {
        emotional_significance: fact("一輩子可能只有一次"),
      },
      evidence: [{ claim: "一輩子只有一次", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/很容易放棄|容易放棄|會放棄/.test(text) && !/沒變化|不適合/.test(text)) {
    return withUpdate(base, {
      stage: "mechanism_discovery",
      next_action: "ask",
      assistant_response: "你不是完全沒動力，而是過程中很容易停掉。",
      follow_up_question: "你通常是在什麼情況下最容易放棄？",
      reason_for_next_question: "Need dropout condition.",
      understanding_update: {
        primary_barrier: fact("很容易放棄"),
        dropout_pattern: inf("過程中容易中止"),
      },
      evidence: [{ claim: "很容易放棄", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/沒變化|沒有變化|看不到變化/.test(text) && !/不適合|方法/.test(text)) {
    return withUpdate(base, {
      stage: "mechanism_discovery",
      next_action: "ask",
      assistant_response: "放棄的點，比較像是努力了卻看不見變化的時候。",
      follow_up_question: "當你努力了一段時間卻沒看到變化，你腦中通常會怎麼想？",
      reason_for_next_question: "Need interpretation pattern.",
      understanding_update: {
        dropout_pattern: fact("沒變化的時候容易放棄"),
      },
      evidence: [{ claim: "沒變化的時候", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/微調/.test(text) && /試/.test(text)) {
    return withUpdate(base, {
      next_action: "complete",
      stage: "complete",
      conversion_signal: { detected: true, type: "trial_interest" },
      assistant_response: "你要的不是再多一個方法，而是有人依你的狀況微調，讓你還願意試。",
      follow_up_question: null,
      reason_for_next_question: "Support willingness is change-fit and readiness; stop.",
      understanding_update: {
        support_receptivity: fact("希望有人幫我微調"),
        acceptable_change: inf("可接受被微調的方法，而不是自己硬撐"),
        readiness_stage: fact("想試試"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }

  if (/不適合我|方法.*不適合|可能方法/.test(text)) {
    return withUpdate(base, {
      stage: "change_fit",
      next_action: "ask",
      assistant_response:
        "你不是一開始沒有動力，而是努力一段時間沒看到變化時，會開始懷疑這個方法是不是根本不適合你。",
      follow_up_question: "如果有人可以依你實際的狀況微調方法，而不是讓你自己猜下一步，你會比較想試試嗎？",
      reason_for_next_question: "Interpretation pattern found; probe change-fit/support.",
      understanding_update: {
        interpretation_pattern: fact("沒變化 → 可能方法不適合我"),
        barrier_mechanism: inf("質疑方法後動力下降而停止"),
      },
      evidence: [{ claim: "可能方法不適合我", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }

  // Golden B
  if (/健康檢查|體檢|醫生叫|醫師叫|醫生.*減肥|醫師.*瘦|醫生.*瘦/.test(text) && !/紅字|血糖/.test(text)) {
    return withUpdate(base, {
      stage: "motivation_discovery",
      next_action: "ask",
      safety_signal: { flagged: true, kind: "medical_context", note: "doctor-advised weight change" },
      assistant_response: "這次想改變，是從健康檢查、醫生提醒開始的。我不會拿這個當診斷，只想先聽你聽到什麼。",
      follow_up_question: "醫生當時為什麼特別叫你減肥？",
      reason_for_next_question: "Medical context; clarify what doctor said, do not diagnose.",
      understanding_update: {
        immediate_trigger: fact("健康檢查時醫生叫我減肥"),
        safety_context: fact("醫生曾提醒需要減肥"),
      },
      evidence: [{ claim: "醫生叫我減肥", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/紅字|血糖/.test(text)) {
    return withUpdate(base, {
      stage: "barrier_discovery",
      next_action: "ask",
      safety_signal: { flagged: true, kind: "medical_context", note: "user-reported glucose; no interpretation" },
      assistant_response: "你提到檢查有紅字、血糖比較高，而且還不用吃藥。這部分請以醫生的說明為準，我不會解讀數值或給治療建議。",
      follow_up_question: "檢查之後到現在，你自己生活上有什麼改變，或是卡在哪裡還沒開始？",
      reason_for_next_question: "Acknowledge boundary then ask what changed.",
      understanding_update: {
        safety_context: fact("使用者表示血糖較高、不用吃藥（非診斷）"),
        immediate_trigger: inf("健檢／醫師提醒"),
      },
      evidence: [{ claim: "血糖比較高但不用吃藥", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/不知道怎麼做|工作又很忙|很忙/.test(text) && /不知道|忙/.test(text)) {
    return withUpdate(base, {
      stage: "barrier_discovery",
      next_action: "ask",
      assistant_response: "你同時講到「不知道怎麼做」和「工作很忙」，這兩件不一定是同一件事。",
      follow_up_question: "如果真的要開始，你最不知道怎麼做的是哪一部分？",
      reason_for_next_question: "Distinguish knowledge gap vs lifestyle constraint.",
      understanding_update: {
        stated_goal: fact("覺得該減肥"),
        primary_barrier: inf("可能是知識缺口或工作忙碌，待釐清"),
        lifestyle_constraints: fact("工作很忙"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/網路上看過|看過一些方法|工作時間太長/.test(text)) {
    return withUpdate(base, {
      stage: "mechanism_discovery",
      next_action: "ask",
      assistant_response: "方法你不是完全沒接觸過，比較卡的是工作時間太長，讓那些方法很難放進生活。",
      follow_up_question: "工作很忙的那些天，你實際吃飯通常是怎麼解決的？",
      reason_for_next_question: "Knowledge no longer primary; ask real food environment.",
      understanding_update: {
        primary_barrier: fact("工作時間太長"),
        lifestyle_constraints: fact("工時長"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/外送|外面餐廳|外食/.test(text) && !/備餐/.test(text)) {
    return withUpdate(base, {
      stage: "change_fit",
      next_action: "ask",
      assistant_response: "你的真實環境比較像外食或外送，不是自己備餐的節奏。",
      follow_up_question: "有人一講減肥就會想到備餐、健身課表。對你來說，一想到要認真減，你腦中出現的是什麼畫面？",
      reason_for_next_question: "Eating-out context; surface perceived execution model.",
      understanding_update: {
        behavior_constraints: fact("外面餐廳或外送"),
      },
      evidence: [{ claim: "外面餐廳或外送", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/備餐|很麻煩/.test(text)) {
    return withUpdate(base, {
      stage: "change_fit",
      next_action: "ask",
      assistant_response: "你不是拒絕改變，而是覺得認真減脂等於備餐、管理、很麻煩。",
      follow_up_question: "如果不用自己備餐，也不用把生活搞得像健身選手，只是在原本外食、外送裡做簡單調整，你會比較願意開始嗎？",
      reason_for_next_question: "Perceived cost is meal-prep complexity; test low-friction willingness.",
      understanding_update: {
        perceived_cost_of_change: fact("備餐／額外管理很麻煩"),
      },
      evidence: [{ claim: "備餐很麻煩", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/簡單方式|願意試/.test(text) && /飲食|調整/.test(text)) {
    return withUpdate(base, {
      next_action: "complete",
      stage: "complete",
      conversion_signal: { detected: true, type: "trial_interest" },
      assistant_response: "你要的不是更嚴格的計畫，而是能放進外食生活、又不用備餐的簡單調整。",
      follow_up_question: null,
      reason_for_next_question: "Acceptable change and readiness sufficient.",
      understanding_update: {
        acceptable_change: fact("簡單方式調整飲食"),
        readiness_stage: fact("願意試"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }

  // Golden C
  if (/女朋友.*分手|女友.*分手|再不減肥就|分手/.test(text)) {
    return withUpdate(base, {
      stage: "motivation_discovery",
      next_action: "ask",
      assistant_response: "這次的壓力是從關係來的。我不會假設這就等於你自己也想減。",
      follow_up_question: "如果今天女朋友沒有這樣要求，你自己還會想減肥嗎？",
      reason_for_next_question: "Partner ultimatum is external; do not assume intrinsic motivation.",
      understanding_update: {
        immediate_trigger: fact("伴侶以分手要求減肥"),
      },
      evidence: [{ claim: "女朋友說再不減肥就分手", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/她沒講/.test(text) || (/她自己也胖/.test(text) && /還好|沒講/.test(text))) {
    return withUpdate(base, {
      stage: "meaning_discovery",
      next_action: "ask",
      assistant_response: "聽起來目前比較強的動力，是外在要求，不是你自己先想改。",
      follow_up_question: "那你現在還是願意談這件事，最主要是擔心什麼？",
      reason_for_next_question: "Motivation primarily external; explore emotional driver.",
      understanding_update: {
        deeper_motivation: inf("目前主要是外在要求"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/怕她離開|怕.*離開/.test(text)) {
    return withUpdate(base, {
      stage: "barrier_discovery",
      next_action: "ask",
      assistant_response: "你在意的是關係會不會沒有了，而不只是體重數字。",
      follow_up_question: "如果真的要開始改，你最不能接受的代價是什麼？有沒有什麼是你一定不想放棄的？",
      reason_for_next_question: "Fear of partner leaving; explore unacceptable tradeoff.",
      understanding_update: {
        emotional_significance: fact("怕她離開"),
      },
      evidence: [{ claim: "怕她離開", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/不能吃|喜歡的東西/.test(text)) {
    return withUpdate(base, {
      stage: "meaning_discovery",
      next_action: "ask",
      assistant_response: "你擔心減肥等於很多東西不能吃，而你想繼續吃喜歡的東西。",
      follow_up_question: "所以你想改，但不想用「不能吃喜歡的東西」當代價。除了這個，你自己有沒有也想改變的地方？",
      reason_for_next_question: "Unacceptable tradeoff is food restriction; probe any intrinsic motive.",
      understanding_update: {
        unacceptable_tradeoffs: fact("不想放棄喜歡的食物"),
        perceived_cost_of_change: inf("以為要禁吃很多東西"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/自己也覺得|有點太胖|太胖/.test(text)) {
    return withUpdate(base, {
      stage: "meaning_discovery",
      next_action: "ask",
      assistant_response: "所以不完全只是為了她。你自己也開始覺得身材有點過了。",
      follow_up_question: "如果真的瘦下來，什麼改變會讓你自己覺得值得？",
      reason_for_next_question: "Emerging intrinsic motivation.",
      understanding_update: {
        deeper_motivation: fact("自己也覺得有點太胖"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/穿好看|好看的衣服|穿衣服|喜歡的衣服/.test(text) && !/婚宴/.test(text)) {
    return withUpdate(base, {
      move: "test_hypothesis",
      stage: "change_fit",
      next_action: "ask",
      assistant_response: "對你自己來說，值得的畫面比較像是能穿自己喜歡的衣服。",
      follow_up_question: "你想穿好看的衣服，也不想把喜歡吃的拿掉。如果方法不用把那個代價付滿，你會願意試嗎？",
      reason_for_next_question: "Desired future is clothing; test acceptable change.",
      reasoning_summary: {
        new_information: "想穿好看的衣服",
        current_interpretation: "desired future is clothing, not only partner pressure",
        why_this_move: "test whether a non-restrictive change is acceptable",
        hypothesis_being_tested: "food restriction is the unacceptable cost",
      },
      understanding_update: {
        desired_future: fact("想穿好看的衣服"),
      },
      evidence: [{ claim: "想穿好看的衣服", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }

  if (/想交女朋友|交女朋友/.test(text) && !/自信|結婚|胖回去|分手/.test(text)) {
    return withUpdate(base, {
      move: "distinguish_two_explanations",
      stage: "motivation_discovery",
      next_action: "ask",
      assistant_response: "所以感情是你最近想改變的一個原因。",
      follow_up_question:
        "你會想減脂，是因為你覺得現在的身材真的影響你認識女生，還是最近單身一段時間，讓你開始想把自己的狀態整理好？",
      reason_for_next_question: "Relationship motive stated; test whether body is actually connected.",
      reasoning_summary: {
        new_information: "想交女朋友",
        current_interpretation: "relationship is in play; body-link unknown",
        why_this_move: "distinguish body-as-cause vs life-stage dissatisfaction",
        hypothesis_being_tested: "weight is vs is not the actual relationship barrier",
      },
      understanding_update: {
        stated_goal: fact("想交女朋友"),
        deeper_motivation: inf("感情／單身狀態可能是想改變的原因"),
      },
      evidence: [{ claim: "想交女朋友", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/單身太久/.test(text) && !/自信|結婚/.test(text)) {
    return withUpdate(base, {
      move: "test_hypothesis",
      stage: "meaning_discovery",
      next_action: "ask",
      assistant_response: "那比較像是單身一段時間後，你開始真的想改變現在的狀態。",
      follow_up_question: "你自己會覺得身材是其中一個原因嗎？",
      reason_for_next_question: "Accepted long singlehood; test causal relationship, do not ask what it means.",
      reasoning_summary: {
        new_information: "單身太久了",
        current_interpretation: "life-stage dissatisfaction more than a meaning slot",
        why_this_move: "test whether body is causally linked to being single",
        hypothesis_being_tested: "singlehood is explained by body vs other reasons",
      },
      understanding_update: {
        immediate_trigger: fact("單身太久了"),
      },
      evidence: [{ claim: "單身太久了", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/沒自信|比較沒自信/.test(text)) {
    return withUpdate(base, {
      move: "follow_new_information",
      stage: "meaning_discovery",
      next_action: "ask",
      assistant_response: "這樣就連起來了。不是單純因為想交女朋友，而是胖了之後，你覺得自己的自信也跟著掉下來。",
      follow_up_question: "這種沒自信比較常出現在認識女生的時候，還是平常照鏡子、穿衣服時你自己就會有感覺？",
      reason_for_next_question: "Confidence is the new information; abandon previous singlehood probe.",
      reasoning_summary: {
        new_information: "胖了之後比較沒自信",
        current_interpretation: "self-image/confidence now owns the next turn",
        why_this_move: "follow novel confidence information",
        hypothesis_being_tested: "confidence blocks starting vs staying in relationships",
      },
      understanding_update: {
        deeper_motivation: fact("胖了之後比較沒自信"),
        emotional_significance: inf("自信／自我形象"),
      },
      evidence: [{ claim: "胖了之後比較沒自信", source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/朋友.{0,12}結婚|一個一個都結婚/.test(text)) {
    return withUpdate(base, {
      move: "reflect_and_verify",
      stage: "motivation_discovery",
      next_action: "ask",
      assistant_response:
        "身邊的人陸續進入下一個階段，比較像把你自己現在的狀態對照出來，而不是把別人的事當成你自己的目標。",
      follow_up_question: "我這樣理解有接近嗎？",
      reason_for_next_question: "High-info life-stage comparison; synthesis then verify, no extra diagnostic.",
      reasoning_summary: {
        new_information: "身邊的人陸續進入下一階段",
        current_interpretation: "social comparison may raise urgency without implying self wedding",
        why_this_move: "reflect the updated human model; do not chase another field",
        hypothesis_being_tested: "life-stage urgency vs already-wanted change",
      },
      understanding_update: {
        immediate_trigger: fact("最近身邊的人陸續進入下一階段"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/又胖回去|復胖|瘦下來又|怕胖回去/.test(text)) {
    return withUpdate(base, {
      move: "follow_new_information",
      stage: "mechanism_discovery",
      next_action: "ask",
      assistant_response: "所以現在最卡住你的，比較不像前面那題，而是怕瘦下來又回去。",
      follow_up_question: "怕瘦下來又回去，比較像是擔心方法撐不久，還是擔心自己沒辦法一直維持？",
      reason_for_next_question: "Regain/failure fear is novel; previous probe has no authority.",
      reasoning_summary: {
        new_information: "最怕瘦下來又胖回去",
        current_interpretation: "failure/regain fear now owns the conversation",
        why_this_move: "follow the new fear instead of the previous topic",
        hypothesis_being_tested: "method won't last vs self won't maintain",
      },
      understanding_update: {
        perceived_cost_of_change: fact("怕瘦下來又胖回去"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/不是沒時間.{0,12}不知道吃|不知道吃什麼/.test(text)) {
    return withUpdate(base, {
      move: "follow_new_information",
      stage: "mechanism_discovery",
      next_action: "ask",
      assistant_response: "所以卡點比較不是時間不夠，而是到了要吃的時候不知道選什麼。",
      follow_up_question: "不知道吃什麼，比較像是沒有一套你信的方法，還是選擇太多、當下決定不了？",
      reason_for_next_question: "Update hypothesis from time to decision/knowledge.",
      reasoning_summary: {
        new_information: "不是沒時間，是不知道吃什麼",
        current_interpretation: "knowledge/decision gap, not schedule",
        why_this_move: "abandon time probe; follow the corrected mechanism",
        hypothesis_being_tested: "decision friction vs missing method",
      },
      understanding_update: {
        primary_barrier: fact("不知道吃什麼"),
        lifestyle_constraints: inf("時間不是主因"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/減過.{0,6}(十公斤|10公斤)|全部胖回來|後來.*胖回來/.test(text)) {
    return withUpdate(base, {
      move: "follow_new_information",
      stage: "mechanism_discovery",
      next_action: "ask",
      assistant_response: "那你其實不是沒成功過，真正的問題可能是以前的方法你做得到一陣子，但沒有辦法一直維持。",
      follow_up_question: "你自己回頭看，比較像方法太辛苦，還是瘦下來之後慢慢又回到原本的生活？",
      reason_for_next_question: "Prior success plus regain pattern.",
      reasoning_summary: {
        new_information: "以前減過十公斤，後來全部胖回來",
        current_interpretation: "regain after prior success",
        why_this_move: "follow dropout/regain pattern instead of current food topic",
        hypothesis_being_tested: "method unfit vs all-or-nothing after a slip",
      },
      understanding_update: {
        dropout_pattern: fact("減過之後又胖回來"),
      },
      evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
    });
  }
  if (/一直問這些幹嘛|問這些幹嘛/.test(text)) {
    return withUpdate(base, {
      move: "explain_and_return_control",
      next_action: "answer_then_ask",
      user_question_detected: true,
      assistant_response: EXPLAIN_AND_RETURN_CONTROL.response,
      follow_up_question: EXPLAIN_AND_RETURN_CONTROL.question,
      reason_for_next_question: "User challenged the interview; explain and give control back.",
      reasoning_summary: {
        new_information: "質疑為什麼一直被問",
        current_interpretation: "user wants control and purpose",
        why_this_move: "answer the challenge, then let them choose continue or analyze now",
        hypothesis_being_tested: "",
      },
    });
  }

  if (medical) {
    return withUpdate(base, {
      stage: "motivation_discovery",
      next_action: "ask",
      safety_signal: { flagged: true, kind: "medical_context", note: "keyword" },
      assistant_response: "你提到健康或醫師相關的狀況。我不會做診斷，只想先聽你實際聽到什麼。",
      follow_up_question: "醫師或檢查有特別交代你要注意什麼嗎？",
      reason_for_next_question: "Safety-aware clarification.",
      understanding_update: {
        safety_context: fact(text.slice(0, 80)),
      },
    });
  }

  if (text.length < 3) {
    return withUpdate(base, {
      stage: input.state.understanding.conversation_stage,
      next_action: "ask",
      assistant_response: "我好像還沒抓到你真正想說的那一句。",
      follow_up_question: "用你自己的話講一件最近的事就好，哪怕只是一個例子。",
      reason_for_next_question: "Short answer needs clarification.",
    });
  }

  // Unexpected free text: follow the latest statement. Never parrot + fake-depth.
  return withUpdate(base, {
    move: "follow_new_information",
    stage: "barrier_discovery",
    next_action: "ask",
    assistant_response: `你剛說「${text.slice(0, 40)}」。我先記著這句。`,
    follow_up_question: null,
    reason_for_next_question: "Unexpected free text: follow without manufacturing a probe.",
    reasoning_summary: {
      new_information: text.slice(0, 160),
      current_interpretation: "unclassified statement; do not fill a meaning slot",
      why_this_move: "follow the latest statement without a universal fallback",
      hypothesis_being_tested: "",
    },
    understanding_update: {
      stated_goal: input.state.understanding.stated_goal.kind === "unknown" ? fact(text.slice(0, 80)) : { value: "", kind: "unknown" },
    },
    evidence: [{ claim: text.slice(0, 80), source_turn_id: input.userTurnId, type: "fact" }],
  });
}

void INTERVIEW_UNDERSTANDING_KEYS;
