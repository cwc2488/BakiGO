import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import type { EntityId, YearMonth } from "@/types";
import type { MemberGoal } from "@/types/member-goal";

/** Retired feature stub — personal goal store no longer active in Production. */
export function loadActiveMemberGoals(
  storage: StorageAdapter,
  memberId: EntityId,
  yearMonth: YearMonth,
): MemberGoal[] {
  void storage;
  void memberId;
  void yearMonth;
  return [];
}
