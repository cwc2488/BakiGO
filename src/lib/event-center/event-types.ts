import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import type { BakiEventCategory } from "@/types/baki-event";

export interface EventTypeDefinition {
  key: string;
  category: BakiEventCategory;
  label: string;
  description: string;
  requiresValue: boolean;
  valueLabel?: string;
  requiresCustomerName?: boolean;
}

export const QUALIFICATION_EVENT_KEYS = {
  ACTIVE: "qualification_active",
  SUPERVISOR: "qualification_supervisor",
  WORLD_TEAM: "qualification_world_team",
  PROMOTION_GROUP: "qualification_promotion_group",
  WEALTH_GROUP: "qualification_wealth_group",
  PRESIDENT: "qualification_president",
} as const;

export const ACTIVITY_EVENT_KEYS = {
  MEASUREMENT: "measurement",
  CONSULTATION: "consultation",
  TRIAL_DRINK: "trial_drink",
  PRODUCT_SHARING: "product_sharing",
  HOM: "hom",
  STS: "sts",
  WORLD_TEAM_UNIVERSITY: "world_team_university",
} as const;

export const EVENT_TYPE_CATALOG: EventTypeDefinition[] = [
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    category: "transaction",
    label: "新顧客",
    description: "新顧客成交（金額）",
    requiresValue: true,
    valueLabel: "金額（NT$）",
    requiresCustomerName: true,
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    category: "transaction",
    label: "舊顧客",
    description: "舊顧客成交（金額）",
    requiresValue: true,
    valueLabel: "金額（NT$）",
    requiresCustomerName: true,
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    category: "transaction",
    label: "新會員",
    description: "新會員（VP）",
    requiresValue: true,
    valueLabel: "VP",
    requiresCustomerName: true,
  },
  {
    key: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
    category: "transaction",
    label: "舊會員",
    description: "舊會員（VP）",
    requiresValue: true,
    valueLabel: "VP",
    requiresCustomerName: true,
  },
  {
    key: ACTIVITY_EVENT_KEYS.MEASUREMENT,
    category: "activity",
    label: "量測",
    description: "量測活動",
    requiresValue: false,
  },
  {
    key: ACTIVITY_EVENT_KEYS.CONSULTATION,
    category: "activity",
    label: "諮詢",
    description: "諮詢活動",
    requiresValue: false,
  },
  {
    key: ACTIVITY_EVENT_KEYS.TRIAL_DRINK,
    category: "activity",
    label: "試喝",
    description: "試喝活動",
    requiresValue: false,
  },
  {
    key: ACTIVITY_EVENT_KEYS.PRODUCT_SHARING,
    category: "activity",
    label: "產品分享",
    description: "產品分享活動",
    requiresValue: false,
  },
  {
    key: ACTIVITY_EVENT_KEYS.HOM,
    category: "activity",
    label: "HOM",
    description: "HOM 活動",
    requiresValue: false,
  },
  {
    key: ACTIVITY_EVENT_KEYS.STS,
    category: "activity",
    label: "STS",
    description: "STS 活動",
    requiresValue: false,
  },
  {
    key: ACTIVITY_EVENT_KEYS.WORLD_TEAM_UNIVERSITY,
    category: "activity",
    label: "世界組大學",
    description: "世界組大學活動",
    requiresValue: false,
  },
  {
    key: QUALIFICATION_EVENT_KEYS.ACTIVE,
    category: "qualification",
    label: "Active",
    description: "標記本月 Active",
    requiresValue: false,
  },
  {
    key: QUALIFICATION_EVENT_KEYS.SUPERVISOR,
    category: "qualification",
    label: "升督導",
    description: "晉升督導",
    requiresValue: false,
  },
  {
    key: QUALIFICATION_EVENT_KEYS.WORLD_TEAM,
    category: "qualification",
    label: "升世界組",
    description: "晉升世界組",
    requiresValue: false,
  },
  {
    key: QUALIFICATION_EVENT_KEYS.PROMOTION_GROUP,
    category: "qualification",
    label: "升推廣組",
    description: "晉升推廣組",
    requiresValue: false,
  },
  {
    key: QUALIFICATION_EVENT_KEYS.WEALTH_GROUP,
    category: "qualification",
    label: "升富豪組",
    description: "晉升富豪組",
    requiresValue: false,
  },
  {
    key: QUALIFICATION_EVENT_KEYS.PRESIDENT,
    category: "qualification",
    label: "升總裁",
    description: "晉升總裁",
    requiresValue: false,
  },
];

export function getEventTypeDefinition(
  eventTypeKey: string,
): EventTypeDefinition | undefined {
  return EVENT_TYPE_CATALOG.find((definition) => definition.key === eventTypeKey);
}

export function getEventTypesByCategory(
  category: BakiEventCategory,
): EventTypeDefinition[] {
  return EVENT_TYPE_CATALOG.filter((definition) => definition.category === category);
}
