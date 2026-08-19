import type { InterviewAiTurn, InterviewSessionState } from "@/lib/analysis/interview/interview-contract";
import {
  isFact,
  isKnown,
  mergeUnderstanding,
  publicUnderstandingSummary,
  type InterviewKnowledgeField,
  type InterviewUnderstandingKey,
  type UnderstandingState,
} from "@/lib/analysis/interview/understanding-state";
import { BANNED_FILLER_RE, extractDeterministicFacts, hasConfirmedHypothesis, patchesToPartial } from "@/lib/analysis/interview/interview-grounding";
import {
  assessTopicSufficiency,
  evaluateSteering,
  isAllowedQuestionPurpose,
  isForbiddenQuestionPurpose,
  isMicroDetailQuestion,
  purposeForGap,
  type HighValueGap,
  type QuestionPurpose,
  type SteeringDecision,
} from "@/lib/analysis/interview/interview-steering";

export type { HighValueGap, QuestionPurpose, SteeringDecision };
export { evaluateSteering, isAllowedQuestionPurpose, isForbiddenQuestionPurpose, isMicroDetailQuestion, purposeForGap };

/**
 * P2.4.1 — interview reasoning quality.
 * No extra LLM call. Program evaluates sufficiency / information-gain / low-value
 * questions and may replace the next question or force completion.
 */

export type SufficiencySnapshot = {
  motivation: boolean;
  barrier: boolean;
  mechanism: boolean;
  changeFit: boolean;
  readiness: boolean;
};

const LOW_VALUE_QUESTION_RE =
  /可以多說一點|再具體|還有其他原因|還有呢\？|你覺得.{0,16}感受|具體是什麼|可以再說|哪個部分最麻煩|希望得到什麼樣的支持|穿上這些衣服有什麼|理想中的簡單|具體的想法或期待|展現的具體形象|對於這個體重的感受|除了.{0,8}還有|你的感受是什麼|你有什麼想法|你最大的困難是什麼|你希望怎麼改變|你希望達到什麼目標|具體來說呢|對你有什麼影響/;

const MEANING_REPROBE_RE = /婚宴.{0,8}(形象|感受|期待)|一輩子.{0,6}(意義|重要)|結婚.{0,10}(感受|意義)/;
const CLOTHING_ELABORATION_RE = /穿上這些衣服|衣服有什麼.{0,6}(期待|想法)|穿好看.{0,8}(期待|感受)/;
const MEAL_PREP_DETAIL_RE = /備餐.{0,10}(哪|困難|麻煩|部分)|對於備餐/;
const SUPPORT_DETAIL_RE = /希望得到什麼樣的支持|什麼樣的幫助|需要什麼支持/;
const GENERIC_MOTIVATION_LOOP_RE = /還有其他.{0,6}(原因|動機)|除了.{0,10}還有/;
const DURATION_ASK_BACK_RE = /希望.{0,6}(多久|多長)|想在多長|期望.{0,4}(週期|時間)/;

export const QUIZ_ARCHETYPE_LEAK_RE = /執行強度過高|快樂補償|管不住嘴|意志力不夠/;

export function assessSufficiency(u: UnderstandingState): SufficiencySnapshot {
  const motivation =
    (isFact(u.desired_future) && isFact(u.emotional_significance)) ||
    (isFact(u.immediate_trigger) && isFact(u.emotional_significance)) ||
    (isFact(u.deeper_motivation) && isFact(u.desired_future)) ||
    (isFact(u.immediate_trigger) && isFact(u.safety_context));

  const barrier =
    isFact(u.primary_barrier) ||
    isFact(u.dropout_pattern) ||
    isFact(u.perceived_cost_of_change) ||
    isFact(u.unacceptable_tradeoffs);

  const mechanismFromBarrier =
    isFact(u.barrier_mechanism) &&
    !(
      /忙|工時|工作時間|時間太長|不知道怎麼做/.test(u.barrier_mechanism.value) &&
      !/外食|備餐|週末|宵夜|沒變化|不適合/.test(u.barrier_mechanism.value)
    );
  const mechanismFromInterpretation =
    isFact(u.interpretation_pattern) &&
    !(/放棄/.test(u.interpretation_pattern.value) && !/不適合|沒變化|看不到|以為|解釋/.test(u.interpretation_pattern.value));
  const mechanism =
    mechanismFromBarrier ||
    mechanismFromInterpretation ||
    (isFact(u.lifestyle_constraints) && isFact(u.perceived_cost_of_change)) ||
    hasConfirmedHypothesis(u) ||
    (isFact(u.unacceptable_tradeoffs) && isFact(u.desired_future));

  const changeFit =
    isFact(u.acceptable_change) ||
    isFact(u.unacceptable_tradeoffs) ||
    isFact(u.support_receptivity);

  const readiness = isFact(u.readiness_stage);

  return { motivation, barrier, mechanism, changeFit, readiness };
}

