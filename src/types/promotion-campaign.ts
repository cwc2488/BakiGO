import type { EntityId, ISODateString, StoredEntity } from "./common";

/** 促銷達成條件類型 */
export type PromotionConditionType =
  | "consecutive_monthly_vp"
  | "single_month_vp"
  | "custom";

export interface PromotionTier {
  /** 第幾重獎勵（1、2、3…） */
  tierLevel: number;
  title: string;
  conditionType: PromotionConditionType;
  /** 連續達標：起始月 YYYY-MM */
  startMonth?: string;
  /** 連續達標：結束月 YYYY-MM */
  endMonth?: string;
  /** 連續／當月：VP 門檻 */
  vpTarget?: number;
  /** 單月達標：目標月 YYYY-MM */
  targetMonth?: string;
  /** 自訂條件說明 */
  customCondition?: string;
  rewardTitle: string;
  rewardDescription?: string;
}

export interface PromotionCampaign extends StoredEntity {
  organizationId: EntityId;
  createdByMemberId: EntityId;
  /** 發布當下第一代下線人數（不含本人） */
  linkedDownlineCount: number;
  title: string;
  description?: string;
  startDate: ISODateString;
  endDate: ISODateString;
  tiers: PromotionTier[];
  status: "active" | "ended";
}

export interface PromotionCampaignCreateInput {
  organizationId: EntityId;
  createdByMemberId: EntityId;
  title: string;
  description?: string;
  startDate: ISODateString;
  endDate: ISODateString;
  tiers: PromotionTier[];
}
