import type { GoalKpiCategory } from "@/types/goal-center";
import { QUALIFICATION_METRICS } from "@/lib/business-engine/rules/qualification";

export function resolveKpiCategoryFromStepKey(stepKey: string): GoalKpiCategory {
  if (stepKey.startsWith("qualification_")) {
    return "qualification";
  }
  if (stepKey.startsWith("promotion_")) {
    return "qualification";
  }
  if (stepKey.includes("world_team_vp") || stepKey.endsWith("_vp")) {
    return "vp";
  }
  if (stepKey.includes("map_")) {
    return "map";
  }
  if (stepKey === "daily_measurement") {
    return "daily_measurement";
  }
  if (stepKey.startsWith("monthly_criterion_")) {
    return "daily_transaction";
  }
  if (stepKey.includes("active")) {
    return "active";
  }
  return "qualification";
}

export function resolveKpiCategoryFromQualificationMetric(metric: string): GoalKpiCategory {
  switch (metric) {
    case QUALIFICATION_METRICS.VP:
    case QUALIFICATION_METRICS.ORGANIZATION_VP:
      return "vp";
    case QUALIFICATION_METRICS.MAP:
      return "map";
    case QUALIFICATION_METRICS.ACTIVE_LINE:
      return "active";
    case QUALIFICATION_METRICS.ACTIVITY:
      return "daily_measurement";
    default:
      return "qualification";
  }
}

export function isDailyKpi(category: GoalKpiCategory): boolean {
  return category === "daily_measurement";
}

export function kpiIconKey(category: GoalKpiCategory): string {
  switch (category) {
    case "vp":
      return "bolt";
    case "map":
      return "map";
    case "daily_measurement":
      return "measurement";
    case "daily_transaction":
      return "sale";
    case "active":
      return "active";
    case "qualification":
      return "promotion";
    default:
      return "target";
  }
}

export function kpiColor(category: GoalKpiCategory): string {
  switch (category) {
    case "vp":
      return "#77b539";
    case "map":
      return "#30d158";
    case "daily_measurement":
      return "#5856d6";
    case "daily_transaction":
      return "#ff9500";
    case "active":
      return "#ff375f";
    case "qualification":
      return "#af52de";
    default:
      return "#86868b";
  }
}
