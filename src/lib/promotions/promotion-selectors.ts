import { collectDownlineIds } from "@/lib/business-engine/utils";
import { toYearMonth } from "@/lib/business-engine/utils";
import type { Member } from "@/types/member";
import type { EntityId, ISODateString, YearMonth } from "@/types";
import type { PromotionCampaign, PromotionTier } from "@/types/promotion-campaign";

export interface PromotionCampaignView {
  campaign: PromotionCampaign;
  publisherName: string;
  tiers: PromotionTier[];
}

export interface MemberMonthlyPromotionsView {
  referenceDate: ISODateString;
  yearMonth: YearMonth;
  yearMonthLabel: string;
  campaigns: PromotionCampaignView[];
}

function lastDayOfMonth(yearMonth: YearMonth): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const day = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

/** 促銷期間與指定月份有重疊。 */
export function isPromotionActiveInMonth(
  campaign: PromotionCampaign,
  yearMonth: YearMonth,
): boolean {
  const monthStart = `${yearMonth}-01`;
  const monthEnd = lastDayOfMonth(yearMonth);
  return campaign.startDate <= monthEnd && campaign.endDate >= monthStart;
}

/** viewer 為發布者本人，或在其下線組織內。 */
export function isPromotionVisibleToMember(
  campaign: PromotionCampaign,
  viewerMemberId: EntityId,
  allMembers: Member[],
): boolean {
  if (campaign.createdByMemberId === viewerMemberId) {
    return true;
  }
  const downlineIds = collectDownlineIds(allMembers, campaign.createdByMemberId);
  return downlineIds.has(viewerMemberId);
}

export function countLinkedDownline(
  publisherMemberId: EntityId,
  allMembers: Member[],
): number {
  return collectDownlineIds(allMembers, publisherMemberId).size;
}

export function resolvePublisherName(
  createdByMemberId: EntityId,
  allMembers: Member[],
): string {
  const publisher = allMembers.find((member) => member.id === createdByMemberId);
  return publisher?.nickname ?? publisher?.displayName ?? "上線";
}

export function buildMemberMonthlyPromotions(input: {
  viewerMemberId: EntityId;
  members: Member[];
  campaigns: PromotionCampaign[];
  referenceDate: ISODateString;
}): MemberMonthlyPromotionsView {
  const yearMonth = toYearMonth(input.referenceDate);
  const [, month] = yearMonth.split("-").map(Number);
  const yearMonthLabel = `${month} 月`;

  const visible = input.campaigns
    .filter(
      (campaign) =>
        campaign.status === "active" &&
        isPromotionActiveInMonth(campaign, yearMonth) &&
        isPromotionVisibleToMember(campaign, input.viewerMemberId, input.members),
    )
    .map((campaign) => ({
      campaign,
      publisherName: resolvePublisherName(campaign.createdByMemberId, input.members),
      tiers: campaign.tiers.slice().sort((left, right) => left.tierLevel - right.tierLevel),
    }));

  return {
    referenceDate: input.referenceDate,
    yearMonth,
    yearMonthLabel,
    campaigns: visible,
  };
}

export function loadViewerMonthlyPromotions(
  viewerMemberId: EntityId,
  members: Member[],
  campaigns: PromotionCampaign[],
  referenceDate: ISODateString,
): MemberMonthlyPromotionsView {
  return buildMemberMonthlyPromotions({
    viewerMemberId,
    members,
    campaigns,
    referenceDate,
  });
}
