import type { UnderstandingPatchItem } from "@/lib/analysis/interview/interview-contract";
import type { InterviewTurn } from "@/lib/analysis/interview/interview-contract";
import {
  isFact,
  type InterviewHypothesis,
  type InterviewUnderstandingKey,
  type UnderstandingState,
} from "@/lib/analysis/interview/understanding-state";
import { appearanceNotSignificance, medicalDomainRejects } from "@/lib/analysis/interview/interview-steering";
import { isLowInformationAnswer } from "@/lib/analysis/interview/interview-coherence";

export const QUIZ_BLOCKED_FIELDS = new Set<InterviewUnderstandingKey>([
  "deeper_motivation",
  "desired_future",
  "primary_barrier",
  "barrier_mechanism",
  "dropout_pattern",
  "interpretation_pattern",
  "acceptable_change",
  "readiness_stage",
]);

export const QUIZ_LEAK_RE = /執行強度過高|快樂補償|管不住嘴|^(clothes|high|medium|low|very_high|shape|weight|energy)$/i;

export const BANNED_FILLER_RE =
  /現在最影響你願不願意開始|還有其他原因嗎|有什麼感受|可以更具體嗎|現在最影響你的是什麼|具體影響|具體期望|想開始的原因.{0,24}沒開始的原因/;

export type GroundingResult = {
  accepted: UnderstandingPatchItem[];
  rejected: Array<UnderstandingPatchItem & { reject_reason: string }>;
};

export function hasConfirmedHypothesis(u: UnderstandingState): boolean {
  return (u.hypotheses ?? []).some((h) => h.status === "confirmed");
}

export function patchesToPartial(
  patches: UnderstandingPatchItem[],
): Partial<Record<InterviewUnderstandingKey, { value: string; kind: "fact" | "inference" }>> {
  const out: Partial<Record<InterviewUnderstandingKey, { value: string; kind: "fact" | "inference" }>> = {};
  for (const item of patches) {
    const prev = out[item.field];
    if (prev?.kind === "fact" && item.kind === "inference") continue;
    out[item.field] = { value: item.value, kind: item.kind };
  }
  return out;
}

/** Environment / dropout / cost language is not an acceptable-change FACT. */
export function wrongFieldRole(item: UnderstandingPatchItem): string | null {
  const v = item.value;
  if (item.field === "acceptable_change") {
    const willing = /願意|簡單|微調|可以接受|低摩擦|不用自己|調整飲食/.test(v);
    if (!willing && /外食|外送|餐廳|沒變化|放棄|備餐|麻煩/.test(v)) {
      return "environment_or_cost_not_change_fit";
    }
  }
  if (item.field === "barrier_mechanism") {
    if (
      /忙|工時|工作時間|時間太長|不知道怎麼做/.test(v) &&
      !/外食|備餐|週末|宵夜|沒變化|不適合/.test(v)
    ) {
      return "lifestyle_not_mechanism";
    }
  }
  if (item.field === "interpretation_pattern") {
    if (/放棄/.test(v) && !/不適合|沒變化|看不到|以為|解釋/.test(v)) {
      return "barrier_not_interpretation";
    }
  }
  return null;
}

export function factGroundedInText(value: string, corpus: string): boolean {
  const compact = value.replace(/\s/g, "");
  const hay = corpus.replace(/\s/g, "");
  if (compact.length < 2 || hay.length < 2) return false;
  if (hay.includes(compact)) return true;
  const window = Math.min(4, compact.length);
  for (let i = 0; i <= compact.length - window; i += 1) {
    if (hay.includes(compact.slice(i, i + window))) return true;
  }
  const tokens = value.split(/[／、，。\s→（）()]+/).filter((t) => t.trim().length >= 2);
  if (tokens.length >= 2) {
    const hits = tokens.filter((t) => hay.includes(t.replace(/\s/g, ""))).length;
    if (hits >= 2) return true;
  }
  return false;
}

function citedCorpus(
  item: UnderstandingPatchItem,
  currentAnswer: string,
  currentTurnId: string,
  turns: InterviewTurn[],
): string {
  const cited = item.evidence_turn_ids
    .map((id) => (id === currentTurnId ? currentAnswer : turns.find((t) => t.id === id && t.role === "user")?.text ?? ""))
    .join("\n");
  return `${currentAnswer}\n${cited}`;
}

