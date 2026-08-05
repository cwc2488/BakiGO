/** 連續每日積分：每天 +2%，上限 20%（穩健、不誇張） */
export const STREAK_MULTIPLIER_STEP = 0.02;
export const STREAK_MULTIPLIER_CAP = 1.2;

export function resolveStreakMultiplier(streakDays: number): number {
  if (streakDays <= 1) {
    return 1;
  }

  const raw = 1 + (streakDays - 1) * STREAK_MULTIPLIER_STEP;
  return Math.round(Math.min(STREAK_MULTIPLIER_CAP, raw) * 100) / 100;
}

export function formatPointsValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
