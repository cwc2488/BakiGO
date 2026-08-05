export interface PromotionNextStepLike {
  stepKey: string;
  target: number;
  current: number;
}

/** True when calculateNextSteps already emitted a downline promotion next step. */
export function isPromotionCoveredByNextSteps(
  nextSteps: PromotionNextStepLike[],
  progress: {
    isMaxRank: boolean;
    isRuleMissing: boolean;
    progressSource: string;
    target: number | null;
    current: number;
    ruleKey: string | null;
    currentRankId?: string | null;
  },
): boolean {
  if (
    progress.isMaxRank ||
    progress.isRuleMissing ||
    progress.progressSource !== "downline" ||
    progress.target === null
  ) {
    return false;
  }

  const expectedStepKey = `promotion_${progress.ruleKey ?? progress.currentRankId ?? "downline"}`;

  return nextSteps.some(
    (step) =>
      step.stepKey === expectedStepKey ||
      (step.stepKey.startsWith("promotion_") &&
        step.target === progress.target &&
        step.current === progress.current),
  );
}
