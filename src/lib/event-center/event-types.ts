import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import type { BakiEventCategory } from "@/types/baki-event";
import {
  MEETING_KEY_LIST,
  MEETING_LABELS,
  type MeetingKey,
} from "./meeting-types";

export interface EventTypeDefinition {
  key: string;
  category: BakiEventCategory;
  label: string;
  description: string;
  requiresValue: boolean;
  valueLabel?: string;
  requiresCustomerName?: boolean;
  /** UI grouping for recordable activity types. */
  recordGroup?: "daily" | "meeting";
}

export const ACTIVITY_EVENT_KEYS = {
  MEASUREMENT: "measurement",
  CONSULTATION: "consultation",
  COACH_CLASS: "coach_class",
} as const;

const TRANSACTION_EVENT_TYPES: EventTypeDefinition[] = [
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
];

const RECORDABLE_ACTIVITY_TYPES: EventTypeDefinition[] = [
  {
    key: ACTIVITY_EVENT_KEYS.MEASUREMENT,
    category: "activity",
    label: "量測",
    description: "量測活動",
    requiresValue: false,
    recordGroup: "daily",
  },
  {
    key: ACTIVITY_EVENT_KEYS.CONSULTATION,
    category: "activity",
    label: "諮詢",
    description: "諮詢活動",
    requiresValue: false,
    recordGroup: "daily",
  },
  {
    key: ACTIVITY_EVENT_KEYS.COACH_CLASS,
    category: "activity",
    label: "教練課",
    description: "教練課",
    requiresValue: false,
    recordGroup: "daily",
  },
  ...MEETING_KEY_LIST.map((key: MeetingKey) => ({
    key,
    category: "activity" as const,
    label: MEETING_LABELS[key],
    description: `${MEETING_LABELS[key]}（可重複參加）`,
    requiresValue: false,
    recordGroup: "meeting" as const,
  })),
];

/** Full catalog — includes transaction types for零售屋 / 名單流程 / 今日行動。 */
export const EVENT_TYPE_CATALOG: EventTypeDefinition[] = [
  ...TRANSACTION_EVENT_TYPES,
  ...RECORDABLE_ACTIVITY_TYPES,
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

export function getTransactionEventTypes(): EventTypeDefinition[] {
  return TRANSACTION_EVENT_TYPES;
}

/** 紀錄中心可登記的類型：日常活動 + 會議（不含成交、資格）。 */
export function getRecordableEventTypes(): EventTypeDefinition[] {
  return RECORDABLE_ACTIVITY_TYPES;
}

export function getRecordableEventTypesByGroup(
  group: "daily" | "meeting",
): EventTypeDefinition[] {
  return RECORDABLE_ACTIVITY_TYPES.filter((definition) => definition.recordGroup === group);
}