/** Semantic sufficiency: dimensions, not field completeness. Unknowns are allowed. */
export function semanticEnough(u: UnderstandingState): boolean {
  const s = assessSufficiency(u);
  return s.motivation && s.barrier && s.mechanism && s.changeFit && s.readiness;
}

export function namedHighValueGap(u: UnderstandingState): HighValueGap {
  const s = assessSufficiency(u);
  if (!s.motivation) return "motivation_meaning";
  if (!s.barrier) return "barrier";
  if (isFact(u.unacceptable_tradeoffs) && !isFact(u.desired_future)) {
    return "motivation_meaning";
  }
  if (!s.mechanism) {
    const busy = /忙|時間|工作|不知道怎麼/.test(
      `${u.primary_barrier.value}${u.lifestyle_constraints.value}`,
    );
    if (isFact(u.lifestyle_constraints) && busy) {
      if (!isFact(u.behavior_constraints)) return "environment";
      if (!isFact(u.perceived_cost_of_change)) return "execution_cost";
      return "knowledge_vs_execution";
    }
    return "dropout_or_interpretation";
  }
  if (!s.changeFit || !s.readiness) return s.changeFit ? "readiness" : "change_fit_hypothesis";
  return "none";
}

export function isLowValueQuestion(question: string, u: UnderstandingState): boolean {
  const q = question.trim();
  if (!q) return false;
  if (BANNED_FILLER_RE.test(q) || LOW_VALUE_QUESTION_RE.test(q) || isMicroDetailQuestion(q)) return true;
  const s = assessSufficiency(u);
  const topics = assessTopicSufficiency(u);
  if (s.motivation && MEANING_REPROBE_RE.test(q)) return true;
  if (topics.weddingMeaning && /風格|主題|場地|理想中的樣子/.test(q)) return true;
  if (topics.foodTradeoff && /最不想放棄|哪些食物|哪一種食物/.test(q)) return true;
  if (isKnown(u.desired_future) && /衣服/.test(u.desired_future.value) && CLOTHING_ELABORATION_RE.test(q)) {
    return true;
  }
  if (isKnown(u.perceived_cost_of_change) && /備餐|麻煩/.test(u.perceived_cost_of_change.value) && MEAL_PREP_DETAIL_RE.test(q)) {
    return true;
  }
  if (
    topics.mealPrepCost &&
    /願意(開始|試)/.test(q) &&
    !/不用自己|簡單調整|原本.{0,8}吃/.test(q)
  ) {
    return true;
  }
  if (
    !isFact(u.perceived_cost_of_change) &&
    /不用自己備餐/.test(q)
  ) {
    return true;
  }
  if (
    isKnown(u.desired_future) &&
    /最可能讓你最後還是沒/.test(q) &&
    !q.includes(clip(u.desired_future.value, 6).replace(/…$/, ""))
  ) {
    return true;
  }
  if ((isKnown(u.support_receptivity) || isKnown(u.acceptable_change)) && SUPPORT_DETAIL_RE.test(q)) {
    return true;
  }
  if (
    isKnown(u.desired_future) &&
    /低摩擦的調整|一次變成另一種人|比較簡單的方法/.test(q) &&
    !q.includes(clip(u.desired_future.value, 4).replace(/…$/, ""))
  ) {
    return true;
  }
  if (s.motivation && isKnown(u.emotional_significance) && GENERIC_MOTIVATION_LOOP_RE.test(q)) {
    return true;
  }
  return false;
}

export function looksLikeTrialWillingness(answer: string): boolean {
  return /好像可以試試看|可以試試看|我願意試|我想試試|願意先試/.test(answer) && !/[?？]/.test(answer);
}

export function shouldBypassInterviewLlm(input: {
  answer: string;
  understanding: UnderstandingState;
}): { bypass: boolean; reason: "user_question" | "trial_complete" | null } {
  if (!looksLikeTrialWillingness(input.answer)) {
    return { bypass: false, reason: null };
  }
  const facts = extractDeterministicFacts(input.answer, "preview");
  const merged = mergeUnderstanding(input.understanding, patchesToPartial(facts));
  if (semanticEnough(merged)) {
    return { bypass: true, reason: "trial_complete" };
  }
  return { bypass: false, reason: null };
}

export function shouldCompleteImmediately(u: UnderstandingState, answer: string): boolean {
  if (!looksLikeTrialWillingness(answer)) return false;
  return semanticEnough(u);
}

export function needsSafetyBoundary(state: InterviewSessionState, u: UnderstandingState): boolean {
  const medical = state.safety.flagged || state.safety.userReportedMedical;
  if (!medical) return false;
  if (state.safety.askedSafetyQuestion) return false;
  if (isKnown(u.safety_context)) return false;
  return true;
}

