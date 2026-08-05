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
    nextStepLabel: "促成成交",
    entryEventTypeKey: ACTIVITY_EVENT_KEYS.CONSULTATION,
    entryEventCategory: "activity",
  },
  {
    key: "transaction",
    title: "成交",
    nextStepLabel: "招募會員",
    entryEventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_CUSTOMER_NTD,
    entryEventCategory: "transaction",
  },
  {
    key: "member",
    title: "會員",
    nextStepLabel: "推進 MAP",
    entryEventTypeKey: RETAIL_TRANSACTION_TYPE_KEYS.NEW_MEMBER_VP,
    entryEventCategory: "transaction",
  },
  {
    key: "map",
    title: "MAP",
    nextStepLabel: "推進督導",
    entryEventTypeKey: MEETING_KEYS.HOM,
    entryEventCategory: "activity",
  },
  {
    key: "supervisor",
    title: "督導",
    nextStepLabel: "推進世界組",
    entryEventTypeKey: null,
    entryEventCategory: null,
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
  const index = STAGE_INDEX.get(stageKey);
  if (index === undefined || index >= RETAIL_PIPELINE_STAGES.length - 1) {
    return null;
  }
  return RETAIL_PIPELINE_STAGES[index + 1]?.key ?? null;
}

export function getPipelineStageTitle(stageKey: RetailPipelineStageKey): string {
  return getPipelineStageDefinition(stageKey).title;
}
