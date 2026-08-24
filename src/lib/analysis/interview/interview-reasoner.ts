import type { InterviewSessionState } from "@/lib/analysis/interview/interview-contract";
import {
  discriminatingQuestionFromAnswer,
  isGenericProbe,
  isParrotingQuestion,
  sharesContent,
} from "@/lib/analysis/interview/interview-coherence";
import {
  buildCurrentHumanModel,
  classifyInformationValue,
  genericAffectLocatingQuestion,
  hasReversalOrUndoShape,
  isParaphraseVerification,
  looksLikeCausalSynthesis,
  questionUsesNewInformation,
  reversalFollowupQuestion,
  SYNTHESIS_VERIFY_QUESTION,
  synthesizeReflection,
  type CurrentHumanModel,
} from "@/lib/analysis/interview/interview-human-model";
import {
  isFact,
  type UnderstandingState,
} from "@/lib/analysis/interview/understanding-state";

/**
 * P2.7 Conversation Reasoner helpers.
 * UnderstandingState is memory + analysis. It does not pick the next topic.
 */

export const FAKE_DEPTH_RE =
  /有什麼.{0,10}(意義|感受|影響|想法)|這對你意味著什麼|對你來說有什麼感受|對你來說有什麼特別|影響是什麼|感受是什麼/;

export const UNIVERSAL_BINARY_RE =
  /想開始的原因.{0,24}沒開始的原因|沒開始的原因.{0,24}想開始的原因|是想開始的原因，還是沒開始/;

export const WEAK_INTERVIEW_LANGUAGE_RE =
  /具體的?(影響|期望|想法|計畫|計劃)|特殊意義|情感意義|最大的(困難|挑戰)是什麼|可以再多說一點嗎|很好的動機|影響是什麼|感受是什麼|希望達到什麼/;

export const INTERVIEW_CHALLENGE_RE =
  /一直問這些幹嘛|問這些幹嘛|為什麼一直問|你問這些幹嘛/;

export const EXPLAIN_AND_RETURN_CONTROL = {
  response:
    "因為我不想只看到「想減肥」就直接給你一套方法，我想先弄清楚你真正想改的是什麼、以前又卡在哪裡，這樣最後給你的分析才不會很空泛。不過不用每題都回答得很深——如果你覺得差不多了，我也可以直接用目前知道的幫你整理。",
  question: "你要我繼續了解，還是先用目前知道的幫你整理？",
} as const;

export function isInterviewChallenge(text: string): boolean {
  return INTERVIEW_CHALLENGE_RE.test(text.trim());
}

export function isWeakInterviewLanguage(text: string): boolean {
  const t = text.trim();
  return UNIVERSAL_BINARY_RE.test(t) || WEAK_INTERVIEW_LANGUAGE_RE.test(t);
}

export function isOthersMarrying(text: string): boolean {
  return /朋友.{0,16}結婚|同事.{0,12}結婚|別人都結婚|一個一個都結婚|大家都結婚|身邊.{0,10}結婚/.test(
    text,
  );
}

export function isSelfWeddingIntent(text: string): boolean {
  if (isOthersMarrying(text)) return false;
  if (/參加.{0,10}婚宴/.test(text) && !/我(想|要|的).{0,6}婚宴/.test(text)) return false;
  return /(我)?(想|要)結婚|因為.{0,10}結婚|辦婚宴|我的婚宴/.test(text);
}

export function isPartnerWeightUltimatum(text: string): boolean {
  return (
    /(女朋友|女友|男友|伴侶).{0,20}(再不減肥|叫我減肥|要我瘦|說再不)/.test(text) ||
    /再不減肥.{0,12}(分手|離開)/.test(text)
  );
}

export function isClinicianDirectedWeightLoss(text: string): boolean {
  return (
    /健康檢查|體檢|(醫生|醫師)(叫|要|說|交代|叮嚀)/.test(text) ||
    /(醫生|醫師).{0,12}(減肥|瘦)/.test(text)
  );
}

function understandingCorpus(u: UnderstandingState): string {
  return [
    u.stated_goal?.value,
    u.immediate_trigger?.value,
    u.deeper_motivation?.value,
    u.desired_future?.value,
    u.emotional_significance?.value,
    u.primary_barrier?.value,
    u.dropout_pattern?.value,
  ]
    .filter(Boolean)
    .join(" ");
}

