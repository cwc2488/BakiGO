import type { CareerBlueprintView, MemberGoal, MemberGoalProgressView } from "@/types/member-goal";
import type { RetailPipelineSnapshot } from "@/types/retail-pipeline";
import type { RetailTransaction } from "@/types/retail-transaction";

/** Retired feature stub. */
export function buildMemberGoalProgressView(
  goal: MemberGoal,
  _context: unknown,
  _transactions: RetailTransaction[],
  _pipeline: RetailPipelineSnapshot | null,
): MemberGoalProgressView {
  void _context;
  void _transactions;
  void _pipeline;
  throw new Error(`Member goals feature has been retired (${goal.id}).`);
}

/** Retired feature stub. */
export function buildCareerBlueprintView(
  _context: unknown,
  _pipeline: RetailPipelineSnapshot | null,
): CareerBlueprintView | null {
  void _context;
  void _pipeline;
  return null;
}
