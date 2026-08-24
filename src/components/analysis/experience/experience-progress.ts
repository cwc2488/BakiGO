export const QUIZ_EXPLORE_SEGMENTS = 8;

/** Derive display step from public question id (dq_qN). No AI Core change. */
export function quizStepFromQuestionId(id: string | null | undefined): number {
  const match = /^dq_q(\d+)$/.exec(id ?? "");
  if (!match) return 1;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, QUIZ_EXPLORE_SEGMENTS);
}