function clipStatement(text: string, max = 18): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function isFakeDepthQuestion(answer: string, question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (isWeakInterviewLanguage(q)) return true;
  if (/還是|比較像/.test(q) && !/有什麼.{0,10}(意義|感受)/.test(q)) return false;
  return FAKE_DEPTH_RE.test(q) || /對你有什麼影響/.test(q);
}

export function isUnjustifiedBinaryQuestion(
  question: string,
  answer: string,
  understanding: UnderstandingState,
): boolean {
  const q = question.trim();
  if (!q) return false;
  if (UNIVERSAL_BINARY_RE.test(q)) return true;
  if (!/還是|比較像/.test(q)) return false;
  if (isWeakInterviewLanguage(q)) return true;
  const corpus = `${answer} ${understandingCorpus(understanding)}`;
  if (/想開始|沒開始/.test(q) && !/想開始|沒開始|開始不了|一直沒/.test(corpus)) return true;
  const hyps = (understanding.hypotheses ?? []).filter(
    (h) => h.status === "proposed" || h.status === "confirmed",
  );
  if (hyps.length >= 2) return false;
  if (sharesContent(answer, q)) return false;
  if (consultantMoveFromLatest(answer, understanding)) return false;
  if (discriminatingQuestionFromAnswer(answer, understanding)) return false;
  return /任何.{0,6}人|一般來說|通常會/.test(q);
}

export function consultantMoveFromLatest(
  answer: string,
  understanding: UnderstandingState,
): { response: string; question: string; reason: string } | null {
  const t = answer.trim();
  const known = understandingCorpus(understanding);

  if (/想交女朋友|交女朋友/.test(t) && !/自信|胖回去|分手/.test(t)) {
    return {
      response: "所以感情是你最近想改變的一個原因。",
      question:
        "你會想減脂，是因為你覺得現在的身材真的影響你認識女生，還是最近單身一段時間，讓你開始想把自己的狀態整理好？",
      reason: "follow_latest:body_dating_link",
    };
  }
  if (/單身太久/.test(t) && !/自信|結婚/.test(t)) {
    return {
      response: "那比較像是單身一段時間後，你開始真的想改變現在的狀態。",
      question: "你自己會覺得身材是其中一個原因嗎？",
      reason: "follow_latest:body_as_cause",
    };
  }
  if (/沒自信|比較沒自信/.test(t)) {
    const datingContext = /女朋友|單身|認識/.test(known) || /女朋友|單身/.test(t);
    return {
      response: datingContext
        ? "這樣就連起來了。不是單純因為想交女朋友，而是胖了之後，你覺得自己的自信也跟著掉下來。"
        : "所以關鍵比較不像外表數字，而是胖了之後自信掉下來。",
      question: datingContext
        ? "這種沒自信比較常出現在認識女生的時候，還是平常照鏡子、穿衣服時你自己就會有感覺？"
        : "這份沒自信，比較常出現在什麼場合？",
      reason: "follow_latest:confidence",
    };
  }
  if (isOthersMarrying(t)) {
    return {
      response: "朋友陸續結婚，比較像是把你自己現在的人生階段對照出來，而不是你自己要結婚。",
      question:
        "這比較像是看到身邊的人進入下一個階段，讓你開始想改變，還是你本來就已經想改、只是最近更明顯？",
      reason: "follow_latest:social_comparison",
    };
  }
  if (isSelfWeddingIntent(t) && !/好看|一輩子/.test(t)) {
    return {
      response: "你把改變跟結婚連在一起了。",
      question: "你現在覺得自己的身材，跟「想結婚」之間最大的關係是什麼？",
      reason: "follow_latest:self_wedding",
    };
  }
  if (/減過.{0,8}(十公斤|10公斤)|全部胖回來|後來.*胖回來/.test(t)) {
    return {
      response: "那你其實不是沒成功過，真正的問題可能是以前的方法你做得到一陣子，但沒有辦法一直維持。",
      question: "你自己回頭看，比較像方法太辛苦，還是瘦下來之後慢慢又回到原本的生活？",
      reason: "follow_latest:regain",
    };
  }
  if (/不想放棄喜歡吃的|繼續吃喜歡的|不能吃喜歡/.test(t) && !/婚宴/.test(t)) {
    return {
      response: "所以你不是不想瘦，而是不想為了瘦把吃東西的樂趣整個拿掉。",
      question: "除了「還能吃喜歡的東西」之外，你自己有沒有也想改變的地方？",
      reason: "follow_latest:food_pleasure",
    };
  }
  if (/不是沒時間.{0,20}不知道吃|不知道吃什麼/.test(t)) {
    return {
      response: "所以卡點比較不是時間不夠，而是到了要吃的時候不知道選什麼。",
      question: "不知道吃什麼，比較像是沒有一套你信的方法，還是選擇太多、當下決定不了？",
      reason: "follow_latest:knowledge_not_time",
    };
  }
  if (/晚上容易亂吃|晚上一直吃|宵夜/.test(t) && !/減過|胖回來/.test(t)) {
    return {
      response: "",
      question: "晚上會吃，比較像是白天吃太少所以補回來，還是晚上那件事本身已經變成習慣？",
      reason: "follow_latest:night_eating",
    };
  }
  if (/婚宴/.test(t) && /好看/.test(t)) {
    return {
      response: "重點比較不像「減脂」本身，而是婚宴那天你希望自己看起來怎樣。",
      question: "為什麼「婚宴要好看」對你特別重要？",
      reason: "follow_latest:wedding_appearance",
    };
  }
  if (/很容易放棄|容易放棄/.test(t) && !/沒變化/.test(t)) {
    return {
      response: "你不是完全沒動力，而是過程中很容易停掉。",
      question: "你通常是在什麼情況下最容易放棄？",
      reason: "follow_latest:dropout",
    };
  }
  if (isPartnerWeightUltimatum(t)) {
    return {
      response: "這次的壓力是從關係來的。我不會假設這就等於你自己也想減。",
      question: "如果今天女朋友沒有這樣要求，你自己還會想減肥嗎？",
      reason: "follow_latest:partner_ultimatum",
    };
  }
  if (isClinicianDirectedWeightLoss(t) && !/紅字|血糖/.test(t)) {
    return {
      response: "這次想改變，是從健康檢查、醫生提醒開始的。我不會拿這個當診斷。",
      question: "醫生當時為什麼特別叫你減肥？他有跟你說最需要注意的是什麼嗎？",
      reason: "follow_latest:clinician",
    };
  }
  return null;
}

