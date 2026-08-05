import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { DEFAULT_PROMOTION_TREE } from "@/lib/business-engine/rules/promotion";

const REGISTRATION_RANK_KEYS = [
  ...DEFAULT_BUSINESS_RULES.ranks.order,
  RANK_KEYS.PROMOTION_GROUP,
  RANK_KEYS.WEALTH_GROUP,
] as const;

function getRegistrationRankLabel(rankKey: string): string {
  const careerLabel = DEFAULT_BUSINESS_RULES.ranks.labels[rankKey];
  if (careerLabel) {
    return careerLabel;
  }

  const promotionRank = DEFAULT_PROMOTION_TREE.ranks[rankKey as keyof typeof DEFAULT_PROMOTION_TREE.ranks];
  return promotionRank?.name ?? rankKey;
}

export function getRegistrationRankOptions(): Array<{ key: string; label: string }> {
  return REGISTRATION_RANK_KEYS.map((rankKey) => ({
    key: rankKey,
    label: getRegistrationRankLabel(rankKey),
  }));
}

export function isValidRegistrationRankKey(rankKey: string): boolean {
  return REGISTRATION_RANK_KEYS.includes(rankKey as (typeof REGISTRATION_RANK_KEYS)[number]);
}

export function resolveRegistrationRoleKey(rankKey: string): string {
  return rankKey === RANK_KEYS.PRESIDENT ? "president" : "member";
}
