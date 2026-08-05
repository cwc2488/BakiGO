import { todayISODate } from "@/lib/config/app-config";
import { recalculateMemberMetrics } from "@/lib/services/recalculate-member-metrics";
import { createPointRedemption } from "@/lib/repositories/point-redemption-repository";
import { getDirectDownline } from "@/lib/business-engine/utils";
import { loadAllMembers } from "@/lib/members/member-service";
import type { EntityId } from "@/types";
import type { PointRedemption } from "@/types/points";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

export interface RedeemDownlinePointsInput {
  downlineMemberId: EntityId;
  redeemedByMemberId: EntityId;
  points: number;
  prizeDescription: string;
  note?: string;
}

export function redeemDownlinePoints(
  input: RedeemDownlinePointsInput,
  storage: StorageAdapter,
): PointRedemption {
  const members = loadAllMembers(storage);
  const downline = members.find((member) => member.id === input.downlineMemberId);
  if (!downline) {
    throw new Error("找不到下線夥伴");
  }

  const directDownline = getDirectDownline(members, input.redeemedByMemberId);
  const isDirectDownline = directDownline.some((member) => member.id === input.downlineMemberId);
  if (!isDirectDownline && input.downlineMemberId !== input.redeemedByMemberId) {
    throw new Error("只能兌換第一代下線的積分");
  }

  const metrics = recalculateMemberMetrics(
    { memberId: input.downlineMemberId, referenceDate: todayISODate() },
    storage,
  );
  const available = metrics.gamification.points.availablePoints;
  if (input.points > available) {
    throw new Error(`可兌換積分不足（目前 ${available} 分）`);
  }

  const redemption = createPointRedemption(
    {
      memberId: input.downlineMemberId,
      redeemedByMemberId: input.redeemedByMemberId,
      points: input.points,
      prizeDescription: input.prizeDescription,
      note: input.note,
    },
    storage,
  );

  recalculateMemberMetrics(
    { memberId: input.downlineMemberId, referenceDate: todayISODate() },
    storage,
  );
  return redemption;
}