function evidenceBackedHypotheses(understanding: UnderstandingState): Array<{ claim: string }> {
  return (understanding.hypotheses ?? [])
    .filter((h) => h.status === "proposed" || h.status === "confirmed")
    .slice(0, 4)
    .map((h) => ({ claim: h.claim }));
}

function factCount(understanding: UnderstandingState): number {
  return [
    understanding.stated_goal,
    understanding.immediate_trigger,
    understanding.deeper_motivation,
    understanding.desired_future,
    understanding.emotional_significance,
    understanding.primary_barrier,
    understanding.dropout_pattern,
    understanding.lifestyle_constraints,
    understanding.unacceptable_tradeoffs,
  ].filter(isFact).length;
}

export function questionIsNecessary(input: {
  question: string;
  answer: string;
  response: string;
  understanding: UnderstandingState;
  model: CurrentHumanModel;
}): { necessary: boolean; reason: string; preferredMove: string } {
  const q = input.question.trim();
  const synthesis = looksLikeCausalSynthesis(input.response, input.answer, input.understanding);
  if (isInterviewChallenge(input.answer)) {
    return { necessary: true, reason: "return_control", preferredMove: "explain_and_return_control" };
  }
  if (isParaphraseVerification(input.response, q, input.answer)) {
    return { necessary: false, reason: "paraphrase_verify", preferredMove: "follow_new_information" };
  }
  if (q && (isWeakInterviewLanguage(q) || isFakeDepthQuestion(input.answer, q) || UNIVERSAL_BINARY_RE.test(q))) {
    return { necessary: false, reason: "weak_or_fake_depth", preferredMove: "follow_new_information" };
  }
  const spoken = `${input.response} ${q}`;
  const usesNew = questionUsesNewInformation(input.answer, spoken);
  if (input.model.information_value === "high" && q && !usesNew) {
    return { necessary: false, reason: "stale_after_high_info", preferredMove: "follow_new_information" };
  }
  if (!q) {
    if (synthesis || (input.model.information_value === "high" && factCount(input.understanding) >= 3)) {
      return { necessary: false, reason: "reflection_sufficient", preferredMove: "reflect_and_verify" };
    }
    return { necessary: true, reason: "need_a_move", preferredMove: "follow_new_information" };
  }
  if (/還是|比較像/.test(q) && usesNew) {
    return { necessary: true, reason: "distinguishes_hypotheses", preferredMove: "distinguish_two_explanations" };
  }
  if (
    synthesis &&
    input.model.information_value === "high" &&
    factCount(input.understanding) >= 3 &&
    !/還是|比較像/.test(q)
  ) {
    return { necessary: false, reason: "synthesis_better_than_probe", preferredMove: "reflect_and_verify" };
  }
  if (input.model.information_value === "low") {
    return { necessary: true, reason: "clarify_low_information", preferredMove: "acknowledge_and_ask" };
  }
  if (usesNew) {
    return { necessary: true, reason: "expected_information_gain", preferredMove: "follow_new_information" };
  }
  return { necessary: false, reason: "no_information_gain", preferredMove: "reflect_and_verify" };
}

