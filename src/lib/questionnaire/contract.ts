/** 問卷開發 form contract — public + partner UI shared enums/labels. */

export const QUESTIONNAIRE_IMPROVEMENT_AREAS = [
  "體重／體脂",
  "增加肌肉／線條",
  "體力／精神",
  "飲食習慣",
  "睡眠",
  "腸胃／排便",
  "日常健康管理",
  "目前沒有特別想改善",
  "其他",
] as const;
export type QuestionnaireImprovementArea = (typeof QUESTIONNAIRE_IMPROVEMENT_AREAS)[number];

export const QUESTIONNAIRE_EXERCISE_OPTIONS = [
  { value: "almost_none", label: "幾乎沒有" },
  { value: "once", label: "1 次" },
  { value: "two_to_three", label: "2～3 次" },
  { value: "four_plus", label: "4 次以上" },
] as const;

export const QUESTIONNAIRE_EXERCISE_VALUES = [
  "almost_none",
  "once",
  "two_to_three",
  "four_plus",
] as const;

export const QUESTIONNAIRE_INTEREST_OPTIONS = [
  { value: "high", label: "會，可以了解看看", partnerLabel: "高意願" },
  { value: "medium", label: "有點興趣", partnerLabel: "有興趣" },
  { value: "low", label: "暫時不用", partnerLabel: "暫時不用" },
] as const;

export const QUESTIONNAIRE_INTEREST_VALUES = ["high", "medium", "low"] as const;

export const QUESTIONNAIRE_CONTACT_TYPES = ["line", "instagram", "phone"] as const;

export const QUESTIONNAIRE_CONTACT_TYPE_LABEL: Record<
  (typeof QUESTIONNAIRE_CONTACT_TYPES)[number],
  string
> = {
  line: "LINE",
  instagram: "Instagram",
  phone: "電話",
};

export const QUESTIONNAIRE_LEAD_STATUSES = [
  "new",
  "contacted",
  "invitation_started",
  "completed",
  "paused",
] as const;

export const QUESTIONNAIRE_LEAD_STATUS_LABEL: Record<
  (typeof QUESTIONNAIRE_LEAD_STATUSES)[number],
  string
> = {
  new: "未聯絡",
  contacted: "已聯絡",
  invitation_started: "已進入邀約5步驟",
  completed: "已完成",
  paused: "暫不追蹤",
};

/** Sort priority for list default order. */
export const QUESTIONNAIRE_STATUS_SORT_ORDER: Record<
  (typeof QUESTIONNAIRE_LEAD_STATUSES)[number],
  number
> = {
  new: 0,
  contacted: 1,
  invitation_started: 2,
  paused: 3,
  completed: 4,
};

export const QUESTIONNAIRE_SOURCES = ["onsite", "online"] as const;

export const QUESTIONNAIRE_SOURCE_LABEL: Record<(typeof QUESTIONNAIRE_SOURCES)[number], string> = {
  onsite: "現場",
  online: "網路",
};

export const QUESTIONNAIRE_PUBLIC_COPY = {
  title: "1分鐘生活健康小問卷",
  description:
    "謝謝你幫忙完成問卷 🙌\n大約 1 分鐘，沒有標準答案，\n依照你現在的狀況回答就可以。",
  thanks: "謝謝你幫忙完成問卷 🙌",
  shareText:
    "可以幫我填一份 1 分鐘的生活健康小問卷嗎？\n最近主管請我每天完成幾份，想請你幫個忙 🙏",
  consentLabel: "我同意提供以上資料，供本次問卷紀錄及後續聯絡使用。",
  consentHint: "資料不會公開。",
} as const;

export const QUESTIONNAIRE_LIMITS = {
  displayNameMax: 80,
  priorityImprovementMax: 200,
  supplementDetailsMax: 300,
  contactValueMax: 80,
  improvementOtherMax: 200,
  payloadMaxBytes: 32_000,
} as const;

export type QuestionnairePublicSubmitInput = {
  shareCode: string;
  source?: string | null;
  improvementAreas: string[];
  improvementOther?: string | null;
  bodySatisfactionScore: number;
  weeklyExerciseFrequency: string;
  usesSupplements: boolean;
  supplementDetails?: string | null;
  priorityImprovement: string;
  furtherUnderstandingInterest: string;
  displayName: string;
  contactType: string;
  contactValue: string;
  consentAccepted: boolean;
  /** Honeypot — must be empty for humans. */
  companyWebsite?: string | null;
};

export type QuestionnaireLeadStatusPatch =
  | "contacted"
  | "invitation_started"
  | "completed"
  | "paused"
  | "new";

const STATUS_TRANSITIONS: Record<
  (typeof QUESTIONNAIRE_LEAD_STATUSES)[number],
  QuestionnaireLeadStatusPatch[]
> = {
  new: ["contacted", "invitation_started", "paused"],
  contacted: ["invitation_started", "paused"],
  invitation_started: ["completed", "paused"],
  paused: ["contacted", "invitation_started"],
  completed: [],
};

export function allowedQuestionnaireStatusActions(
  status: (typeof QUESTIONNAIRE_LEAD_STATUSES)[number],
): QuestionnaireLeadStatusPatch[] {
  return STATUS_TRANSITIONS[status] ?? [];
}