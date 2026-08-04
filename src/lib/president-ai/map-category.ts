import type { FocusModeKey, PriorityCategory } from "@/types/president-ai";

export function resolveCategoryFromStepKey(stepKey: string): PriorityCategory {
  if (stepKey.includes("world_team") || stepKey.includes("_vp")) {
    return "VP";
  }
  if (stepKey.includes("map_")) {
    return "MAP";
  }
  if (stepKey.startsWith("promotion_")) {
    return "PROMOTION";
  }
  if (stepKey.includes("retail") || stepKey.includes("monthly_criterion_retail")) {
    return "RETAIL";
  }
  if (stepKey.startsWith("daily_")) {
    return "ACTIVE";
  }
  if (stepKey.includes("qualification")) {
    return "QUALIFICATION";
  }
  return "MISSION";
}

export function resolveCategoryFromMetric(metric: string): PriorityCategory {
  switch (metric) {
    case "vp":
    case "organization_vp":
      return "VP";
    case "map":
      return "MAP";
    case "active_line":
      return "ACTIVE";
    case "supervisor_count":
    case "world_team_count":
    case "expansion_team_count":
    case "millionaire_team_count":
    case "president_team_count":
      return "PROMOTION";
    default:
      return "QUALIFICATION";
  }
}

export function resolveCategoryFromCriterionKey(criterionKey: string): PriorityCategory {
  if (criterionKey.includes("_vp")) {
    return "VP";
  }
  if (criterionKey.includes("retail")) {
    return "RETAIL";
  }
  return "MISSION";
}

export function resolveFocusModeFromCategory(
  category: PriorityCategory,
  stepKey?: string,
): FocusModeKey {
  if (stepKey === "map_active_lines") {
    return "President Sprint";
  }

  if (stepKey?.includes("world_team") || category === "QUALIFICATION") {
    return "World Team Sprint";
  }

  switch (category) {
    case "VP":
      return "VP Sprint";
    case "MAP":
      return "MAP Sprint";
    case "PROMOTION":
      return "Promotion Sprint";
    case "RETAIL":
      return "Retail Sprint";
    case "ACTIVE":
      return "Leadership Sprint";
    case "MISSION":
      return "Leadership Sprint";
    default:
      return "Leadership Sprint";
  }
}
