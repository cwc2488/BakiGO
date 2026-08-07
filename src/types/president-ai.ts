export type PriorityCategory =
  | "VP"
  | "MAP"
  | "ACTIVE"
  | "RETAIL"
  | "PROMOTION"
  | "MISSION"
  | "QUALIFICATION";

export type FocusModeKey =
  | "VP Sprint"
  | "MAP Sprint"
  | "Promotion Sprint"
  | "Retail Sprint"
  | "Leadership Sprint"
  | "World Team Sprint"
  | "President Sprint";

export interface Priority {
  title: string;
  description: string;
  score: number;
  category: PriorityCategory;
  expectedImpact: number;
  /** Trace back to engine source — UI must not interpret. */
  sourceKey: string;
  /** Playbook 第一步連結，供「今日一步」一鍵執行。 */
  actionHref?: string;
}

export interface Warning {
  warningKey: string;
  message: string;
  category: PriorityCategory | "SYSTEM";
}

export interface Opportunity {
  opportunityKey: string;
  title: string;
  description: string;
  category: PriorityCategory;
  score: number;
}

export interface FocusMode {
  key: FocusModeKey;
  label: string;
  reason: string;
}

export interface PresidentAIResult {
  topPriorities: Priority[];
  reasoning: string[];
  warnings: Warning[];
  opportunities: Opportunity[];
  focusMode: FocusMode;
  computedAt: string;
}
