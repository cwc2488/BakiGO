import type { UnderstandingPatchItem } from "@/lib/analysis/interview/interview-contract";
import {
  newlyConfirmedDimensions,
  purposeForGap,
  questionServesGap,
  type HighValueGap,
  type QuestionPurpose,
} from "@/lib/analysis/interview/interview-steering";
import {
  isFact,
  emptyUnderstandingState,
  type InterviewUnderstandingKey,
  type UnderstandingState,
} from "@/lib/analysis/interview/understanding-state";

export type QuestionCoherence = {
  coherent: boolean;
  references_new_information: boolean;
  serves_current_gap: boolean;
  stale_topic: boolean;
  generic_probe: boolean;
  parroting: boolean;
  conversation_specific: boolean;
  rationale: string;
};

export type AnswerNovelty = {
  novelty: "low" | "medium" | "high";
  introduced_dimensions: InterviewUnderstandingKey[];
  strengthened_dimensions: InterviewUnderstandingKey[];
  contradicted_dimensions: InterviewUnderstandingKey[];
  changed_interpretation: boolean;
  should_redirect_next_question: boolean;
  reason: string;
};

export type SemanticPivot = {
  pivot: boolean;
  previous_purpose: QuestionPurpose | "unknown";
  introduced_dimensions: InterviewUnderstandingKey[];
  reason: string;
};

/** Generic questionnaire lines — rejected unless they clearly use this turn's information. */
export const GENERIC_PROBE_RE =
  /還有其他原因嗎|可以再多說一點嗎|可以多用.{0,6}話說|你的感受是什麼|你有什麼想法|你最大的困難是什麼|最大的挑戰是什麼|你希望怎麼改變|你希望達到什麼目標|希望達到什麼|還有什麼\？|具體來說呢|具體的?(影響|期望|想法|計畫)|對你有什麼影響|影響是什麼|感受是什麼|對你來說最難的地方是什麼|平常最大的困難|可以再說(?:一點|清楚)/;

const EMPTY_ACK_RE =
  /^(我了解|我理解|我懂了|這很重要|謝謝你的分享|謝謝你告訴我|聽起來不容易|沒問題|好的|這是一個很好的動機|很好的動機)[。．.！!？?\s]*$/;

const EMPTY_ACK_PREFIX_RE =
  /^(?:我了解|我理解|我懂了|這很重要|謝謝你的分享|謝謝你告訴我|這是一個很好的動機|很好的動機)[。．.]+/;

const STOP_WORDS = new Set("的了嗎呢是很也都不我你他她在有要會跟和或被把對就還只".split(""));

export function contentTokens(text: string): string[] {
  const chars = text.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < chars.length - 1; i += 1) {
    const gram = chars.slice(i, i + 2);
    if ([...gram].every((c) => STOP_WORDS.has(c))) continue;
    if (/[A-Za-z0-9]/.test(gram)) continue;
    out.push(gram);
  }
  return out;
}

export function sharesContent(answer: string, question: string): boolean {
  const q = question.replace(/\s+/g, "");
  const tokens = contentTokens(answer).filter((t) => t.length >= 2);
  if (tokens.length === 0) {
    return /不知道|還好|沒有|想瘦|多少錢|多久/.test(answer);
  }
  const hits = tokens.filter((t) => q.includes(t)).length;
  return hits >= Math.min(2, Math.max(1, Math.floor(tokens.length * 0.2)));
}

