import type { AppMember } from "@/lib/config/app-config";
import { collectDownlineIds } from "@/lib/business-engine/utils";
import { resolvePromotionRankId } from "@/lib/business-engine/rules/promotion";

export function countDownlineByRank(
  members: AppMember[],
  rootMemberId: string,
): Record<string, number> {
  const downlineIds = collectDownlineIds(members, rootMemberId);
  const counts: Record<string, number> = {};

  members.forEach((member) => {
    if (!downlineIds.has(member.id)) {
      return;
    }
    counts[member.rankKey] = (counts[member.rankKey] ?? 0) + 1;
  });

  return counts;
}

/** Downline counts keyed by promotion rankId — for Promotion / Achievement engines. */
export function countDownlineByPromotionRank(
  members: AppMember[],
  rootMemberId: string,
): Record<string, number> {
  const downlineIds = collectDownlineIds(members, rootMemberId);
  const counts: Record<string, number> = {};

  members.forEach((member) => {
    if (!downlineIds.has(member.id)) {
      return;
    }
    const promotionRankId = resolvePromotionRankId(member.rankKey);
    if (!promotionRankId) {
      return;
    }
    counts[promotionRankId] = (counts[promotionRankId] ?? 0) + 1;
  });

  return counts;
}