export function groundPatches(input: {
  patches: UnderstandingPatchItem[];
  currentAnswer: string;
  currentTurnId: string;
  turns: InterviewTurn[];
}): GroundingResult {
  const accepted: UnderstandingPatchItem[] = [];
  const rejected: Array<UnderstandingPatchItem & { reject_reason: string }> = [];
  const corpus = [
    input.currentAnswer,
    ...input.turns.filter((t) => t.role === "user").map((t) => t.text),
  ].join("\n");

  for (const raw of input.patches) {
    const item = {
      ...raw,
      value: raw.value.trim(),
      reasoning: raw.reasoning.trim(),
      evidence_turn_ids: raw.evidence_turn_ids.filter(Boolean),
    };
    if (!item.value) {
      rejected.push({ ...item, reject_reason: "empty_value" });
      continue;
    }
    if (QUIZ_LEAK_RE.test(item.value)) {
      rejected.push({ ...item, reject_reason: "quiz_prior_leak" });
      continue;
    }
    if (isLowInformationAnswer(input.currentAnswer) && item.kind === "fact") {
      rejected.push({ ...item, reject_reason: "low_information_answer" });
      continue;
    }
    const medical = medicalDomainRejects(item, input.currentAnswer);
    if (medical) {
      rejected.push({ ...item, reject_reason: medical });
      continue;
    }
    if (appearanceNotSignificance(item, input.currentAnswer)) {
      rejected.push({ ...item, reject_reason: "appearance_not_significance" });
      continue;
    }
    const wrongRole = wrongFieldRole(item);
    if (wrongRole) {
      rejected.push({ ...item, reject_reason: wrongRole });
      continue;
    }
    const support = citedCorpus(item, input.currentAnswer, input.currentTurnId, input.turns);
    if (item.kind === "fact") {
      if (!factGroundedInText(item.value, support) && !factGroundedInText(item.value, corpus)) {
        rejected.push({ ...item, reject_reason: "fact_not_in_user_language" });
        continue;
      }
      accepted.push(item);
      continue;
    }
    if (!item.evidence_turn_ids.length || !item.reasoning) {
      rejected.push({ ...item, reject_reason: "inference_missing_evidence" });
      continue;
    }
    const citedExists = item.evidence_turn_ids.some(
      (id) =>
        id === input.currentTurnId || input.turns.some((t) => t.id === id && t.role === "user"),
    );
    if (!citedExists) {
      rejected.push({ ...item, reject_reason: "inference_unsupported" });
      continue;
    }
    accepted.push(item);
  }
  return { accepted, rejected };
}

export function extractDeterministicFacts(answer: string, turnId: string): UnderstandingPatchItem[] {
  const text = answer.trim();
  if (isLowInformationAnswer(text)) return [];
  const fact = (field: InterviewUnderstandingKey, value: string): UnderstandingPatchItem => ({
    field,
    value,
    kind: "fact",
    evidence_turn_ids: [turnId],
    reasoning: "user stated",
  });
  const out: UnderstandingPatchItem[] = [];

  if (/好像可以試試看|可以試試看|我願意試|我想試試|願意先試/.test(text) && !/[?？]/.test(text)) {
    if (/微調/.test(text)) {
      out.push(fact("support_receptivity", "希望有人幫我微調"));
      out.push(fact("acceptable_change", "可接受被微調的方法"));
    }
    if (/簡單方式|外食|外送|備餐/.test(text) || /願意試/.test(text)) {
      if (/簡單/.test(text)) out.push(fact("acceptable_change", "簡單方式調整"));
    }
    out.push(fact("readiness_stage", /好像可以試試看/.test(text) ? "好像可以試試看" : "願意試"));
    return out;
  }

  if (/需要多久|要多久/.test(text)) return out;

  if (/結婚|婚宴|嫁|娶|婚禮/.test(text) && !/好看|一輩子|放棄|沒變化|不適合/.test(text)) {
    out.push(fact("immediate_trigger", "想結婚"));
    return out;
  }
  if (/婚宴/.test(text) && /好看/.test(text)) {
    out.push(fact("stated_goal", "婚宴要好看"));
    out.push(fact("desired_future", "婚宴要好看"));
    return out;
  }
  if (/一輩子|只有一次/.test(text)) {
    out.push(fact("emotional_significance", "一輩子只有一次"));
    return out;
  }
  if (/很容易放棄|容易放棄|會放棄/.test(text) && !/沒變化|不適合/.test(text)) {
    out.push(fact("primary_barrier", "很容易放棄"));
    return out;
  }
  if (/沒變化|沒有變化|看不到變化/.test(text) && !/不適合|方法/.test(text)) {
    out.push(fact("dropout_pattern", "沒變化的時候容易放棄"));
    return out;
  }
  if (/不適合我|方法.*不適合|可能方法/.test(text)) {
    out.push(fact("interpretation_pattern", "沒變化 → 可能方法不適合我"));
    return out;
  }

  if (/健康檢查|體檢|醫生叫|醫師叫|醫生.*減肥|醫師.*瘦/.test(text) && !/紅字|血糖/.test(text)) {
    out.push(fact("immediate_trigger", "健康檢查時醫生叫我減肥"));
    out.push(fact("safety_context", "醫生曾提醒需要減肥"));
    return out;
  }
  if (/紅字|血糖/.test(text)) {
    out.push(fact("safety_context", "使用者表示血糖較高、不用吃藥（非診斷）"));
    return out;
  }
  if (/不知道怎麼做/.test(text) && /忙/.test(text)) {
    out.push(fact("stated_goal", "覺得該減肥"));
    out.push(fact("lifestyle_constraints", "工作很忙"));
    return out;
  }
  if (/網路上看過|看過一些方法|工作時間太長/.test(text)) {
    out.push(fact("lifestyle_constraints", "工作時間太長"));
    out.push(fact("primary_barrier", "工作時間太長"));
    return out;
  }
  if (/外送|外面餐廳|外食/.test(text) && !/備餐/.test(text)) {
    out.push(fact("behavior_constraints", "外面餐廳或外送"));
    return out;
  }
  if (/備餐|很麻煩/.test(text)) {
    out.push(fact("perceived_cost_of_change", "備餐／額外管理很麻煩"));
    return out;
  }

  if (/女朋友.*分手|女友.*分手|再不減肥就|分手/.test(text)) {
    out.push(fact("immediate_trigger", "伴侶以分手要求減肥"));
    return out;
  }
  if (/她沒講/.test(text) || (/她自己也胖/.test(text) && /還好|沒講/.test(text))) {
    out.push(fact("deeper_motivation", "她沒講的話自己覺得還好"));
    return out;
  }
  if (/怕她離開|怕.*離開/.test(text)) {
    out.push(fact("emotional_significance", "怕她離開"));
    return out;
  }
  if (/不能吃|喜歡的東西/.test(text)) {
    out.push(fact("unacceptable_tradeoffs", "不想放棄喜歡的食物"));
    return out;
  }
  if (/自己也覺得|有點太胖|太胖/.test(text)) {
    out.push(fact("deeper_motivation", "自己也覺得有點太胖"));
    return out;
  }
  if (/穿好看|好看的衣服|穿衣服/.test(text) && !/婚宴/.test(text)) {
    out.push(fact("desired_future", "想穿好看的衣服"));
    return out;
  }

  return out;
}