function keepCurrentResponse(current?: { response?: string }): string {
  const response = current?.response?.trim() || "";
  if (!response || /很好的動機|我理解|謝謝你的分享|這很重要/.test(response)) return "";
  return response;
}

function highInformationRepair(
  answer: string,
  understanding: UnderstandingState,
  model: CurrentHumanModel,
  current?: { response?: string; question?: string },
): { response: string; question: string; complete: boolean; reason: string } | null {
  const synthesis =
    synthesizeReflection(model, answer, understanding) ||
    (looksLikeCausalSynthesis(current?.response ?? "", answer, understanding)
      ? (current?.response ?? "").trim()
      : "");
  if (hasReversalOrUndoShape(answer)) {
    return {
      response: synthesis || "所以你現在比較在意的，可能不是能不能開始，而是最後會不會又回到原點。",
      question: reversalFollowupQuestion(understanding, answer),
      complete: false,
      reason: "follow_high_info:reversal",
    };
  }
  const locating = genericAffectLocatingQuestion(answer, understanding);
  if (locating && synthesis) {
    return {
      response: synthesis,
      question: locating,
      complete: false,
      reason: "follow_high_info:locate_affect",
    };
  }
  const fromAnswer = discriminatingQuestionFromAnswer(answer, understanding);
  const candidateQuestion = fromAnswer && !isWeakInterviewLanguage(fromAnswer) ? fromAnswer : "";
  const gate = questionIsNecessary({
    question: candidateQuestion,
    answer,
    response: synthesis,
    understanding,
    model,
  });
  if (synthesis && !gate.necessary) {
    return {
      response: synthesis,
      question: SYNTHESIS_VERIFY_QUESTION,
      complete: false,
      reason: "reflect_and_verify:synthesis",
    };
  }
  if (synthesis && candidateQuestion && questionUsesNewInformation(answer, `${synthesis} ${candidateQuestion}`)) {
    return {
      response: synthesis,
      question: candidateQuestion,
      complete: false,
      reason: "follow_high_info:discriminating",
    };
  }
  if (synthesis) {
    return {
      response: synthesis,
      question: SYNTHESIS_VERIFY_QUESTION,
      complete: false,
      reason: "reflect_and_verify:synthesis",
    };
  }
  return null;
}

export function repairConsultantTurn(
  answer: string,
  understanding: UnderstandingState,
  current?: { response?: string; question?: string },
  before?: UnderstandingState,
): { response: string; question: string; complete: boolean; reason: string } {
  const model = buildCurrentHumanModel({
    answer,
    before: before ?? understanding,
    after: understanding,
  });

  if (model.information_value === "high") {
    const high = highInformationRepair(answer, understanding, model, current);
    if (high) return high;
  }

  const latest = consultantMoveFromLatest(answer, understanding);
  if (latest) {
    return { ...latest, complete: false };
  }

  const fromAnswer = discriminatingQuestionFromAnswer(answer, understanding);
  if (
    fromAnswer &&
    !isWeakInterviewLanguage(fromAnswer) &&
    !UNIVERSAL_BINARY_RE.test(fromAnswer)
  ) {
    return {
      response: keepCurrentResponse(current),
      question: fromAnswer,
      complete: false,
      reason: "follow_latest:discriminating",
    };
  }

  const contradicted = (understanding.hypotheses ?? []).filter((h) => h.status === "contradicted");
  if (contradicted.length > 0) {
    return {
      response: "這跟你前面說的好像不太一樣。我想先對齊，不想自己猜。",
      question: "你比較想讓我以哪一句為準？",
      complete: false,
      reason: "resolve_contradiction",
    };
  }

  const hyps = evidenceBackedHypotheses(understanding);
  if (hyps.length >= 2) {
    return {
      response: keepCurrentResponse(current),
      question: `目前比較像「${clipStatement(hyps[0].claim, 16)}」，還是「${clipStatement(hyps[1].claim, 16)}」？`,
      complete: false,
      reason: "distinguish_evidence_hypotheses",
    };
  }

  if (usefulUnderstandingReady(understanding)) {
    return { response: keepCurrentResponse(current), question: "", complete: true, reason: "enough_known" };
  }

  const clip = clipStatement(answer, 18);
  if (answer.trim().length >= 2 && clip) {
    return {
      response: keepCurrentResponse(current),
      question: `你剛說「${clip}」。這句話裡，你最希望我先聽懂的是哪一部分？`,
      complete: false,
      reason: "open_contextual",
    };
  }

  return {
    response: keepCurrentResponse(current),
    question: "用你自己的話講一件最近的事就好，哪怕只是一個例子。",
    complete: false,
    reason: "open_contextual_last",
  };
}

