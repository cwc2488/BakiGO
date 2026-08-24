import { isLowInformationAnswer, sharesContent } from "@/lib/analysis/interview/interview-coherence";
import { isFact, type UnderstandingState } from "@/lib/analysis/interview/understanding-state";

/**
 * P2.7.2 transient reasoning representation.
 * Not persisted. Not a second UnderstandingState. Not a questionnaire.
 */
export type InformationValue = "low" | "medium" | "high";

export type CausalRelation =
  | "causes"
  | "blocks"
  | "increases_urgency"
  | "corrects"
  | "tensions";

export type CausalLink = {
  from: string;
  to: string;
  relation: CausalRelation;
};

export type CurrentHumanModel = {
  what_the_user_wants: string | null;
  why_now: string | null;
  what_seems_to_matter: string | null;
  what_may_be_blocking_them: string | null;
  causal_links: CausalLink[];
  tensions_or_tradeoffs: string[];
  unresolved_hypotheses: string[];
  what_changed_this_turn: string;
  information_value: InformationValue;
};

export const SYNTHESIS_VERIFY_QUESTION = "我這樣理解有接近嗎？" as const;

const LOW_INFO_UTTERANCE_RE =
  /^(嗯+|哦+|喔+|啊+|對啊|對呀|差不多|還好|不知道|沒有|普通|隨便|還可以)[。．.！!？?\s]*$/;

const CORRECTION_RE = /其實不是|不是.{0,16}是|搞錯了|我講錯|你搞錯|講錯了/;
const REVERSAL_UNDO_RE =
  /(怕|擔心).{0,24}(又|再).{0,16}(回去|回來|原點|一樣)|又.{0,8}(胖回去|回去|回來)|以前.{0,24}後來.{0,20}(回來|回去)|做得到.{0,16}維持不住/;
const THIRD_PARTY_LIFE_RE =
  /(朋友|同事|同學|身邊的人|別人都).{0,20}(結婚|生孩|懷孕|買房|升職|出國|成功)/;
const CHALLENGE_RE = /一直問這些幹嘛|問這些幹嘛|為什麼一直問|你問這些幹嘛/;
const SELF_EVAL_AFFECT_RE = /沒自信|自卑|丟臉|看不起自己|不好意思看/;
const INTERPERSONAL_RE = /女朋友|男友|伴侶|單身|認識|結婚/;
const SYNTHESIS_MARK_RE =
  /不只是|所以.{0,24}而是|連起來|連著的|之後.{0,12}讓|可能不是.{0,24}而是|對照|人生階段|回到原點|真正卡住/;
const PARAPHRASE_VERIFY_RE = /這樣理解(有偏嗎|對嗎|接近嗎|有接近嗎)|我這樣理解/;

