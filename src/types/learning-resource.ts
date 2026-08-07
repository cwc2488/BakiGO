export type LearningStuckPointKey =
  | "pipeline_empty"
  | "pipeline_early"
  | "pipeline_consultation"
  | "objection_handling"
  | "map_qualification"
  | "retail_vp"
  | "retail_house"
  | "foundation_newcomer"
  | "organization_growth"
  | "president_path"
  | "marketing_overview"
  | "product_knowledge";

export interface LearningResource {
  id: string;
  title: string;
  youtubeUrl: string;
  stuckPoints: LearningStuckPointKey[];
  seriesKey?: string;
  seriesPart?: number;
  note?: string;
}

export interface LearningRecommendation {
  resourceId: string;
  title: string;
  youtubeUrl: string;
  stuckPointKey: LearningStuckPointKey;
  stuckPointLabel: string;
  reason: string;
  note?: string;
}

export const LEARNING_STUCK_POINT_LABELS: Record<LearningStuckPointKey, string> = {
  pipeline_empty: "名單還是空的",
  pipeline_early: "漏斗上游（量測/新名單）",
  pipeline_consultation: "諮詢成交階段",
  objection_handling: "面對客戶異議",
  map_qualification: "MAP 計劃 / 晉升督導",
  retail_vp: "個人 VP 不足",
  retail_house: "零售屋經營",
  foundation_newcomer: "新人底盤建立",
  organization_growth: "組織複製與培育",
  president_path: "晉升總裁路徑",
  marketing_overview: "了解事業與制度",
  product_knowledge: "產品熟悉度",
};
