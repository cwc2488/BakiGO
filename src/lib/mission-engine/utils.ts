import type { MissionStatus } from "@/types/mission";

export function applyTemplate(
  template: string,
  variables: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    return value === undefined ? "" : String(value);
  });
}

export function computeRemaining(target: number, current: number): number {
  return Math.max(0, target - current);
}

export function computeProgress(current: number, target: number): number {
  if (target <= 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)));
}

export function resolveMissionStatus(
  current: number,
  target: number,
  deadline: string | null,
  referenceDate: string,
): MissionStatus {
  if (current >= target) {
    return "completed";
  }
  if (deadline && deadline < referenceDate) {
    return "expired";
  }
  if (current > 0) {
    return "in_progress";
  }
  return "pending";
}

export function endOfDayDeadline(referenceDate: string): string {
  return referenceDate.slice(0, 10);
}

export function endOfMonthDeadline(referenceDate: string): string {
  const yearMonth = referenceDate.slice(0, 7);
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
}

export function resolveDifficultyKey(
  remaining: number,
  target: number,
  difficulties: Array<{ key: string; remainingRatioMin: number }>,
): string {
  const ratio = target > 0 ? remaining / target : 1;
  const sorted = [...difficulties].sort(
    (left, right) => right.remainingRatioMin - left.remainingRatioMin,
  );

  return sorted.find((item) => ratio >= item.remainingRatioMin)?.key ?? sorted[sorted.length - 1].key;
}

export function resolveNextStepMapping(
  stepKey: string,
  mappings: Array<{
    stepKeyPattern: string;
    categoryKey: string;
    icon: string;
    color: string;
    subtitleTemplate: string;
  }>,
  fallback: {
    categoryKey: string;
    icon: string;
    color: string;
    subtitleTemplate: string;
  },
) {
  return (
    mappings.find((mapping) => stepKey.includes(mapping.stepKeyPattern)) ?? fallback
  );
}

export function scoreMissionPriority(
  basePriority: number,
  difficultyKey: string,
  difficulties: Array<{ key: string; priorityWeight: number }>,
): number {
  const weight =
    difficulties.find((item) => item.key === difficultyKey)?.priorityWeight ?? 1;
  return basePriority * 10 + weight;
}