export function conversationalFollowup(answer: string, understanding: UnderstandingState): string {
  return repairConsultantTurn(answer, understanding).question;
}

function followsLatestRepair(question: string, latestQuestion: string): boolean {
  if (!question.trim() || !latestQuestion.trim()) return false;
  if (sharesContent(latestQuestion, question)) return true;
  const keys = latestQuestion.match(
    /身材|減脂|認識|女生|單身|狀態|自信|照鏡|衣服|階段|對照|方法|生活|維持|醫生|自己還會|吃什麼|決定|備餐|婚宴|放棄|撐不久|血糖|紅字/,
  );
  if (!keys) return false;
  return keys.some((k) => question.includes(k));
}

export function consultantTurnNeedsRepair(input: {
  answer: string;
  response: string;
  question: string;
  understanding: UnderstandingState;
  before?: UnderstandingState;
}): { repair: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const value = classifyInformationValue(input.answer, input.before ?? input.understanding);
  if (!input.question.trim()) {
    if (looksLikeCausalSynthesis(input.response, input.answer, input.understanding)) {
      return { repair: false, reasons: [] };
    }
    return { repair: true, reasons: ["empty_question"] };
  }
  if (isParaphraseVerification(input.response, input.question, input.answer)) {
    reasons.push("paraphrase_verify");
  }
  if (value === "high" && !questionUsesNewInformation(input.answer, `${input.response} ${input.question}`)) {
    reasons.push("ignores_high_information");
  }
  const latest = consultantMoveFromLatest(input.answer, input.understanding);
  if (
    latest &&
    value !== "high" &&
    !followsLatestRepair(input.question, latest.question)
  ) {
    reasons.push("misses_latest_statement");
  }
  if (isWeakInterviewLanguage(input.question) || UNIVERSAL_BINARY_RE.test(input.question)) {
    reasons.push("weak_language");
  }
  if (isFakeDepthQuestion(input.answer, input.question)) reasons.push("fake_depth");
  if (isParrotingQuestion(input.answer, input.question)) reasons.push("parroting");
  if (isUnjustifiedBinaryQuestion(input.question, input.answer, input.understanding)) {
    reasons.push("unjustified_binary");
  }
  if (isGenericProbe(input.question) && !sharesContent(input.answer, input.question)) {
    reasons.push("anyone_question");
  }
  if (
    input.answer.trim().length >= 4 &&
    !sharesContent(input.answer, `${input.response} ${input.question}`) &&
    (isGenericProbe(input.question) || isWeakInterviewLanguage(input.question))
  ) {
    reasons.push("unused_new_information");
  }
  return { repair: reasons.length > 0, reasons };
}

export function mustReplaceConversationalQuestion(input: {
  question: string;
  answer: string;
  understanding?: UnderstandingState;
  lowValue: boolean;
  microDetail: boolean;
  forbiddenPurpose: boolean;
  staleQuote: boolean;
  followsLatest: boolean;
  pivoted: boolean;
  highInformation?: boolean;
  paraphraseVerify?: boolean;
}): boolean {
  if (input.paraphraseVerify) return true;
  if (input.lowValue || input.microDetail || input.forbiddenPurpose) return true;
  if (isWeakInterviewLanguage(input.question) || UNIVERSAL_BINARY_RE.test(input.question)) return true;
  if (isFakeDepthQuestion(input.answer, input.question)) return true;
  if (isParrotingQuestion(input.answer, input.question)) return true;
  if (input.understanding && isUnjustifiedBinaryQuestion(input.question, input.answer, input.understanding)) {
    return true;
  }
  if (isGenericProbe(input.question) && !input.followsLatest) return true;
  if (input.staleQuote) return true;
  if (input.pivoted && !input.followsLatest) return true;
  if (input.highInformation && !input.followsLatest) return true;
  return false;
}

