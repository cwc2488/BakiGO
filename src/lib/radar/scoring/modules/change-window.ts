import {
  BEHAVIORAL_CHANGE_POINTS,
  CHANGE_INTENT_POINTS,
  CHANGE_WINDOW_SUBCAPS,
  SOLUTION_GAP_POINTS,
} from "../config";
import type { ChangeWindowAssessment } from "../types";

export function computeChangeWindowScore(assessment: ChangeWindowAssessment): {
  change_window_score: number;
  change_intent_score: number;
  behavioral_change_score: number;
  solution_gap_score: number;
} {
  const change_intent_score = CHANGE_INTENT_POINTS[assessment.changeIntent];
  const behavioral_change_score =
    BEHAVIORAL_CHANGE_POINTS[assessment.behavioralChange];
  const solution_gap_score = SOLUTION_GAP_POINTS[assessment.solutionGap];

  return {
    change_intent_score,
    behavioral_change_score,
    solution_gap_score,
    change_window_score:
      change_intent_score + behavioral_change_score + solution_gap_score,
  };
}

export function assertChangeWindowCaps(scores: {
  change_intent_score: number;
  behavioral_change_score: number;
  solution_gap_score: number;
}): void {
  if (scores.change_intent_score > CHANGE_WINDOW_SUBCAPS.changeIntent) {
    throw new Error("change_intent_score exceeds cap");
  }
  if (scores.behavioral_change_score > CHANGE_WINDOW_SUBCAPS.behavioralChange) {
    throw new Error("behavioral_change_score exceeds cap");
  }
  if (scores.solution_gap_score > CHANGE_WINDOW_SUBCAPS.solutionGap) {
    throw new Error("solution_gap_score exceeds cap");
  }
}
