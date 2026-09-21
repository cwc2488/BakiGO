import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId, YearMonth } from "@/types";
import type { MemberGoal } from "@/types/member-goal";

/** Retired feature stub — personal goal store no longer active in Production. */
export function loadActiveMemberGoals(
  _storage: StorageAdapter,
  _memberId: EntityId,
  _yearMonth: YearMonth,
): MemberGoal[] {
  return [];
}
