/** RECRUIT-FUNNEL-01 form contract — shared by Partner preview + public submit validation. */

export const RECRUITMENT_AGE_RANGES = ["18–22", "23–27", "28–35", "36–45", "46+"] as const;
export type RecruitmentAgeRange = (typeof RECRUITMENT_AGE_RANGES)[number];

export const RECRUITMENT_WORK_STATUSES = [
  "上班族",
  "學生",
  "健身／運動相關",
  "健康／美容相關",
  "自由工作者",
  "自行創業",
  "其他",
] as const;
export type RecruitmentWorkStatus = (typeof RECRUITMENT_WORK_STATUSES)[number];

export const RECRUITMENT_MOTIVATIONS = [
  "增加額外收入",
  "發展自己的事業",
  "進入健身／健康產業",
  "學習經營客戶與銷售",
  "找一個可以長期發展的團隊",
  "先了解看看",
] as const;
export type RecruitmentMotivation = (typeof RECRUITMENT_MOTIVATIONS)[number];

export const RECRUITMENT_WEEKLY_AVAILABILITY = [
  "3 小時以下",
  "3–6 小時",
  "7–10 小時",
  "10 小時以上",
  "目前不確定",
] as const;
export type RecruitmentWeeklyAvailability = (typeof RECRUITMENT_WEEKLY_AVAILABILITY)[number];

export const RECRUITMENT_LEAD_STATUSES = ["new", "contacted", "follow_up", "not_fit"] as const;
export type RecruitmentLeadStatus = (typeof RECRUITMENT_LEAD_STATUSES)[number];

export const RECRUITMENT_LEAD_STATUS_LABEL: Record<RecruitmentLeadStatus, string> = {
  new: "新名單",
  contacted: "已聯絡",
  follow_up: "持續跟進",
  not_fit: "不適合",
};

export type RecruitmentUtmAttribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
};

export type RecruitmentPublicSubmitInput = {
  shareCode: string;
  name: string;
  ageRange: string;
  city: string;
  district: string;
  workStatus: string;
  motivations: string[];
  weeklyAvailability: string;
  instagram?: string | null;
  lineId?: string | null;
  phone?: string | null;
  consentAccepted: boolean;
  utm?: Partial<RecruitmentUtmAttribution> | null;
  landingPath?: string | null;
  referrer?: string | null;
};
