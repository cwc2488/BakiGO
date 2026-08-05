import { toYearMonthFromDate } from "@/lib/config/app-config";
import type { EntityId } from "@/types";
import type { PointRedemption } from "@/types/points";
import type { StorageAdapter } from "./storage-adapter";
import { STORAGE_KEYS } from "./storage-keys";

function parseRedemptions(raw: string | null): PointRedemption[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as PointRedemption[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadPointRedemptions(storage: StorageAdapter): PointRedemption[] {
  return parseRedemptions(storage.getItem(STORAGE_KEYS.pointRedemptions));
}

export function savePointRedemptions(
  storage: StorageAdapter,
  redemptions: PointRedemption[],
): void {
  storage.setItem(STORAGE_KEYS.pointRedemptions, JSON.stringify(redemptions));
}

export function sumRedeemedPointsForMember(
  memberId: EntityId,
  redemptions: PointRedemption[],
): number {
  return redemptions
    .filter((item) => item.memberId === memberId)
    .reduce((sum, item) => sum + item.points, 0);
}

export interface CreatePointRedemptionInput {
  memberId: EntityId;
  redeemedByMemberId: EntityId;
  points: number;
  prizeDescription: string;
  note?: string;
  redeemedAt?: string;
}

export function createPointRedemption(
  input: CreatePointRedemptionInput,
  storage: StorageAdapter,
): PointRedemption {
  if (!Number.isFinite(input.points) || input.points <= 0) {
    throw new Error("請輸入有效的兌換積分");
  }

  const prizeDescription = input.prizeDescription.trim();
  if (!prizeDescription) {
    throw new Error("請輸入獎品內容");
  }

  const redeemedAt = input.redeemedAt ?? new Date().toISOString();
  const redemption: PointRedemption = {
    id: `redemption-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    memberId: input.memberId,
    redeemedByMemberId: input.redeemedByMemberId,
    points: input.points,
    prizeDescription,
    note: input.note?.trim() || undefined,
    redeemedAt,
    yearMonth: toYearMonthFromDate(redeemedAt.slice(0, 10)),
  };

  const next = [...loadPointRedemptions(storage), redemption];
  savePointRedemptions(storage, next);
  return redemption;
}

export function loadRedemptionsForMember(
  memberId: EntityId,
  storage: StorageAdapter,
): PointRedemption[] {
  return loadPointRedemptions(storage).filter((item) => item.memberId === memberId);
}
