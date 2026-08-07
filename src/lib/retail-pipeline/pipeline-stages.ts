import { ACTIVITY_EVENT_KEYS } from "@/lib/event-center/event-types";
import { MEETING_KEYS } from "@/lib/event-center/meeting-types";
import { RETAIL_TRANSACTION_TYPE_KEYS } from "@/lib/business-engine/rules/keys";
import type { BakiEventCategory } from "@/types/baki-event";
import type { RetailPipelineStageKey } from "@/types/retail-pipeline";

export interface RetailPipelineStageDefinition {
  key: RetailPipelineStageKey;
  title: string;
  nextStepLabel: string | null;
  entryEventTypeKey: string | null;
  entryEventCategory: BakiEventCategory | null;
  /** 僅能透過每月自動轉換，不能手動「完成下一步」。 */
  autoRolloverOnly?: boolean;
  autoRolloverHint?: string;
  /** 長期累積池提示（舊客/舊會員等不會每月清零）。 */
  persistentPoolHint?: string;
}

export const RETAIL_PIPELINE_STAGES: RetailPipelineStageDefinition[] = [
  {
    key: "stranger",
    title: "陌生人",
    nextStepLabel: "安排量測",
    entryEventTypeKey: null,
    entryEventCategory: null,
  },
  {
    key: "measurement",
    title: "量測",
    nextStepLabel: "安排諮詢",
    entryEventTypeKey: ACTIVITY_EVENT_KEYS.MEASUREMENT,
    entryEventCategory: "activity",
  },
  {
    key: "consultation",
    title: "諮詢",
    nextStepLabel: "促成新客成交",
    entryEventTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
    entryEventCategory: "activity",
  },
  {
    key: "new_customer",
    title: "本月新客",
    nextStepLabel: null,
    entryEventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    entryEventCategory: "transaction",
    autoRolloverOnly: true,
    autoRolloverHint: "下月自動轉為舊客；舊客需手動招募才會成為會員",
  },
  {
    key: "returning_customer",
    title: "舊客",
    nextStepLabel: "招募為新會員",
    entryEventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_CUSTOMER_NTD,
    entryEventCategory: "transaction",
    persistentPoolHint: "舊客會長期累積，直到你招募為會員或對方停止消費",
  },
  {
    key: "new_member",
    title: "本月新會員",
    nextStepLabel: null,
    entryEventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    entryEventCategory: "transaction",
    autoRolloverOnly: true,
    autoRolloverHint: "下月自動轉為舊會員",
  },
  {
    key: "returning_member",
    title: "舊會員",
    nextStepLabel: "推進 MAP",
    entryEventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.RETURNING_MEMBER_VP,
    entryEventCategory: "transaction",
    persistentPoolHint: "舊會員會長期累積，可安排回購 VP 或推進 MAP/督導",
  },
  {
    key: "map",
    title: "MAP",
    nextStepLabel: "推進督導",
    entryEventTypeKey: MEETING_KEYS.HOM,
    entryEventCategory: "activity",
    persistentPoolHint: "MAP 客戶可培育為督導，計入組織晉升",
  },
  {
    key: "supervisor",
    title: "督導",
    nextStepLabel: "推進世界組",
    entryEventTypeKey: null,
    entryEventCategory: null,
    persistentPoolHint: "名單中的督導可計入下線晉升條件",
  },
  {
    key: "world_team",
    title: "世界組",
    nextStepLabel: null,
    entryEventTypeKey: null,
    entryEventCategory: null,
  },
];

const STAGE_INDEX = new Map(
  RETAIL_PIPELINE_STAGES.map((stage, index) => [stage.key, index]),
);

export function getPipelineStageDefinition(
  stageKey: RetailPipelineStageKey,
): RetailPipelineStageDefinition {
  const stage = RETAIL_PIPELINE_STAGES.find((item) => item.key === stageKey);
  if (!stage) {
    throw new Error(`Unknown pipeline stage: ${stageKey}`);
  }
  return stage;
}

export function getNextPipelineStageKey(
  stageKey: RetailPipelineStageKey,
): RetailPipelineStageKey | null {
  const current = getPipelineStageDefinition(stageKey);
  if (current.autoRolloverOnly) {
    return null;
  }

  const index = STAGE_INDEX.get(stageKey);
  if (index === undefined || index >= RETAIL_PIPELINE_STAGES.length - 1) {
    return null;
  }

  return RETAIL_PIPELINE_STAGES[index + 1]?.key ?? null;
}

export function getPipelineStageTitle(stageKey: RetailPipelineStageKey): string {
  return getPipelineStageDefinition(stageKey).title;
}
