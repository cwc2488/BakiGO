export const EXPERIENCE_21D_SOURCE = "reset_quiz_v2" as const;
export const EXPERIENCE_21D_HEADING = "如果你真的想開始改變";
export const EXPERIENCE_21D_TITLE = "21 天體態體驗";
export const EXPERIENCE_21D_PRIMARY_CTA = "我想了解我的 21 天方案";
export const EXPERIENCE_21D_SECONDARY_CTA = "我先看看自己的分析";
export const EXPERIENCE_21D_FOOTER =
  "每個人的目標、生活與適合的方案不同。教練會先看過你的分析，再和你一起確認怎麼開始。";
export const EXPERIENCE_21D_LANDING_CTA_HINT =
  "你已經知道自己卡在哪裡。接下來，看看這 21 天我們可以怎麼陪你。";
export const EXPERIENCE_21D_INCLUDES = [
  { id: "coach", label: "真人教練陪伴" },
  { id: "nutrition", label: "營養／產品方案" },
  { id: "ai", label: "Baki GO AI 每日陪跑" },
] as const;
export const EXPERIENCE_21D_SUCCESS_TITLE = "收到，我已經幫你把這份分析整理好了。";
export const EXPERIENCE_21D_SUCCESS_BODY =
  "接下來會由真人教練先看過你的狀況，再和你一起確認適合的 21 天方式。";
export const EXPERIENCE_21D_SUCCESS_NOTE = "你不用再從頭把自己的故事講一次。";

export const EXPERIENCE_21D_STATUSES = [
  "interested",
  "contacted",
  "considering",
  "joined",
  "declined",
] as const;
export type Experience21dStatus = (typeof EXPERIENCE_21D_STATUSES)[number];

export const EXPERIENCE_21D_FUNNEL_EVENTS = [
  "report_viewed",
  "21d_offer_viewed",
  "21d_interest_clicked",
  "21d_interest_created",
  "21d_contact_captured",
  "21d_partner_viewed",
  "21d_contacted",
  "21d_landing_viewed",
  "21d_consultation_method_selected",
  "21d_consultation_started",
  "21d_consultation_submitted",
] as const;
export type Experience21dFunnelEvent = (typeof EXPERIENCE_21D_FUNNEL_EVENTS)[number];

export const EXPERIENCE_21D_FORBIDDEN_CONSUMER = [
  "NT$",
  "price",
  "checkout",
  "信用卡",
  "購物車",
  "立即購買",
  "免費",
  "試用",
  "購買",
  "優惠",
  "折扣",
  "購買成功",
  "預約成功",
  "報名成功",
] as const;
