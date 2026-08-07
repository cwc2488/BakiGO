import type { StorageAdapter } from "@/lib/repositories/storage-adapter";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { EntityId, YearMonth } from "@/types";
import type { MemberGoal, MemberGoalCreateInput } from "@/types/member-goal";

function parseGoals(raw: string | null): MemberGoal[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as MemberGoal[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `goal-${Date.now()}`;
}

function persistGoals(storage: StorageAdapter, goals: MemberGoal[]): void {
  storage.setItem(STORAGE_KEYS.memberGoals, JSON.stringify(goals));
}

export function loadMemberGoals(storage: StorageAdapter): MemberGoal[] {
  return parseGoals(storage.getItem(STORAGE_KEYS.memberGoals));
}

export function loadActiveMemberGoals(
  storage: StorageAdapter,
  ownerMemberId: EntityId,
  yearMonth?: YearMonth,
): MemberGoal[] {
  return loadMemberGoals(storage).filter(
    (goal) =>
      goal.ownerMemberId === ownerMemberId &&
      goal.isActive &&
      (yearMonth === undefined || goal.yearMonth === yearMonth),
  );
}

export function addMemberGoal(
  storage: StorageAdapter,
  input: MemberGoalCreateInput,
): MemberGoal {
  const goal: MemberGoal = {
    id: createId(),
    ownerMemberId: input.ownerMemberId,
    type: input.type,
    targetValue: input.targetValue,
    horizon: input.horizon,
    yearMonth: input.yearMonth,
    label: input.label?.trim() || undefined,
    createdAt: new Date().toISOString(),
    isActive: true,
  };
  persistGoals(storage, [...loadMemberGoals(storage), goal]);
  return goal;
}

export function deactivateMemberGoal(storage: StorageAdapter, goalId: string): boolean {
  const goals = loadMemberGoals(storage);
  const index = goals.findIndex((goal) => goal.id === goalId);
  if (index < 0) {
    return false;
  }
  const next = [...goals];
  next[index] = { ...next[index], isActive: false };
  persistGoals(storage, next);
  return true;
}