function semanticClassOverlap(answer: string, question: string): boolean {
  const pairs: Array<[RegExp, RegExp]> = [
    [/看過|方法|不知道該信/, /相信|方法|知道怎麼做|很難真的開始|放不進/],
    [/忙|時間不夠|工時/, /忙|執行|知道怎麼做|吃飯|生活/],
    [/週末|假日|破功|一放縱/, /週末|破|整組|放棄|平日/],
    [/同事|公司|大家都在/, /同事|自己還會|跟著/],
    [/宵夜|晚上.{0,6}吃/, /晚上|宵夜|白天|習慣|補回來/],
    [/不想運動|討厭運動|不要去健身/, /運動|健身房|飲食|安排/],
    [/拍照|鏡頭|照片/, /照片|看起來|日常|身材/],
    [/不知道原因|說不上來|不知道為什麼/, /說不清|說不出口|在意什麼|為什麼想改/],
    [/看不到變化|沒變化|沒效果/, /變化|停下來|方法不適合|怎麼想/],
    [/多少錢|費用|價格|貴不貴/, /花錢|划不划算|太麻煩|還沒準備/],
    [/多久|幾週/, /週期|願意試|一小段時間/],
    [/就想瘦|想瘦一點/, /看起來|身體|狀態/],
    [/一輩子|只有一次|很重要/, /卡住|原因|沒做到|放棄|沒發生/],
    [/好看|身材|形象/, /原因|卡住|沒改|關係|特別重要/],
    [/交女朋友|想交女/, /身材|認識|女生|單身|狀態|減脂/],
    [/單身太久/, /身材|原因|連|改變/],
    [/沒自信/, /自信|照鏡|衣服|認識|場合/],
    [/朋友.{0,12}結婚|一個一個都結婚/, /朋友|階段|對照|觸發|結婚/],
    [/放棄/, /情況|停下來|那時候|變化/],
    [/備餐|麻煩/, /不用自己|原本.{0,8}吃|簡單調整|低摩擦/],
    [/外食|外送|餐廳/, /備餐|認真|管很多|麻煩|原本/],
    [/又胖回去|瘦下來又|怕胖回去|全部胖回來/, /回去|維持|撐不久|原點/],
    [/不是沒時間.{0,24}不知道|不知道吃什麼/, /吃什麼|方法|決定|選擇/],
  ];
  return pairs.some(([a, q]) => a.test(answer) && q.test(question));
}

export function isGenericProbe(question: string): boolean {
  return GENERIC_PROBE_RE.test(question.trim());
}

export const LOW_INFO_ANSWER_RE =
  /^(不知道|還好|沒有|普通|可能吧|不知道耶|隨便|還好吧|沒有耶|不知道啊|還可以)[。．.！!？?\s]*$/;

export function isLowInformationAnswer(text: string): boolean {
  return LOW_INFO_ANSWER_RE.test(text.trim());
}

const HIGH_NOVELTY_FIELDS = new Set<InterviewUnderstandingKey>([
  "deeper_motivation",
  "desired_future",
  "emotional_significance",
  "primary_barrier",
  "unacceptable_tradeoffs",
  "dropout_pattern",
  "interpretation_pattern",
  "lifestyle_constraints",
  "acceptable_change",
  "readiness_stage",
  "perceived_cost_of_change",
  "behavior_constraints",
  "support_receptivity",
]);

const PURPOSE_FIELDS: Record<QuestionPurpose, InterviewUnderstandingKey[]> = {
  clarify_motivation: ["deeper_motivation", "immediate_trigger", "stated_goal"],
  deepen_meaning: ["deeper_motivation", "desired_future", "emotional_significance", "immediate_trigger", "stated_goal"],
  identify_barrier: ["primary_barrier", "perceived_cost_of_change", "unacceptable_tradeoffs"],
  identify_mechanism: ["dropout_pattern", "interpretation_pattern", "barrier_mechanism", "lifestyle_constraints", "behavior_constraints"],
  test_hypothesis: ["acceptable_change", "readiness_stage", "support_receptivity"],
  identify_tradeoff: ["unacceptable_tradeoffs", "perceived_cost_of_change"],
  identify_change_fit: ["acceptable_change", "support_receptivity"],
  assess_readiness: ["readiness_stage", "acceptable_change"],
  resolve_safety: ["safety_context"],
  answer_user_question: [],
};

const GENERIC_ANYONE_RE =
  /如果現在就要開始，你覺得最可能讓你最後還是沒改成|如果是這種低摩擦的調整，而不是一次變成另一種人|這件事為什麼現在對你重要\？|你希望達成什麼目標|你平常最大的困難|比較簡單的方法，你會願意開始/;

const MECHANICAL_PARROT_RE =
  /你剛提到「[^」]{2,}」。這件事為什麼現在對你重要|你剛提到「[^」]{2,}」。這件事跟你希望自己變成什麼樣子|你剛提到「[^」]{2,}」之後，你自己最希望哪一件事真的不一樣/;

