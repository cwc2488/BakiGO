import type { UnderstandingPatchItem } from "@/lib/analysis/interview/interview-contract";
import { isFact, type InterviewUnderstandingKey, type UnderstandingState } from "@/lib/analysis/interview/understanding-state";

export type HighValueGap =
  | "none"
  | "motivation_meaning"
  | "barrier"
  | "dropout_or_interpretation"
  | "knowledge_vs_execution"
  | "environment"
  | "execution_cost"
  | "change_fit_hypothesis"
  | "readiness";

export const QUESTION_PURPOSES = [
  "clarify_motivation",
  "deepen_meaning",
  "identify_barrier",
  "identify_mechanism",
  "test_hypothesis",
  "identify_tradeoff",
  "identify_change_fit",
  "assess_readiness",
  "resolve_safety",
  "answer_user_question",
] as const;
export type QuestionPurpose = (typeof QUESTION_PURPOSES)[number];

export const FORBIDDEN_QUESTION_PURPOSES = ["generic_elaboration", "collect_more_detail", "continue_topic"] as const;

export const MEDICAL_CONTEXT_RE =
  /血糖|紅字|血壓|膽固醇|健檢|體檢|不用吃藥|醫生叫|醫師叫|醫師叮嚀|健康檢查|醫生曾提醒/;
export const MEDICAL_PREVENTS_ACTION_RE =
  /不敢運動|因為.{0,16}(血糖|紅字|血壓|膽固醇).{0,16}(所以|不敢|沒辦法|不能)|血糖.{0,10}(不敢|沒辦法)/;
export const MEDICAL_BARRIER_FIELDS = new Set<InterviewUnderstandingKey>([
  "primary_barrier",
  "barrier_mechanism",
  "dropout_pattern",
  "interpretation_pattern",
]);

export const MICRO_DETAIL_QUESTION_RE =
  /婚宴(風格|主題|場地)|風格或主題|想穿什麼|婚禮細節|最不想放棄.{0,8}(食物|哪)|哪一種食物|哪些食物|哪一家外送|常叫哪一家|哪一件衣服|備餐.{0,10}(步驟|哪一|哪個部分|哪些方面)/;

const FOOD_PROBE_RE = /最不想放棄|哪些食物|哪一種食物|喜歡的東西.{0,8}(哪|什麼)|食物對你/;
const WEDDING_TRIVIA_RE = /風格|主題|場地|想穿什麼|婚禮細節/;

export function isAllowedQuestionPurpose(purpose: string | null | undefined): purpose is QuestionPurpose {
  return Boolean(purpose && (QUESTION_PURPOSES as readonly string[]).includes(purpose));
}

export function isForbiddenQuestionPurpose(purpose: string | null | undefined): boolean {
  return Boolean(purpose && (FORBIDDEN_QUESTION_PURPOSES as readonly string[]).includes(purpose));
}

export function purposeForGap(gap: HighValueGap): QuestionPurpose {
  switch (gap) {
    case "motivation_meaning":
      return "deepen_meaning";
    case "barrier":
      return "identify_barrier";
    case "dropout_or_interpretation":
    case "knowledge_vs_execution":
      return "identify_mechanism";
    case "environment":
      return "identify_mechanism";
    case "execution_cost":
      return "identify_tradeoff";
    case "change_fit_hypothesis":
      return "test_hypothesis";
    case "readiness":
      return "assess_readiness";
    case "none":
      return "assess_readiness";
  }
}

export function isMedicalLabValue(value: string): boolean {
  return MEDICAL_CONTEXT_RE.test(value) && !MEDICAL_PREVENTS_ACTION_RE.test(value) &&
    !/忙|備餐|放棄|外食|外送|不知道怎麼|麻煩/.test(value);
}

