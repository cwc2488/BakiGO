import { roundScoreForDisplay } from "./format-display";
import type { OverallScoreResult, RankedCandidate } from "./types";

export function rankCandidates(
  entries: Array<{ candidateId: string; result: OverallScoreResult }>,
): RankedCandidate[] {
  const sorted = [...entries].sort((a, b) => {
    const diff = b.result.overall_score - a.result.overall_score;
    if (diff !== 0) return diff;
    return a.candidateId.localeCompare(b.candidateId);
  });

  return sorted.map((entry, index) => ({
    candidateId: entry.candidateId,
    overall_score: entry.result.overall_score,
    display_overall_score: roundScoreForDisplay(entry.result.overall_score),
    rank: index + 1,
    result: entry.result,
  }));
}