function clip(text: string, max = 18): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function gapFromAnswerMeaning(
  classified: InterviewUnderstandingKey[],
  current: HighValueGap,
  u: UnderstandingState,
  answer: string,
): HighValueGap {
  if (classified.includes("lifestyle_constraints")) {
    if (!isFact(u.behavior_constraints)) return "environment";
    if (!isFact(u.perceived_cost_of_change)) return "execution_cost";
    return "knowledge_vs_execution";
  }
  if (classified.includes("unacceptable_tradeoffs") && !isFact(u.desired_future)) {
    return "motivation_meaning";
  }
  if (classified.includes("perceived_cost_of_change") && /又胖|復胖|胖回去/.test(answer)) {
    return "dropout_or_interpretation";
  }
  if (classified.includes("readiness_stage") && /不想改|不太想|只是被問/.test(answer)) {
    return "motivation_meaning";
  }
  if (classified.includes("desired_future") && isFact(u.unacceptable_tradeoffs)) {
    return "readiness";
  }
  if (classified.includes("primary_barrier") && current === "motivation_meaning") {
    return "barrier";
  }
  if (classified.includes("emotional_significance") && current === "motivation_meaning") {
    return "barrier";
  }
  return current;
}

export function userQuestionKind(
  text: string,
): "duration" | "cost" | "how_it_works" | "support" | "difficulty" | null {
  const t = text.trim();
  if (/需要多久|要多久|幾週|多久才|要幾天/.test(t)) return "duration";
  if (/多少錢|貴不貴|費用|價格/.test(t)) return "cost";
  if (/要怎麼做|怎麼開始|那要怎麼|怎麼進行|怎麼運作/.test(t)) return "how_it_works";
  if (/[?？]|嗎/.test(t) && /有人.*幫|陪我|教練|有人可以/.test(t)) return "support";
  if (/會不會很(辛苦|難)|限制很多|不能吃嗎|難不難|很嚴格嗎/.test(t)) return "difficulty";
  return null;
}

export function userQuestionOverride(kind: NonNullable<ReturnType<typeof userQuestionKind>>): {
  assistant_response: string;
  next_question: string;
  conversionType: "duration_question" | "cost_question" | "how_it_works" | "support_interest" | "readiness_language";
} {
  switch (kind) {
    case "duration":
      return {
        assistant_response:
          "這沒有固定週期。需要多久，取決於你想改到什麼程度、以及你實際做得到的改變是什麼。你現在問這個，比較像是在評估這件事會不會太久、太辛苦。",
        next_question: "如果不是一次做到理想身材，而是先用一小段時間看看自己能不能開始有變化，你會比較願意試嗎？",
        conversionType: "duration_question",
      };
    case "cost":
      return {
        assistant_response: "這一階段不是在談費用或方案，我現在也沒有要向你收費。你問這個，比較像在評估划不划算、值不值得開始。",
        next_question: "如果先不談花錢，只談你做不做得到的改變，你現在比較卡的是「太麻煩」還是「還沒準備好」？",
        conversionType: "cost_question",
      };
    case "how_it_works":
      return {
        assistant_response: "我現在還在了解你卡住的方式，不會先丟一套計畫。會先抓真正的卡點，再談你做得到的調整。",
        next_question: "如果有一個你現在生活裡做得到的小調整，你會比較想先試哪一種：少一點摩擦，還是先看到一點變化？",
        conversionType: "how_it_works",
      };
    case "support":
      return {
        assistant_response: "你問有沒有人幫，我聽到的是：自己硬撐可能不是你要的。我不會先推陪跑或教練。",
        next_question: "如果只是有人幫你微調方法、而不是讓你一個人猜，你會比較願意開始嗎？",
        conversionType: "support_interest",
      };
    case "difficulty":
      return {
        assistant_response: "不一定等於很多東西都不能吃，或把自己過得很嚴格。這正是我現在想先弄清楚的。",
        next_question: "你最不能接受的，是少吃喜歡的東西，還是生活被管得很死？",
        conversionType: "readiness_language",
      };
  }
}

export function durationAsksBack(text: string): boolean {
  return DURATION_ASK_BACK_RE.test(text);
}

export function applyInformationGain(input: {
  understanding: UnderstandingState;
  answer: string;
  ai: InterviewAiTurn;
  userQuestion: boolean;
  previousGap?: HighValueGap;
  previousQuestion?: string;
  before?: UnderstandingState;
}): InterviewAiTurn {
  void input.previousGap;
  void input.previousQuestion;
  void input.before;
  if (input.userQuestion) return input.ai;
  const gap = namedHighValueGap(input.understanding);
  if (gap === "none" || semanticEnough(input.understanding) || shouldCompleteImmediately(input.understanding, input.answer)) {
    return {
      ...input.ai,
      next_action: "complete",
      follow_up_question: null,
      reason_for_next_question: "no_important_uncertainty",
    };
  }
  return input.ai;
}