export function medicalDomainRejects(item: UnderstandingPatchItem, currentAnswer: string): string | null {
  if (!MEDICAL_BARRIER_FIELDS.has(item.field)) return null;
  const blob = `${item.value}\n${currentAnswer}`;
  if (MEDICAL_PREVENTS_ACTION_RE.test(blob)) return null;
  if (isMedicalLabValue(item.value) || (MEDICAL_CONTEXT_RE.test(item.value) && MEDICAL_CONTEXT_RE.test(currentAnswer))) {
    return "medical_domain_authority";
  }
  if (/健康狀況不佳|臨床|糖尿病|確診/.test(item.value)) return "medical_domain_authority";
  return null;
}

export function appearanceNotSignificance(item: UnderstandingPatchItem, currentAnswer: string): boolean {
  if (item.field !== "emotional_significance") return false;
  const blob = `${item.value}\n${currentAnswer}`;
  if (/一輩子|只有一次|很重要|意義|怕她離開|害怕|在乎/.test(blob)) return false;
  return /好看|風格|主題|場地|衣服/.test(item.value);
}

export function isMicroDetailQuestion(question: string): boolean {
  return MICRO_DETAIL_QUESTION_RE.test(question.trim());
}

export type TopicSufficiency = {
  weddingAppearance: boolean;
  weddingMeaning: boolean;
  foodTradeoff: boolean;
  environment: boolean;
  mealPrepCost: boolean;
  medicalContext: boolean;
  relationshipFear: boolean;
  clothingGoal: boolean;
};

export function assessTopicSufficiency(u: UnderstandingState): TopicSufficiency {
  return {
    weddingAppearance: isFact(u.desired_future) && /婚宴|好看/.test(u.desired_future.value),
    weddingMeaning: isFact(u.emotional_significance) && /一輩子|只有一次|重要/.test(u.emotional_significance.value),
    foodTradeoff: isFact(u.unacceptable_tradeoffs) && /吃/.test(u.unacceptable_tradeoffs.value),
    environment: isFact(u.behavior_constraints) && /外食|外送|餐廳/.test(u.behavior_constraints.value),
    mealPrepCost: isFact(u.perceived_cost_of_change) && /備餐|麻煩/.test(u.perceived_cost_of_change.value),
    medicalContext: isFact(u.safety_context) && MEDICAL_CONTEXT_RE.test(u.safety_context.value),
    relationshipFear: isFact(u.emotional_significance) && /離開|分手/.test(u.emotional_significance.value),
    clothingGoal: isFact(u.desired_future) && /衣服/.test(u.desired_future.value),
  };
}

export function questionServesGap(question: string, gap: HighValueGap, u: UnderstandingState): boolean {
  const q = question.trim();
  if (!q) return gap === "none";
  if (isMicroDetailQuestion(q)) return false;
  const topics = assessTopicSufficiency(u);
  if (topics.weddingMeaning && WEDDING_TRIVIA_RE.test(q)) return false;
  if (topics.foodTradeoff && FOOD_PROBE_RE.test(q)) return false;
  switch (gap) {
    case "motivation_meaning":
      return /為什麼|重要|意義|變成|關係|自己|值得|代價|想改變/.test(q) && !WEDDING_TRIVIA_RE.test(q) && !FOOD_PROBE_RE.test(q);
    case "barrier":
      return /原因|沒做到|沒改成|沒發生|放棄|卡住|還沒開始|卡在/.test(q);
    case "dropout_or_interpretation":
      return /什麼情況|停下來|解釋|怎麼想|腦中/.test(q);
    case "knowledge_vs_execution":
      return /還沒找到|看過|放不進|生活/.test(q);
    case "environment":
      return /吃飯|外食|外送|怎麼解決/.test(q) && !/哪一家/.test(q);
    case "execution_cost":
      return /備餐|麻煩|畫面|認真/.test(q) && !/哪個部分|哪些方面|步驟/.test(q);
    case "change_fit_hypothesis":
      return /不用自己備餐|簡單調整|微調|願意|彈性/.test(q);
    case "readiness":
      return /願意試|試試看|能接受的調整|戒掉|代價/.test(q) && !FOOD_PROBE_RE.test(q);
    case "none":
      return false;
  }
}

