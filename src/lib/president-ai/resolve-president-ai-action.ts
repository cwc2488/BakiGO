import type { TodayActionKey } from "@/types/daily-action";
import type { Priority, PriorityCategory } from "@/types/president-ai";

export type PresidentAiQuickLogAction = {
  kind: "quick-log";
  actionKey: TodayActionKey;
  label: string;
};

export type PresidentAiNavigateAction = {
  kind: "navigate";
  href: string;
  label: string;
};

export type PresidentAiAction = PresidentAiQuickLogAction | PresidentAiNavigateAction;

const QUICK_LOG_LABELS: Record<TodayActionKey, string> = {
  measurement: "立即記錄量測",
  consultation: "立即記錄諮詢",
  recruit: "立即記錄招募",
};

function includesAny(sourceKey: string, needles: string[]): boolean {
  const lower = sourceKey.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function resolveQuickLog(actionKey: TodayActionKey): PresidentAiQuickLogAction {
  return {
    kind: "quick-log",
    actionKey,
    label: QUICK_LOG_LABELS[actionKey],
  };
}

function resolveFromSourceKey(sourceKey: string): PresidentAiAction | null {
  if (sourceKey === "daily_measurement" || sourceKey.endsWith("_measurement")) {
    return resolveQuickLog("measurement");
  }
  if (sourceKey === "daily_consultation" || sourceKey.endsWith("_consultation")) {
    return resolveQuickLog("consultation");
  }
  if (includesAny(sourceKey, ["first_member", "recruit", "super_league"])) {
    return resolveQuickLog("recruit");
  }
  if (sourceKey === "map_active_lines") {
    return { kind: "navigate", href: "/organization", label: "查看組織圖" };
  }
  if (includesAny(sourceKey, ["retail_house", "retail_new", "retail_returning"])) {
    return { kind: "navigate", href: "/retail-pipeline", label: "前往名單" };
  }
  if (sourceKey.startsWith("promotion_") || sourceKey.startsWith("promotion_ready_")) {
    return { kind: "navigate", href: "/president-road", label: "查看晉升路徑" };
  }
  if (sourceKey === "vp_complete_shift_downline") {
    return { kind: "navigate", href: "/organization", label: "查看組織圖" };
  }
  if (includesAny(sourceKey, ["world_team_vp", "_vp"])) {
    return { kind: "navigate", href: "/events", label: "新增成交紀錄" };
  }
  if (sourceKey.startsWith("challenge_")) {
    const criterionKey = sourceKey.slice("challenge_".length);
    if (criterionKey.includes("measurement")) {
      return resolveQuickLog("measurement");
    }
    if (criterionKey.includes("consultation")) {
      return resolveQuickLog("consultation");
    }
    if (criterionKey.includes("retail")) {
      return { kind: "navigate", href: "/retail-house", label: "前往零售屋" };
    }
  }
  if (sourceKey.startsWith("monthly_criterion_")) {
    const criterionKey = sourceKey.slice("monthly_criterion_".length);
    if (criterionKey.includes("measurement")) {
      return resolveQuickLog("measurement");
    }
    if (criterionKey.includes("consultation")) {
      return resolveQuickLog("consultation");
    }
    if (criterionKey.includes("retail")) {
      return { kind: "navigate", href: "/retail-house", label: "前往零售屋" };
    }
  }
  return null;
}

function resolveFromCategory(category: PriorityCategory): PresidentAiAction {
  switch (category) {
    case "ACTIVE":
      return resolveQuickLog("measurement");
    case "RETAIL":
      return { kind: "navigate", href: "/retail-pipeline", label: "前往名單" };
    case "MAP":
      return { kind: "navigate", href: "/organization", label: "查看組織圖" };
    case "PROMOTION":
      return { kind: "navigate", href: "/president-road", label: "查看晉升路徑" };
    case "VP":
      return { kind: "navigate", href: "/events", label: "新增成交紀錄" };
    case "MISSION":
      return { kind: "navigate", href: "/daily-action", label: "前往今日行動" };
    case "QUALIFICATION":
    default:
      return { kind: "navigate", href: "/goals", label: "查看目標中心" };
  }
}

function resolvePlaybookHref(href: string, label: string): PresidentAiAction {
  const measurementMatch = href.match(/[?&]action=measurement/);
  if (measurementMatch) {
    return resolveQuickLog("measurement");
  }
  const consultationMatch = href.match(/[?&]action=consultation/);
  if (consultationMatch) {
    return resolveQuickLog("consultation");
  }
  const recruitMatch = href.match(/[?&]action=recruit/);
  if (recruitMatch) {
    return resolveQuickLog("recruit");
  }
  return { kind: "navigate", href, label };
}

function resolveActionHref(
  priority: Priority,
  fallbackLabel: string,
): PresidentAiAction | null {
  if (!priority.actionHref) {
    return null;
  }
  return resolvePlaybookHref(priority.actionHref, priority.title || fallbackLabel);
}

function resolveMemberGoalAction(priority: Priority): PresidentAiAction {
  const fromHref = resolveActionHref(priority, "執行今日建議");
  if (fromHref) {
    return fromHref;
  }
  if (priority.category === "VP") {
    return { kind: "navigate", href: "/events", label: "新增成交紀錄" };
  }
  if (priority.category === "RETAIL") {
    return { kind: "navigate", href: "/retail-pipeline", label: "前往名單" };
  }
  return { kind: "navigate", href: "/goals", label: "查看目標進度" };
}

export function resolvePresidentAiAction(
  priority: Priority | null | undefined,
): PresidentAiAction | null {
  if (!priority) {
    return null;
  }

  if (
    priority.sourceKey.startsWith("pipeline_push_") ||
    priority.sourceKey.startsWith("downline_no_meetings_") ||
    priority.sourceKey.startsWith("downline_no_new_customers_") ||
    priority.sourceKey.startsWith("member_goal_") ||
    priority.sourceKey === "rank_daily_guidance" ||
    priority.sourceKey.startsWith("promotion_")
  ) {
    if (
      priority.sourceKey.startsWith("downline_no_meetings_") ||
      priority.sourceKey.startsWith("downline_no_new_customers_")
    ) {
      return {
        kind: "navigate",
        href: priority.actionHref ?? "/organization",
        label: "查看夥伴",
      };
    }

    const fromHref = resolveActionHref(priority, "執行今日建議");
    if (fromHref) {
      return fromHref;
    }
  }

  if (priority.sourceKey.startsWith("member_goal_")) {
    return resolveMemberGoalAction(priority);
  }

  return resolveFromSourceKey(priority.sourceKey) ?? resolveFromCategory(priority.category);
}

export function buildQuickLogHref(actionKey: TodayActionKey): string {
  return `/daily-action?action=${actionKey}`;
}