const FACT_PRIORITY: Array<keyof Pick<
  UnderstandingState,
  | "desired_future"
  | "deeper_motivation"
  | "stated_goal"
  | "immediate_trigger"
  | "emotional_significance"
>> = ["desired_future", "deeper_motivation", "stated_goal", "immediate_trigger", "emotional_significance"];

const BARRIER_PRIORITY: Array<keyof Pick<
  UnderstandingState,
  | "interpretation_pattern"
  | "dropout_pattern"
  | "primary_barrier"
  | "perceived_cost_of_change"
  | "barrier_mechanism"
  | "lifestyle_constraints"
  | "behavior_constraints"
  | "unacceptable_tradeoffs"
>> = [
  "interpretation_pattern",
  "dropout_pattern",
  "primary_barrier",
  "perceived_cost_of_change",
  "barrier_mechanism",
  "lifestyle_constraints",
  "behavior_constraints",
  "unacceptable_tradeoffs",
];

function pickKnown(
  u: UnderstandingState,
  keys: Array<keyof UnderstandingState>,
  prefer: "fact" | "any" = "any",
): InterviewKnowledgeField | null {
  const fields = keys
    .map((k) => u[k])
    .filter((f): f is InterviewKnowledgeField => Boolean(f) && typeof f === "object" && "kind" in f && isKnown(f as InterviewKnowledgeField))
    .filter((f) => !QUIZ_ARCHETYPE_LEAK_RE.test(f.value));
  if (prefer === "fact") {
    const fact = fields.find((f) => f.kind === "fact");
    if (fact) return fact;
  }
  return fields[0] ?? null;
}

export function selectLayer1Motivation(u: UnderstandingState): string | null {
  return pickKnown(u, FACT_PRIORITY, "fact")?.value ?? null;
}

export function selectLayer1Barrier(u: UnderstandingState): string | null {
  const work =
    isFact(u.lifestyle_constraints) &&
    /忙|工時|工作/.test(`${u.lifestyle_constraints.value} ${u.primary_barrier.value}`);
  const friction =
    isFact(u.perceived_cost_of_change) &&
    /備餐|麻煩|外食|外送|複雜/.test(`${u.perceived_cost_of_change.value} ${u.behavior_constraints.value}`);
  if (work && friction) {
    return "工作負荷高，加上覺得改變等於備餐／很複雜，執行摩擦太大";
  }
  const dropout = isFact(u.dropout_pattern) && isFact(u.interpretation_pattern);
  if (
    dropout &&
    /沒變化|不適合|放棄/.test(`${u.dropout_pattern.value}${u.interpretation_pattern.value}${u.primary_barrier.value}`)
  ) {
    return "看不到變化時會懷疑方法不適合，接著就放棄";
  }
  const picked = pickKnown(u, BARRIER_PRIORITY, "fact");
  if (picked && /血糖|紅字|血壓|膽固醇/.test(picked.value) && !/不敢|沒辦法/.test(picked.value)) {
    return null;
  }
  return picked?.value ?? null;
}

export function compactQuizForPrompt(quiz: {
  animalName: string;
  tagline: string;
  headline: string;
  coreInsight: string;
  primaryGoal: string | null;
  readiness: string | null;
}) {
  return {
    prior_only: true,
    animal: quiz.animalName,
  };
}

export function compactConfirmedFacts(u: UnderstandingState): Record<string, string> {
  const out: Record<string, string> = {};
  const summary = publicUnderstandingSummary(u);
  for (const [key, field] of Object.entries(summary)) {
    if (field.kind !== "fact" || !field.value) continue;
    out[key] = field.value.slice(0, 120);
  }
  return out;
}

export function compactActiveHypotheses(
  u: UnderstandingState,
): Array<{ c: string; s: "proposed" | "confirmed" }> {
  return (u.hypotheses ?? [])
    .filter((h) => h.status === "proposed" || h.status === "confirmed")
    .slice(0, 4)
    .map((h) => ({ c: h.claim.slice(0, 80), s: h.status as "proposed" | "confirmed" }));
}

/**
 * Conversational memory window: last 4–6 turns.
 * Current answer is sent separately and must not be duplicated here.
 */
export { compactTranscript } from "@/lib/analysis/interview/interview-reasoner";

export function compactEvidence(u: UnderstandingState): Array<{ c: string; k: string }> {
  const confirmed = new Set(Object.values(compactConfirmedFacts(u)));
  return u.key_evidence
    .filter((e) => e.type === "fact")
    .slice(-4)
    .map((e) => ({ c: e.claim.slice(0, 80), k: e.type }))
    .filter((e) => ![...confirmed].some((fact) => fact.includes(e.c) || e.c.includes(fact.slice(0, 40))));
}