export type SteeringDecision = {
  previous_gap: HighValueGap | "unknown";
  newly_confirmed_dimensions: string[];
  invalidated_probe: boolean;
  invalidate_reason: string;
  next_best_gap: HighValueGap;
  topic_sufficient: boolean;
  topic_sufficient_why: string;
  question_purpose: QuestionPurpose;
};

export function newlyConfirmedDimensions(
  before: UnderstandingState,
  after: UnderstandingState,
): string[] {
  const keys: InterviewUnderstandingKey[] = [
    "immediate_trigger",
    "deeper_motivation",
    "desired_future",
    "emotional_significance",
    "primary_barrier",
    "dropout_pattern",
    "interpretation_pattern",
    "lifestyle_constraints",
    "behavior_constraints",
    "perceived_cost_of_change",
    "unacceptable_tradeoffs",
    "acceptable_change",
    "support_receptivity",
    "readiness_stage",
    "safety_context",
  ];
  return keys.filter((k) => !isFact(before[k]) && isFact(after[k]));
}

export function evaluateSteering(input: {
  previousGap: HighValueGap;
  previousQuestion: string;
  before: UnderstandingState;
  after: UnderstandingState;
  answer: string;
  nextGap: HighValueGap;
  proposedQuestion: string;
}): SteeringDecision {
  const confirmed = newlyConfirmedDimensions(input.before, input.after);
  const topics = assessTopicSufficiency(input.after);
  const prevQ = input.previousQuestion;
  let invalidated = false;
  let reason = "";

  if (FOOD_PROBE_RE.test(prevQ) && (confirmed.includes("deeper_motivation") || confirmed.includes("desired_future"))) {
    invalidated = true;
    reason = "new intrinsic/desired_future supersedes food probe";
  }
  if (WEDDING_TRIVIA_RE.test(prevQ) && (topics.weddingAppearance || topics.weddingMeaning)) {
    invalidated = true;
    reason = "wedding trivia stale after appearance/meaning fact";
  }
  if (input.previousGap !== input.nextGap && input.previousGap !== "none") {
    invalidated = true;
    reason = reason || `gap moved ${input.previousGap} → ${input.nextGap}`;
  }
  if (isMicroDetailQuestion(input.proposedQuestion)) {
    invalidated = true;
    reason = reason || "proposed question is micro-detail";
  }

  let topicSufficient = false;
  let topicWhy = "current topic still has analysis value";
  if (topics.weddingMeaning && input.nextGap === "barrier") {
    topicSufficient = true;
    topicWhy = "wedding meaning sufficient; barrier is next";
  } else if (topics.weddingAppearance && !topics.weddingMeaning) {
    topicWhy = "appearance known; one meaning question still valuable";
  } else if (topics.foodTradeoff && confirmed.includes("deeper_motivation")) {
    topicSufficient = true;
    topicWhy = "food tradeoff sufficient; intrinsic shift";
  } else if (topics.clothingGoal) {
    topicSufficient = true;
    topicWhy = "desired future sufficient";
  } else if (topics.environment && !topics.mealPrepCost) {
    topicSufficient = true;
    topicWhy = "eating environment sufficient; cost next";
  } else if (topics.mealPrepCost) {
    topicSufficient = true;
    topicWhy = "execution cost sufficient; hypothesis test next";
  } else if (topics.medicalContext && confirmed.includes("safety_context")) {
    topicSufficient = true;
    topicWhy = "medical context stored; not a barrier";
  }

  return {
    previous_gap: input.previousGap,
    newly_confirmed_dimensions: confirmed,
    invalidated_probe: invalidated,
    invalidate_reason: reason,
    next_best_gap: input.nextGap,
    topic_sufficient: topicSufficient,
    topic_sufficient_why: topicWhy,
    question_purpose: purposeForGap(input.nextGap),
  };
}