export function isParrotingQuestion(answer: string, question: string): boolean {
  if (MECHANICAL_PARROT_RE.test(question) && !/還是|比較像/.test(question)) return true;
  const a = answer.replace(/\s+/g, "").replace(/[。．.！!？?]/g, "");
  if (a.length < 4) return false;
  const q = question.replace(/\s+/g, "");
  const quoted = a.length <= 18 ? a : a.slice(0, 12);
  const shallow =
    /有什麼(特別的)?(情感)?(意義|感受|影響|想法)|這對你意味著什麼|對你來說有什麼感受|最難的地方是什麼|為什麼現在對你重要|最希望哪一件事真的不一樣/.test(
      question,
    );
  const discriminating = /還是|比較像|不知道該|很難真的開始|自己還會|當代價|除了這個/.test(question);
  if (discriminating) return false;
  if (shallow && (q.includes(quoted) || sharesContent(answer, question) || /你剛(剛)?說|你提到/.test(question))) {
    return true;
  }
  return false;
}

export function classifyAnswerDimensions(answer: string): InterviewUnderstandingKey[] {
  const t = answer.trim();
  const out = new Set<InterviewUnderstandingKey>();
  if (/不想(放棄|付出)|不能接受|代價|全部(拿掉|戒)|繼續.{0,6}吃|很多東西不能/.test(t)) {
    out.add("unacceptable_tradeoffs");
  }
  if (/想(變|穿|成為)|希望自己|未來的自己/.test(t)) out.add("desired_future");
  if (/怕|害怕|在乎|重要到|沒自信/.test(t)) out.add("emotional_significance");
  if (/交女朋友|想交女友/.test(t)) out.add("stated_goal");
  if (/單身太久/.test(t)) out.add("immediate_trigger");
  if (/朋友.{0,10}結婚/.test(t)) out.add("immediate_trigger");
  if (/做不到|沒辦法開始|卡住了|不知道怎麼做/.test(t)) out.add("primary_barrier");
  if (/忙|工時|加班|睡眠|班次|沒時間|熬夜/.test(t)) out.add("lifestyle_constraints");
  if (/願意試|不想改|不太想改|先不要|其實不太想/.test(t) && !/[?？]/.test(t)) out.add("readiness_stage");
  if (/又胖|復胖|瘦下來又|怕胖回去/.test(t)) out.add("perceived_cost_of_change");
  if (/多少錢|費用|價格/.test(t)) out.add("stated_goal");
  return [...out];
}

export function evaluateAnswerNovelty(input: {
  before: UnderstandingState;
  after: UnderstandingState;
  answer: string;
  previousGap: HighValueGap;
  previousPurpose?: QuestionPurpose;
}): AnswerNovelty {
  if (isLowInformationAnswer(input.answer)) {
    return {
      novelty: "low",
      introduced_dimensions: [],
      strengthened_dimensions: [],
      contradicted_dimensions: [],
      changed_interpretation: false,
      should_redirect_next_question: false,
      reason: "low-information answer; no new semantic FACT",
    };
  }
  const introduced = newlyConfirmedDimensions(input.before, input.after) as InterviewUnderstandingKey[];
  const strengthened: InterviewUnderstandingKey[] = [];
  const contradicted: InterviewUnderstandingKey[] = [];
  for (const key of HIGH_NOVELTY_FIELDS) {
    const prev = input.before[key];
    const next = input.after[key];
    if (isFact(prev) && isFact(next) && prev.value !== next.value) strengthened.push(key);
  }
  for (const h of input.after.hypotheses ?? []) {
    const beforeH = (input.before.hypotheses ?? []).find((x) => x.id === h.id);
    if (h.status === "contradicted" && beforeH?.status !== "contradicted") {
      contradicted.push("interpretation_pattern");
    }
  }
  const highHits = introduced.filter((k) => HIGH_NOVELTY_FIELDS.has(k));
  const changed_interpretation =
    highHits.includes("interpretation_pattern") ||
    highHits.includes("dropout_pattern") ||
    highHits.includes("deeper_motivation") ||
    highHits.includes("desired_future") ||
    highHits.includes("unacceptable_tradeoffs") ||
    contradicted.length > 0;
  let novelty: AnswerNovelty["novelty"] = "low";
  if (highHits.length || contradicted.length) novelty = "high";
  else if (strengthened.length || introduced.includes("safety_context") || introduced.length) novelty = "medium";
  const classifiedHigh = classifyAnswerDimensions(input.answer).filter((k) => HIGH_NOVELTY_FIELDS.has(k));
  const expected = input.previousPurpose ? PURPOSE_FIELDS[input.previousPurpose] : [];
  const leavesOldSlot = [...highHits, ...classifiedHigh].some(
    (k) => expected.length > 0 && !expected.includes(k),
  );
  if (classifiedHigh.length && leavesOldSlot) novelty = "high";
  const should_redirect_next_question =
    novelty === "high" && (leavesOldSlot || changed_interpretation || highHits.length > 0);
  return {
    novelty,
    introduced_dimensions: introduced,
    strengthened_dimensions: strengthened,
    contradicted_dimensions: contradicted,
    changed_interpretation,
    should_redirect_next_question,
    reason: should_redirect_next_question
      ? `high novelty (${highHits.join(",") || contradicted.join(",")}); next question must follow new information`
      : novelty === "low"
        ? "no material state change"
        : "same-topic strengthening",
  };
}

