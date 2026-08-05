import type { FocusModeKey, PriorityCategory } from "@/types/president-ai";

export const FOCUS_MODE_LABELS: Record<FocusModeKey, string> = {
  "VP Sprint": "VP 衝刺",
  "MAP Sprint": "MAP 衝刺",
  "Promotion Sprint": "晉升衝刺",
  "Retail Sprint": "零售衝刺",
  "Leadership Sprint": "領導衝刺",
  "World Team Sprint": "世界組衝刺",
  "President Sprint": "總裁衝刺",
};

export const PRIORITY_CATEGORY_LABELS: Record<PriorityCategory, string> = {
  VP: "VP",
  MAP: "MAP",
  ACTIVE: "活躍",
  RETAIL: "零售",
  PROMOTION: "晉升",
  MISSION: "任務",
  QUALIFICATION: "資格",
};

export function formatFocusModeLabel(key: FocusModeKey): string {
  return FOCUS_MODE_LABELS[key] ?? key;
}

export function formatPriorityCategoryLabel(category: PriorityCategory): string {
  return PRIORITY_CATEGORY_LABELS[category] ?? category;
}
