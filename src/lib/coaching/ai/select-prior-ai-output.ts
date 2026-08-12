import type { CoachingAiOutputRecord } from "@/types/coaching-ai";

export type PriorAiOutputCandidate = Pick<CoachingAiOutputRecord, "id" | "logDate" | "status"> & {
  /** Allow legacy incomplete customer/coach JSON when selecting prior memory. */
  outputJson: CoachingAiOutputRecord["outputJson"] | Record<string, unknown> | null;
};

/** Most recent completed output strictly before the target log date. */
export function selectPriorCompletedAiOutput(
  outputs: PriorAiOutputCandidate[],
  beforeLogDate: string,
): PriorAiOutputCandidate | null {
  const eligible = outputs
    .filter((output) => output.status === "completed" && output.logDate < beforeLogDate)
    .sort((left, right) => right.logDate.localeCompare(left.logDate));

  return eligible[0] ?? null;
}