export function detectSemanticPivot(input: {
  previousPurpose: QuestionPurpose | "unknown";
  previousQuestion: string;
  answer: string;
  introduced: InterviewUnderstandingKey[];
}): SemanticPivot {
  const expected =
    input.previousPurpose === "unknown" ? [] : PURPOSE_FIELDS[input.previousPurpose] ?? [];
  const fromAnswer = classifyAnswerDimensions(input.answer);
  const introduced = [...new Set([...input.introduced, ...fromAnswer])];
  const outside = introduced.filter((k) => expected.length > 0 && !expected.includes(k));
  const pivot = outside.length > 0 && !isLowInformationAnswer(input.answer);
  return {
    pivot,
    previous_purpose: input.previousPurpose,
    introduced_dimensions: introduced,
    reason: pivot
      ? `answer introduces ${outside.join(",")} outside ${input.previousPurpose}`
      : "answer stays in previous purpose slot",
  };
}

export function quotesStaleOwnership(
  question: string,
  answer: string,
  before: UnderstandingState,
): boolean {
  const quotes = [...question.matchAll(/「([^」]{2,})」/g)].map((m) => m[1]);
  if (quotes.length === 0) return false;
  const compactAnswer = answer.replace(/\s/g, "");
  return quotes.some((q) => {
    if (compactAnswer.includes(q.replace(/\s/g, ""))) return false;
    const keys: InterviewUnderstandingKey[] = [
      "immediate_trigger",
      "deeper_motivation",
      "desired_future",
      "emotional_significance",
      "primary_barrier",
      "stated_goal",
    ];
    return keys.some((k) => isFact(before[k]) && before[k].value.includes(q.slice(0, 6)));
  });
}

export function isConversationSpecific(input: {
  question: string;
  answer: string;
  newFactValues: string[];
}): boolean {
  const q = input.question.trim();
  if (!q) return true;
  if (MECHANICAL_PARROT_RE.test(q)) return false;
  if (GENERIC_ANYONE_RE.test(q) && input.newFactValues.every((v) => v.length < 2 || !q.includes(v.slice(0, 4)))) {
    return false;
  }
  if (input.newFactValues.some((v) => v.length >= 2 && q.includes(v.slice(0, Math.min(4, v.length))))) return true;
  if (semanticClassOverlap(input.answer, q) || /還是|比較像/.test(q)) return true;
  if (sharesContent(input.answer, q)) return true;
  return false;
}

export function contrastAcknowledgement(
  u: UnderstandingState,
  introduced: InterviewUnderstandingKey[],
): string | null {
  const cost = isFact(u.unacceptable_tradeoffs)
    ? u.unacceptable_tradeoffs.value
    : isFact(u.perceived_cost_of_change)
      ? u.perceived_cost_of_change.value
      : "";
  const want =
    isFact(u.desired_future) || isFact(u.deeper_motivation) || isFact(u.emotional_significance);
  if (!cost || !want) return null;
  if (
    !introduced.includes("unacceptable_tradeoffs") &&
    !introduced.includes("desired_future") &&
    !introduced.includes("perceived_cost_of_change")
  ) {
    return null;
  }
  const clipCost = cost.length <= 16 ? cost : `${cost.slice(0, 16)}…`;
  return `所以你想改，但不想用「${clipCost}」當代價。`;
}