function clip(text: string, max = 18): string {
  const t = text.trim().replace(/\s+/g, "");
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function factSnippets(u: UnderstandingState): string[] {
  const keys = [
    u.stated_goal,
    u.immediate_trigger,
    u.deeper_motivation,
    u.desired_future,
    u.emotional_significance,
    u.primary_barrier,
    u.dropout_pattern,
    u.lifestyle_constraints,
    u.behavior_constraints,
    u.perceived_cost_of_change,
    u.unacceptable_tradeoffs,
  ] as const;
  return keys.filter(isFact).map((f) => f.value.trim()).filter(Boolean);
}

function factCorpus(u: UnderstandingState): string {
  return factSnippets(u).join(" ");
}

export function hasCorrectionShape(text: string): boolean {
  return CORRECTION_RE.test(text.trim());
}

export function hasReversalOrUndoShape(text: string): boolean {
  return REVERSAL_UNDO_RE.test(text.trim());
}

export function hasThirdPartyLifeStageShape(text: string): boolean {
  return THIRD_PARTY_LIFE_RE.test(text.trim());
}

export function hasInterviewerChallengeShape(text: string): boolean {
  return CHALLENGE_RE.test(text.trim());
}

export function hasSelfEvaluationAffect(text: string): boolean {
  return SELF_EVAL_AFFECT_RE.test(text.trim());
}

function pickSelfState(u: UnderstandingState, answer = ""): string | null {
  const skip = (value: string) =>
    hasThirdPartyLifeStageShape(value) || (answer && sharesContent(value, answer) && hasThirdPartyLifeStageShape(answer));
  if (isFact(u.deeper_motivation) && u.deeper_motivation.value && !skip(u.deeper_motivation.value)) {
    return u.deeper_motivation.value;
  }
  if (isFact(u.emotional_significance) && u.emotional_significance.value && !skip(u.emotional_significance.value)) {
    return u.emotional_significance.value;
  }
  if (isFact(u.immediate_trigger) && u.immediate_trigger.value && !skip(u.immediate_trigger.value)) {
    return u.immediate_trigger.value;
  }
  return null;
}

export function classifyInformationValue(
  answer: string,
  _before?: UnderstandingState,
): InformationValue {
  void _before;
  const t = answer.trim();
  if (!t || isLowInformationAnswer(t) || LOW_INFO_UTTERANCE_RE.test(t)) return "low";
  if (hasInterviewerChallengeShape(t)) return "high";
  if (hasCorrectionShape(t) || hasReversalOrUndoShape(t) || hasThirdPartyLifeStageShape(t)) {
    return "high";
  }
  if (hasSelfEvaluationAffect(t) && t.length >= 6) return "high";
  return "medium";
}

function buildCausalLinks(input: {
  before: UnderstandingState;
  after: UnderstandingState;
  answer: string;
  value: InformationValue;
}): CausalLink[] {
  const links: CausalLink[] = [];
  const prior = factSnippets(input.before);
  const clipAns = clip(input.answer, 22);
  if (hasCorrectionShape(input.answer)) {
    const prev =
      (isFact(input.before.primary_barrier) && input.before.primary_barrier.value) ||
      (isFact(input.before.lifestyle_constraints) && input.before.lifestyle_constraints.value) ||
      prior[0];
    if (prev) links.push({ from: prev, to: clipAns, relation: "corrects" });
  }
  if (hasReversalOrUndoShape(input.answer)) {
    links.push({ from: "能開始或能瘦", to: "維持不住／回到原點", relation: "blocks" });
  }
  if (hasThirdPartyLifeStageShape(input.answer)) {
    const self = pickSelfState(input.after, input.answer) || pickSelfState(input.before, input.answer);
    links.push({
      from: clipAns,
      to: self ? clip(self, 18) : "現在的人生階段對照",
      relation: "increases_urgency",
    });
  }
  if (hasSelfEvaluationAffect(input.answer)) {
    const social = prior.find((f) => INTERPERSONAL_RE.test(f));
    if (social) links.push({ from: social, to: clipAns, relation: "causes" });
  }
  if (isFact(input.after.unacceptable_tradeoffs) && input.after.unacceptable_tradeoffs.value) {
    const want = isFact(input.after.stated_goal)
      ? input.after.stated_goal.value
      : isFact(input.after.desired_future)
        ? input.after.desired_future.value
        : "";
    if (want) {
      links.push({
        from: clip(want, 14),
        to: clip(input.after.unacceptable_tradeoffs.value, 14),
        relation: "tensions",
      });
    }
  }
  if (input.value === "high" && prior.length >= 1 && links.length === 0) {
    links.push({ from: prior[prior.length - 1], to: clipAns, relation: "causes" });
  }
  return links.slice(0, 4);
}

export function buildCurrentHumanModel(input: {
  answer: string;
  before: UnderstandingState;
  after: UnderstandingState;
}): CurrentHumanModel {
  const value = classifyInformationValue(input.answer, input.before);
  const after = input.after;
  const wants =
    (isFact(after.stated_goal) && after.stated_goal.value) ||
    (isFact(after.desired_future) && after.desired_future.value) ||
    null;
  const whyNow =
    (isFact(after.immediate_trigger) && after.immediate_trigger.value) ||
    (hasThirdPartyLifeStageShape(input.answer) ? clip(input.answer, 24) : null);
  const matters =
    (isFact(after.deeper_motivation) && after.deeper_motivation.value) ||
    (isFact(after.emotional_significance) && after.emotional_significance.value) ||
    null;
  const blocking =
    (hasReversalOrUndoShape(input.answer) ? "維持不住／回到原點" : null) ||
    (isFact(after.primary_barrier) && after.primary_barrier.value) ||
    (isFact(after.dropout_pattern) && after.dropout_pattern.value) ||
    (isFact(after.perceived_cost_of_change) && after.perceived_cost_of_change.value) ||
    null;
  const tensions: string[] = [];
  if (isFact(after.unacceptable_tradeoffs) && after.unacceptable_tradeoffs.value) {
    tensions.push(after.unacceptable_tradeoffs.value);
  }
  const unresolved = (after.hypotheses ?? [])
    .filter((h) => h.status === "proposed")
    .slice(0, 3)
    .map((h) => h.claim);
  const changed =
    value === "low"
      ? "little new"
      : clip(input.answer, 40) || "new statement";
  return {
    what_the_user_wants: wants,
    why_now: whyNow,
    what_seems_to_matter: matters,
    what_may_be_blocking_them: blocking,
    causal_links: buildCausalLinks({
      before: input.before,
      after,
      answer: input.answer,
      value,
    }),
    tensions_or_tradeoffs: tensions,
    unresolved_hypotheses: unresolved,
    what_changed_this_turn: changed,
    information_value: value,
  };
}

export function looksLikeCausalSynthesis(
  response: string,
  answer: string,
  understanding: UnderstandingState,
): boolean {
  const r = response.trim();
  if (r.length < 12) return false;
  if (SYNTHESIS_MARK_RE.test(r)) return true;
  const facts = factSnippets(understanding);
  const usedFacts = facts.filter((f) => {
    const needle = clip(f, 6).replace(/…$/, "");
    return needle.length >= 2 && r.includes(needle);
  }).length;
  return usedFacts >= 2 && r.length > Math.max(24, answer.trim().length + 6);
}

export function isParaphraseVerification(
  response: string,
  question: string,
  answer: string,
): boolean {
  const blob = `${response} ${question}`;
  if (!PARAPHRASE_VERIFY_RE.test(blob)) return false;
  if (SYNTHESIS_MARK_RE.test(response)) return false;
  return sharesContent(answer, response);
}

export function questionUsesNewInformation(answer: string, spoken: string): boolean {
  if (!answer.trim() || !spoken.trim()) return false;
  if (hasReversalOrUndoShape(answer)) {
    return /原點|維持|回去|回來|撐不久/.test(spoken);
  }
  if (hasCorrectionShape(answer)) {
    if (/哪些因素|口味|方便性|哪一家/.test(spoken)) return false;
    return /而是|卡住|方法|不知道選|決定不了|選擇太多/.test(spoken);
  }
  if (hasThirdPartyLifeStageShape(answer)) {
    return /階段|對照|身邊|人生/.test(spoken);
  }
  if (hasSelfEvaluationAffect(answer)) {
    return /自信|別人|自己|場合/.test(spoken) || sharesContent(answer, spoken);
  }
  return sharesContent(answer, spoken);
}

export function synthesizeReflection(
  model: CurrentHumanModel,
  answer: string,
  understanding: UnderstandingState,
): string | null {
  if (hasReversalOrUndoShape(answer)) {
    return "所以你現在比較在意的，可能不是「能不能開始」，而是「就算做得到一陣子，最後會不會又回到原點」。";
  }
  if (hasCorrectionShape(answer)) {
    const link = model.causal_links.find((l) => l.relation === "corrects");
    if (link) {
      return `所以真正卡住的，可能不是「${clip(link.from, 12)}」，而是你剛說的「${clip(link.to, 18)}」。`;
    }
    return "所以真正卡住的，可能不是你前面說的那件事，而是你剛補上的這一點。";
  }
  if (hasThirdPartyLifeStageShape(answer)) {
    const self = pickSelfState(understanding, answer);
    if (self) {
      return `聽起來最近不只是「${clip(self, 16)}」這件事，身邊的人陸續進入下一個階段，也讓「現在的狀態要不要改」變得更明顯。`;
    }
    return "身邊的人陸續進入下一個階段，比較像把你自己現在的狀態對照出來，而不是把別人的事當成你自己的目標。";
  }
  if (model.causal_links.length >= 1 && factSnippets(understanding).length >= 2) {
    const a = clip(model.causal_links[0].from, 14);
    const b = clip(model.causal_links[0].to, 14);
    return `聽起來這兩件事是連著的：「${a}」之後，出現了「${b}」。`;
  }
  return null;
}

export function reversalFollowupQuestion(understanding: UnderstandingState, answer = ""): string {
  const known = `${factCorpus(understanding)} ${answer}`;
  if (/減過|胖回來|維持不住|又回去/.test(known)) {
    return "你自己回頭看，比較像方法太辛苦，還是瘦下來之後慢慢又回到原本的生活？";
  }
  return "這個擔心，比較像是你自己以前真的遇過「做得到一陣子又回到原點」，還是比較像你看過很多人最後都維持不住？";
}

export function genericAffectLocatingQuestion(
  answer: string,
  understanding: UnderstandingState,
): string | null {
  if (!hasSelfEvaluationAffect(answer)) return null;
  if (!INTERPERSONAL_RE.test(factCorpus(understanding))) return null;
  return "這種感覺比較常出現在跟別人有關的時候，還是你自己一個人的時候？";
}

export function compactHumanModelForPrompt(model: CurrentHumanModel): Record<string, unknown> {
  return {
    wants: model.what_the_user_wants,
    why_now: model.why_now,
    matters: model.what_seems_to_matter,
    blocking: model.what_may_be_blocking_them,
    changed: model.what_changed_this_turn,
    value: model.information_value,
    links: model.causal_links.map((l) => `${clip(l.from, 12)}→${clip(l.to, 12)}`),
    tensions: model.tensions_or_tradeoffs.slice(0, 2),
    third_party: model.causal_links.some((l) => l.relation === "increases_urgency"),
  };
}
