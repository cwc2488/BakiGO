import type { EntityId, ISODateString, StoredEntity } from "./common";

export type RetailPipelineStageKey =
  | "stranger"
  | "measurement"
  | "consultation"
  | "transaction"
  | "member"
  | "map"
  | "supervisor"
  | "world_team";

export interface RetailPipelineLead extends StoredEntity {
  organizationId: EntityId;
  ownerMemberId: EntityId;
  displayName: string;
  stageKey: RetailPipelineStageKey;
  stageUpdatedAt: ISODateString;
  /** 排定執行日期 */
  scheduledDate?: ISODateString;
  /** 排定執行時間 HH:mm */
  scheduledTime?: string;
  /** 同步至行事曆的事件 ID */
  calendarEventId?: EntityId;
  /** 客戶所在區域 */
  region?: string;
  note?: string;
}

export interface RetailPipelineLeadCreateInput {
  organizationId: EntityId;
  ownerMemberId: EntityId;
  displayName: string;
  scheduledDate?: ISODateString;
  region?: string;
  note?: string;
}

export interface RetailPipelineLeadView {
  leadId: string;
  displayName: string;
  stageKey: RetailPipelineStageKey;
  stageTitle: string;
  nextStepLabel: string | null;
  canAdvance: boolean;
  scheduledDate?: ISODateString;
  scheduledTime?: string;
  calendarEventId?: EntityId;
  region?: string;
}

export interface RetailPipelineColumnView {
  stageKey: RetailPipelineStageKey;
  title: string;
  count: number;
  leads: RetailPipelineLeadView[];
  isDropTarget: boolean;
}

export interface RetailPipelineSnapshot {
  ownerMemberId: EntityId;
  referenceDate: ISODateString;
  columns: RetailPipelineColumnView[];
  totalLeads: number;
}