export function discriminatingQuestionFromAnswer(
  answer: string,
  understanding: UnderstandingState,
): string | null {
  const t = answer.trim();
  if (/^(嗯+|哦+|好+|哈+)$/.test(t)) {
    return "用你自己的話講一件最近的事就好，哪怕只是一個例子。";
  }
  if (/不能接受|過得很嚴格|太嚴格|每天都要很/.test(t) && !/喜歡的東西|不能吃/.test(t)) {
    return "所以你不是完全不想改，而是不能接受把自己過得很嚴格。除了這個，你自己有沒有也想改變的地方？";
  }
  if (/不太想改|其實不太想|只是被問才來|我其實不太想/.test(t) && !/[?？]/.test(t)) {
    return "所以這次比較像別人要你來，不是你已經決定要改。你自己有沒有任何一件事是想變的？";
  }
  if (/不是沒時間.{0,20}不知道吃|不知道吃什麼/.test(t) && /沒時間|忙/.test(t)) {
    return "不知道吃什麼，比較像是沒有一套你信的方法，還是選擇太多、當下決定不了？";
  }
  if (/又胖回去|復胖|瘦下來又|怕胖回去/.test(t)) {
    return "怕瘦下來又回去，比較像是擔心方法撐不久，還是擔心自己沒辦法一直維持？";
  }
  if (/加班|沒時間|工時太長|時間不夠|根本沒時間|工作時間太長/.test(t)) {
    return "時間被工作吃掉的那些天，吃飯通常是怎麼解決的？";
  }
  if (/睡眠|熬夜|兩點才睡|失眠/.test(t)) {
    return "睡很少的那些天，吃東西通常會變得怎樣？";
  }
  if (/怕別人|看輕|用身材看/.test(t)) {
    return "這份擔心比較像是讓你不敢開始，還是開始之後很難維持？";
  }
  if (/看過.{0,16}(方法|減肥).{0,16}(都沒|沒做|沒有做)|很多方法.{0,10}沒|(方法|減肥).{0,8}都沒做|看過一些方法/.test(t)) {
    return "你比較像是不知道該相信哪個方法，還是其實知道怎麼做，只是很難真的開始？";
  }
  if (/週末.{0,10}(破|失控|放棄|放縱)|一到週末|假日.{0,8}就/.test(t)) {
    return "週末破功的時候，比較像是平日那套週末用不了，還是一破就乾脆整段放棄？";
  }
  if (/同事|公司的人|大家都在減|跟著.{0,6}試/.test(t) && !/自己還會/.test(t)) {
    return "如果同事沒有在減，你自己還會想開始嗎？";
  }
  if (/宵夜|晚上一直吃|晚上控制不住|晚上會吃|晚上容易亂吃/.test(t)) {
    return "晚上會吃，比較像是白天吃太少所以補回來，還是晚上那件事本身已經變成習慣？";
  }
  if (/不想運動|討厭運動|不要運動|排斥健身|不想去健身/.test(t)) {
    return "你比較不能接受的是運動本身，還是生活又被加進一套很累的安排？";
  }
  if (/拍照.{0,10}(不好看|醜)|鏡頭|照片裡/.test(t)) {
    return "你在意的比較像是照片裡的樣子，還是日常生活裡你對自己的感覺？";
  }
  if (/不知道原因|說不上來|不知道為什麼想|完全不知道/.test(t)) {
    return "你比較像是還沒想清楚為什麼想改，還是其實有一件事、只是一下子說不出口？";
  }
  if (/做了.{0,8}(兩週|幾週|一下).{0,12}(沒變化|沒效果)|看不到變化.{0,10}(懶|停|放棄)/.test(t)) {
    return "看不到變化的時候，你比較會覺得方法不適合，還是覺得自己沒辦法撐下去？";
  }
  if (/一輩子|只有一次/.test(t)) {
    return "所以這件事對你很重。真的開始的話，最可能讓它沒發生的原因是什麼？";
  }
  if (/喜歡的東西|不能吃|全部拿掉/.test(t) && !/婚宴/.test(t)) {
    return "所以你想改，但不想用「不能吃喜歡的東西」當代價。除了這個，你自己有沒有也想改變的地方？";
  }
  if (/穿好看|好看的衣服|穿衣服/.test(t) && !/婚宴/.test(t)) {
    return "你現在比較在意的是外表本身，還是穿衣服不好看讓你越來越沒自信？";
  }
  if (/家人一直叫|家人叫我/.test(t) && /衣服|自己/.test(t) === false) {
    return "如果家人沒有一直叫你，你自己還會想開始嗎？";
  }
  if (/^就想瘦$|^想瘦$|^想瘦一點$/.test(t)) {
    return "你現在比較在意的是看起來的感覺，還是身體實際的狀態？";
  }
  if (/^(不知道|還好|沒有)$/.test(t)) {
    return "你比較卡的是「說不清在意什麼」，還是其實知道、只是現在不想講太多？";
  }
  if (
    /不知道怎麼做/.test(t) &&
    /忙|時間/.test(t) &&
    !isFact(understanding.behavior_constraints)
  ) {
    return "你現在比較像是不知道怎麼做，還是其實知道，只是忙到很難執行？";
  }
  return null;
}

