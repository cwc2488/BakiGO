/** Round for Candidate-facing display only — never use for ranking. */
export function roundScoreForDisplay(score: number): number {
  return Math.round(score * 10) / 10;
}

export function formatOverallScoreDisplay(score: number): string {
  return `${roundScoreForDisplay(score)} / 100`;
}

export function formatCoreTraitsScoreDisplay(score: number): string {
  return `${roundScoreForDisplay(score)} / 5`;
}
