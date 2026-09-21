/** Pure helpers for live 5＋5 UI totals (preview before save). */

export function computeLiveFishTotal(input: {
  manualFish: number;
  questionnaireFish: number;
}): number {
  return Math.max(0, input.manualFish) + Math.max(0, input.questionnaireFish);
}

export function computeLiveWeekInvitation(input: {
  weekInvitationTotal: number;
  savedTodayManualInvitation: number;
  liveManualInvitation: number;
}): number {
  return (
    input.weekInvitationTotal -
    input.savedTodayManualInvitation +
    input.liveManualInvitation
  );
}