export function evaluateQuestionCoherence(input: {
  latestUserAnswer: string;
  groundedPatch: Array<{ field: string; value: string; kind: string }>;
  confirmedFacts: Record<string, string>;
  activeHypotheses: Array<{ c: string; s: string }>;
  previousGap: HighValueGap;
  currentGap: HighValueGap;
  proposedQuestion: string;
  questionPurpose: string;
  understanding?: UnderstandingState;
  before?: UnderstandingState;
  noveltyHigh?: boolean;
}): QuestionCoherence {
  void input.confirmedFacts;
  void input.activeHypotheses;
  void input.questionPurpose;
  const u = input.understanding ?? emptyUnderstandingState();
  const q = input.proposedQuestion.trim();
  if (!q) {
    return {
      coherent: true,
      references_new_information: true,
      serves_current_gap: input.currentGap === "none",
      stale_topic: false,
      generic_probe: false,
      parroting: false,
      conversation_specific: true,
      rationale: "no question; completion path",
    };
  }

  const newFactValues = input.groundedPatch.filter((p) => p.kind === "fact").map((p) => p.value);
  const parroting = isParrotingQuestion(input.latestUserAnswer, q);
  const genericRaw = isGenericProbe(q);
  const conversation_specific = isConversationSpecific({
    question: q,
    answer: input.latestUserAnswer,
    newFactValues,
  });
  const staleOwnership = input.before ? quotesStaleOwnership(q, input.latestUserAnswer, input.before) : false;
  const serves =
    questionServesGap(q, input.currentGap, u) ||
    semanticClassOverlap(input.latestUserAnswer, q) ||
    /還是|比較像|願意試|為什麼/.test(q);
  const discriminating = /還是|比較像/.test(q);
  const references =
    sharesContent(input.latestUserAnswer, q) ||
    semanticClassOverlap(input.latestUserAnswer, q) ||
    newFactValues.some((v) => v && sharesContent(v, q)) ||
    discriminating;
  const generic_probe =
    (genericRaw && (!references || parroting)) ||
    (Boolean(input.noveltyHigh) && !conversation_specific && !/醫生的說明|不會解讀/.test(q));
  const stale =
    staleOwnership ||
    (input.previousGap !== input.currentGap &&
      input.previousGap !== "none" &&
      questionServesGap(q, input.previousGap, u) &&
      !questionServesGap(q, input.currentGap, u) &&
      !semanticClassOverlap(input.latestUserAnswer, q));

  const coherent =
    references && serves && !stale && !generic_probe && !parroting && (!input.noveltyHigh || conversation_specific);
  const rationale = coherent
    ? `new info used; gap=${input.currentGap}`
    : [
        !references ? "does not use this turn's information" : "",
        !serves ? `does not serve ${input.currentGap}` : "",
        stale ? "stale previous topic" : "",
        generic_probe ? "generic questionnaire probe" : "",
        parroting ? "parrots user wording" : "",
        input.noveltyHigh && !conversation_specific ? "not conversation-specific after high novelty" : "",
      ]
        .filter(Boolean)
        .join("; ");

  return {
    coherent,
    references_new_information: references,
    serves_current_gap: serves,
    stale_topic: stale,
    generic_probe,
    parroting,
    conversation_specific,
    rationale,
  };
}

