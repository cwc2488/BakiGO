import { isCareerRankAtOrAbove } from "@/lib/auth/career-rank-order";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import type { Member } from "@/types/member";

export function canManagePromotions(member: Member | null | undefined): boolean {
  if (!member) {
    return false;
  }
  return isCareerRankAtOrAbove(member.rankKey, RANK_KEYS.PROMOTION_GROUP);
}
