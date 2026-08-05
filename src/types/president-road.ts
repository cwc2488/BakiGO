import type { ISODateString } from "./common";
import type { PresidentAIResult, Priority } from "./president-ai";

export type PresidentRoadNodeStatus = "not_started" | "in_progress" | "completed";

export type PresidentRoadNodeKey =
  | "member"
  | "map"
  | "supervisor"
  | "active_supervisor"
  | "world_team"
  | "promotion_group"
  | "wealth_group"
  | "president";

export interface PresidentRoadProgressLine {
  label: string;
  value: string;
  remaining?: string | null;
}

export interface PresidentRoadNode {
  key: PresidentRoadNodeKey;
  title: string;
  status: PresidentRoadNodeStatus;
  statusSymbol: string;
  statusLabel: string;
  progressPercent: number | null;
  lines: PresidentRoadProgressLine[];
  remainingSummary: string | null;
}

export interface PresidentRoadSnapshot {
  referenceDate: ISODateString;
  presidentProgressPercent: number;
  distanceToPresidentSummary: string | null;
  nodes: PresidentRoadNode[];
  presidentAI: PresidentAIResult;
  todayNextStep: Priority | null;
  computedAt: string;
}

export const PRESIDENT_ROAD_NODE_DEFINITIONS: Array<{
  key: PresidentRoadNodeKey;
  title: string;
}> = [
  { key: "member", title: "會員" },
  { key: "map", title: "MAP" },
  { key: "supervisor", title: "督導" },
  { key: "active_supervisor", title: "活躍督導" },
  { key: "world_team", title: "世界組" },
  { key: "promotion_group", title: "推廣組" },
  { key: "wealth_group", title: "富豪組" },
  { key: "president", title: "總裁組" },
];

export const PRESIDENT_ROAD_STATUS_LABELS: Record<PresidentRoadNodeStatus, string> = {
  not_started: "未開始",
  in_progress: "進行中",
  completed: "已完成",
};

export const PRESIDENT_ROAD_STATUS_SYMBOLS: Record<PresidentRoadNodeStatus, string> = {
  not_started: "○",
  in_progress: "◎",
  completed: "✓",
};
