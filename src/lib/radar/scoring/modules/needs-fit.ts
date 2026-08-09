import { NEEDS_FIT_MAX, NEED_RELEVANCE_MULTIPLIER, NEED_STRENGTH_RATIO } from "../config";
import type { NeedAssessment } from "../types";

export function computeSingleNeedScore(need: NeedAssessment): number {
  const strengthRatio = NEED_STRENGTH_RATIO[need.strength];
  const relevanceMultiplier = NEED_RELEVANCE_MULTIPLIER[need.relevance];
  return NEEDS_FIT_MAX * strengthRatio * relevanceMultiplier;
}

/** Multiple needs: MAX only — never sum. */
export function computeNeedsFitScore(needs: NeedAssessment[]): {
  needs_fit_score: number;
  need_scores: Array<{ needId: string; score: number }>;
  primary_need_id: string | null;
} {
  const need_scores = needs.map((need) => ({
    needId: need.needId,
    score: computeSingleNeedScore(need),
  }));

  const validScores = need_scores.filter((n) => n.score > 0);
  if (validScores.length === 0) {
    return { needs_fit_score: 0, need_scores, primary_need_id: null };
  }

  const best = validScores.reduce((a, b) => (a.score >= b.score ? a : b));
  return {
    needs_fit_score: best.score,
    need_scores,
    primary_need_id: best.needId,
  };
}