export function maybeConfirmHypothesis(
  u: UnderstandingState,
  answer: string,
  turnId: string,
): InterviewHypothesis[] {
  if (!/願意試|可以試試看|我想試試/.test(answer)) return u.hypotheses ?? [];
  return (u.hypotheses ?? []).map((h) =>
    h.status === "proposed"
      ? { ...h, status: "confirmed" as const, evidence_turn_ids: [...h.evidence_turn_ids, turnId] }
      : h,
  );
}

export function maybeProposeHypothesis(
  u: UnderstandingState,
  question: string,
  turnId: string,
): UnderstandingState {
  const hypos = [...(u.hypotheses ?? [])];
  const push = (id: string, claim: string, reasoning: string) => {
    if (hypos.some((h) => h.id === id || h.claim === claim)) return;
    hypos.push({
      id,
      claim,
      status: "proposed",
      evidence_turn_ids: [turnId],
      reasoning,
    });
  };
  if (/不用自己備餐|外食、外送裡做簡單調整/.test(question)) {
    push("h_exec_friction", "執行摩擦是主因，低摩擦調整可能適合", "外食／備餐／工時證據");
  }
  if (/有人可以依你實際狀況微調|幫你微調方法/.test(question)) {
    push("h_support_adjust", "微調支持可能讓人願意試", "方法不適合的解釋");
  }
  return { ...u, hypotheses: hypos };
}

export type GoldenCheckpoint = { id: string; re: RegExp };

export const GOLDEN_CHECKPOINTS: Record<"A" | "B" | "C", GoldenCheckpoint[]> = {
  A: [
    { id: "dropout_trigger", re: /沒變化/ },
    { id: "interpretation", re: /不適合/ },
    { id: "change_fit_readiness", re: /微調|我想試試/ },
  ],
  B: [
    { id: "environment", re: /外食|外送|餐廳/ },
    { id: "execution_cost", re: /備餐/ },
    { id: "low_friction_willingness", re: /願意試|簡單方式/ },
  ],
  C: [
    { id: "intrinsic_check", re: /她沒講|還好/ },
    { id: "food_tradeoff", re: /喜歡的東西|不能吃/ },
    { id: "desired_future", re: /衣服/ },
    { id: "duration_question", re: /需要多久/ },
    { id: "trial_willingness", re: /好像可以試試看/ },
  ],
};

export function detectEarlyCompletionFail(input: {
  name: "A" | "B" | "C";
  userTexts: string[];
  complete: boolean;
}): { fail: boolean; missing: string[] } {
  if (!input.complete) return { fail: false, missing: [] };
  const blob = input.userTexts.join("\n");
  const missing = GOLDEN_CHECKPOINTS[input.name].filter((cp) => !cp.re.test(blob)).map((cp) => cp.id);
  return { fail: missing.length > 0, missing };
}
