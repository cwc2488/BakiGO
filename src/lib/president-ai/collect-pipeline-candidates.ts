import type { MemberGoalActionStep } from "@/types/member-goal";
import type { PriorityCandidate } from "./types";

export function collectPipelinePushCandidates(
  pushSteps: MemberGoalActionStep[],
): PriorityCandidate[] {
  return pushSteps.map((step, index) => ({
    sourceKey: `pipeline_push_${index}`,
    title: step.label,
    description: step.detail,
    category: "RETAIL",
    current: 0,
    target: 1,
    remaining: 1,
    progressPercent: 0,
    enginePriority: 2700 - index,
    actionHref: step.href,
  }));
}