export function compactTranscript(
  turns: InterviewSessionState["turns"],
  options?: { currentTurnId?: string; currentAnswer?: string },
): Array<{ r: "U" | "A"; t: string }> {
  const currentTurnId = options?.currentTurnId;
  const currentAnswer = (options?.currentAnswer ?? "").trim();
  const rows = turns.filter((t) => {
    if (!t.text.trim()) return false;
    if (currentTurnId && t.id === currentTurnId) return false;
    if (t.role === "user" && currentAnswer && t.text.trim() === currentAnswer) return false;
    return true;
  });
  return rows.slice(-6).map((t) => ({
    r: t.role === "user" ? "U" : "A",
    t: t.text.slice(0, 160),
  }));
}

export function buildConversationalMemory(input: {
  state: InterviewSessionState;
  previousQuestion: string;
  currentAnswer: string;
  userTurnId: string;
}): {
  recent: Array<{ r: "U" | "A"; t: string }>;
  facts: Record<string, string>;
  hypotheses: Array<{ c: string; s: string }>;
  contradictions: string[];
  previous_intent: string;
} {
  const facts: Record<string, string> = {};
  for (const [key, field] of Object.entries(input.state.understanding)) {
    if (!field || typeof field !== "object" || !("kind" in field)) continue;
    const typed = field as { value: string; kind: string };
    if (typed.kind === "fact" && typed.value) facts[key] = typed.value.slice(0, 120);
  }
  const hypotheses = (input.state.understanding.hypotheses ?? [])
    .filter((h) => h.status === "proposed" || h.status === "confirmed")
    .slice(0, 4)
    .map((h) => ({ c: h.claim.slice(0, 80), s: h.status }));
  const contradictions = (input.state.understanding.hypotheses ?? [])
    .filter((h) => h.status === "contradicted")
    .slice(0, 3)
    .map((h) => h.claim.slice(0, 80));
  return {
    recent: compactTranscript(input.state.turns, {
      currentTurnId: input.userTurnId,
      currentAnswer: input.currentAnswer,
    }),
    facts,
    hypotheses,
    contradictions,
    previous_intent: input.previousQuestion.slice(0, 160),
  };
}

/** Reflection may add understanding. It must never look like a second active question. */
export function interviewActivePresentation(input: {
  response: string | null | undefined;
  question: string;
}): { reflection: string | null; question: string } {
  const question = input.question.trim();
  let reflection = (input.response ?? "").trim();
  if (!reflection) return { reflection: null, question };
  if (reflection === question) return { reflection: null, question };
  const parts = reflection
    .split(/\n+|(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const EMPTY_ACK =
    /^(我了解|我理解|我懂了|這很重要|謝謝你的分享|謝謝分享|聽起來不容易|沒問題|好的|這是一個很好的動機|很好的動機)[。．.！!？?\s]*$/;
  const kept = parts.filter((part) => {
    if (!part || part === question) return false;
    if (question && part.includes(question)) return false;
    if (EMPTY_ACK.test(part)) return false;
    const looksLikeQuestion = /[？?]$/.test(part) && part.length >= 8;
    return !looksLikeQuestion;
  });
  reflection = kept.join("");
  if (!reflection || reflection === question) return { reflection: null, question };
  return { reflection, question };
}

export function usefulUnderstandingReady(u: UnderstandingState): boolean {
  const hasMotivation =
    isFact(u.stated_goal) ||
    isFact(u.immediate_trigger) ||
    isFact(u.deeper_motivation) ||
    isFact(u.desired_future) ||
    isFact(u.emotional_significance);
  const hasConstraint =
    isFact(u.primary_barrier) ||
    isFact(u.dropout_pattern) ||
    isFact(u.interpretation_pattern) ||
    isFact(u.lifestyle_constraints) ||
    isFact(u.unacceptable_tradeoffs) ||
    isFact(u.perceived_cost_of_change) ||
    isFact(u.behavior_constraints);
  const hasChangeFit =
    isFact(u.acceptable_change) || isFact(u.readiness_stage) || isFact(u.support_receptivity);
  return hasMotivation && hasConstraint && hasChangeFit;
}
