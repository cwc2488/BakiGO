import type { MemberGoalActionStep } from "@/types/member-goal";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";

/** 我的名單 retired. */
export function buildPipelinePushSteps(
  _pipeline: RetailPipelineSnapshot | null,
): MemberGoalActionStep[] {
  return [];
}
