import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine/rules";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { PROMOTION_RANK_IDS } from "@/lib/business-engine/rules/promotion";

/** Career ranks in ascending order — includes promotion ladder ranks. */
export const CAREER_RANK_ORDER = [
  RANK_KEYS.NEW_MEMBER,
  "member",
  RANK_KEYS.SUPERVISOR,
  RANK_KEYS.ACTIVE_SUPERVISOR,
  RANK_KEYS.WORLD_TEAM,
  RANK_KEYS.PROMOTION_GROUP,
  RANK_KEYS.WEALTH_GROUP,
  RANK_KEYS.PRESIDENT,
] as const;

const CAREER_RANK_INDEX = new Map(
  CAREER_RANK_ORDER.map((rankKey, index) => [rankKey, index]),
);

/** MAP milestone on 總裁之路 — ranks at or above 督導 have completed MAP. */
export function hasCompletedMapPlan(rankKey: string): boolean {
  return getCareerRankIndex(rankKey) >= getCareerRankIndex(RANK_KEYS.SUPERVISOR);
}

/** Registration rank implies all milestones up to and including this rank are done. */
export function getCareerRankIndex(rankKey: string): number {
  return CAREER_RANK_INDEX.get(rankKey as (typeof CAREER_RANK_ORDER)[number]) ?? 0;
}

export function isCareerRankAtOrAbove(rankKey: string, thresholdRankKey: string): boolean {
  return getCareerRankIndex(rankKey) >= getCareerRankIndex(thresholdRankKey);
}

export function resolveCareerRankLabel(rankKey: string): string {
  return (
    DEFAULT_BUSINESS_RULES.ranks.labels[rankKey] ??
    DEFAULT_BUSINESS_RULES.promotion.ranks[rankKey as keyof typeof DEFAULT_BUSINESS_RULES.promotion.ranks]
      ?.name ??
    rankKey
  );
}

/** Promotion rankId for a persisted member rankKey — used for downline comparisons. */
export function resolveMemberPromotionRankId(rankKey: string): string | null {
  const map: Record<string, string> = {
    [RANK_KEYS.NEW_MEMBER]: PROMOTION_RANK_IDS.MEMBER,
    member: PROMOTION_RANK_IDS.MEMBER,
    [RANK_KEYS.SUPERVISOR]: PROMOTION_RANK_IDS.SUPERVISOR,
    [RANK_KEYS.ACTIVE_SUPERVISOR]: PROMOTION_RANK_IDS.ACTIVE_SUPERVISOR,
    [RANK_KEYS.WORLD_TEAM]: PROMOTION_RANK_IDS.WORLD_TEAM,
    [RANK_KEYS.PROMOTION_GROUP]: PROMOTION_RANK_IDS.PROMOTION_GROUP,
    [RANK_KEYS.WEALTH_GROUP]: PROMOTION_RANK_IDS.WEALTH_GROUP,
    [RANK_KEYS.PRESIDENT]: PROMOTION_RANK_IDS.PRESIDENT,
  };
  return map[rankKey] ?? null;
}
