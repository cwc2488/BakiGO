/** TRANSFORMATION-FUNNEL-01 form contract — shared by public submit + admin validation. */

export const TRANSFORMATION_LANDING_PAGE_VERSION = "LP_A" as const;

export const TRANSFORMATION_GOALS = ["減重", "減脂", "雕塑", "增加肌肉", "其他"] as const;
export type TransformationGoal = (typeof TRANSFORMATION_GOALS)[number];

export const TRANSFORMATION_PAIN_POINTS = [
  "不知道怎麼吃",
  "不知道怎麼運動",
  "做過很多方法但效果不好",
  "容易放棄／難以持續",
  "體重容易反覆",
  "不知道從哪裡開始",
  "其他",
] as const;
export type TransformationPainPoint = (typeof TRANSFORMATION_PAIN_POINTS)[number];

export const TRANSFORMATION_LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "appointment",
  "showed",
  "converted",
  "lost",
] as const;
export type TransformationLeadStatus = (typeof TRANSFORMATION_LEAD_STATUSES)[number];

export const TRANSFORMATION_LOST_REASONS = [
  "unreachable",
  "no_interest",
  "price",
  "distance",
  "schedule",
  "not_qualified",
  "duplicate",
  "other",
] as const;
export type TransformationLostReason = (typeof TRANSFORMATION_LOST_REASONS)[number];

export const TRANSFORMATION_LEAD_STATUS_LABEL: Record<TransformationLeadStatus, string> = {
  new: "新名單",
  contacted: "已聯絡",
  qualified: "已確認需求",
  appointment: "已安排",
  showed: "已到店",
  converted: "已轉換",
  lost: "已流失",
};

export const TRANSFORMATION_LOST_REASON_LABEL: Record<TransformationLostReason, string> = {
  unreachable: "聯絡不上",
  no_interest: "無興趣",
  price: "價格因素",
  distance: "距離因素",
  schedule: "時間配合問題",
  not_qualified: "不符合條件",
  duplicate: "重複名單",
  other: "其他",
};

export type TransformationAttribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  placement: string | null;
};

export type TransformationPublicSubmitInput = {
  shareCode: string;
  name: string;
  phone: string;
  socialContact?: string | null;
  goal: string;
  targetAreaOrProblem: string;
  painPoint: string;
  consentAccepted: boolean;
  attribution?: Partial<TransformationAttribution> | null;
  source?: string | null;
  landingPath?: string | null;
  referrer?: string | null;
  landingPageVersion?: string | null;
};