export function whyThisQuestionNow(input: {
  answer: string;
  patchFacts: Array<{ field: string; value: string }>;
  previousGap: HighValueGap;
  currentGap: HighValueGap;
  purpose: string;
  question: string;
  coherence: QuestionCoherence;
}): string {
  const newest = input.patchFacts[0]?.value || input.answer.slice(0, 24);
  return [
    `A:${newest}`,
    `B:${input.patchFacts.map((p) => p.field).join(",") || "no new fact"}`,
    `C:${input.currentGap}`,
    `D:${input.purpose}`,
    input.coherence.rationale,
  ].join(" | ");
}

export function sanitizeAcknowledgement(text: string, options?: { preserveSafety?: boolean }): string {
  let t = text.trim();
  if (!t) return "";
  if (EMPTY_ACK_RE.test(t)) return "";
  t = t.replace(EMPTY_ACK_PREFIX_RE, "").trim();
  t = t.replace(/我理解你的感受[。．.]?/g, "").trim();
  if (!t) return "";
  if (options?.preserveSafety || /醫生的說明|不會解讀|不做診斷|治療建議|不是診斷/.test(t)) {
    return t;
  }
  const parts = t.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0];
  if (EMPTY_ACK_RE.test(first)) return parts[1] ?? "";
  return first;
}

export function coherentQuestionForTurn(input: {
  answer: string;
  understanding: UnderstandingState;
  proposed: string;
  previousGap: HighValueGap;
  currentGap: HighValueGap;
  patch: UnderstandingPatchItem[];
  fallbackQuestion: string;
  before?: UnderstandingState;
  noveltyHigh?: boolean;
}): { question: string; coherence: QuestionCoherence; replaced: boolean } {
  const currentGap = input.currentGap;
  const purpose = purposeForGap(currentGap);
  const facts = Object.fromEntries(
    input.patch.filter((p) => p.kind === "fact").map((p) => [p.field, p.value]),
  );
  const evalOnce = (proposed: string) =>
    evaluateQuestionCoherence({
      latestUserAnswer: input.answer,
      groundedPatch: input.patch,
      confirmedFacts: facts,
      activeHypotheses: [],
      previousGap: input.previousGap,
      currentGap,
      proposedQuestion: proposed,
      questionPurpose: purpose,
      understanding: input.understanding,
      before: input.before,
      noveltyHigh: input.noveltyHigh,
    });
  let question = input.proposed;
  let coherence = evalOnce(question);
  if (coherence.coherent) {
    return { question, coherence, replaced: false };
  }
  const replacement =
    discriminatingQuestionFromAnswer(input.answer, input.understanding) || input.fallbackQuestion;
  if (replacement && replacement !== question) {
    question = replacement;
    coherence = evalOnce(question);
    return { question, coherence, replaced: true };
  }
  return { question, coherence, replaced: false };
}

export function slotCoercionRejects(
  field: InterviewUnderstandingKey,
  answer: string,
  previousPurpose: QuestionPurpose | "unknown",
): boolean {
  if (previousPurpose === "unknown") return false;
  const dims = classifyAnswerDimensions(answer);
  if (dims.length === 0) return false;
  const expected = PURPOSE_FIELDS[previousPurpose] ?? [];
  const pivot = detectSemanticPivot({
    previousPurpose,
    previousQuestion: "",
    answer,
    introduced: dims,
  });
  return pivot.pivot && expected.includes(field) && !dims.includes(field);
}

export function remainingUncertaintyIsHighValue(gap: HighValueGap): boolean {
  return (
    gap === "motivation_meaning" ||
    gap === "barrier" ||
    gap === "dropout_or_interpretation" ||
    gap === "knowledge_vs_execution"
  );
}

export type { QuestionPurpose };
