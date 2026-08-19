import { PERSONALITY_PROFILES } from "@/lib/quiz/fat-loss/personality-content";
import { PERSONALITY_TYPES, type PersonalityType } from "@/lib/quiz/fat-loss/types";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

/**
 * Fun/shareable interpretation from Dynamic Quiz, reusing the existing A–F
 * animal taxonomy. Not a clinical type, not 12-question scoring, not a fact.
 */
export type QuizAnimalPayoff = {
  type: PersonalityType;
  animalName: string;
  tagline: string;
  headline: string;
  coreInsight: string;
  source: "dynamic_quiz_interpretation";
  unverified: true;
};

export function interpretQuizAnimalPayoff(input: {
  prior: QuizPrior | null;
  history: Array<{ question: string; selected: string[] }>;
}): QuizAnimalPayoff {
  const blob = [
    input.prior?.likely_primary_motivation?.claim ?? "",
    ...(input.prior?.likely_barriers ?? []).map((b) => b.claim),
    ...(input.prior?.possible_tradeoffs ?? []).map((t) => t.claim),
    ...(input.prior?.possible_behavior_pattern ?? []).map((p) => p.claim),
    ...(input.history ?? []).flatMap((h) => [h.question, ...h.selected]),
  ]
    .join(" ")
    .replace(/\s+/g, "");

  const scores: Record<PersonalityType, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  for (const type of PERSONALITY_TYPES) {
    const profile = PERSONALITY_PROFILES[type];
    const needles = [profile.tagline, profile.coreInsight, ...profile.scenarios, ...profile.suggestions];
    for (const needle of needles) {
      const core = needle.replace(/\s+/g, "").slice(0, 8);
      if (core.length >= 2 && blob.includes(core.slice(0, 4))) scores[type] += 1;
    }
  }

  // Pattern overlap with taxonomy meaning, still not a 12-q scorer.
  if (/累|壓力|情緒|犒賞|安慰|紓壓/.test(blob)) scores.A += 2;
  if (/明天|還沒開始|拖延|等.*時機|遲遲/.test(blob)) scores.B += 2;
  if (/太認真|爆發|撐不久|三分鐘|前幾天/.test(blob)) scores.C += 2;
  if (/試過很多|換過|知道怎麼|方法很多|資訊/.test(blob)) scores.D += 2;
  if (/加班|作息|外食|睡眠|下班/.test(blob)) scores.E += 2;
  if (/以前瘦|成功過|有基礎|停滯|再優化/.test(blob)) scores.F += 2;

  let best: PersonalityType = "A";
  let bestScore = -1;
  for (const type of PERSONALITY_TYPES) {
    if (scores[type] > bestScore) {
      best = type;
      bestScore = scores[type];
    }
  }
  const profile = PERSONALITY_PROFILES[best];
  return {
    type: profile.type,
    animalName: profile.animalName,
    tagline: profile.tagline,
    headline: profile.headline,
    coreInsight: profile.coreInsight,
    source: "dynamic_quiz_interpretation",
    unverified: true,
  };
}
