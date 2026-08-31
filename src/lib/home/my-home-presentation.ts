/**
 * 「我的」事業首頁 presentation — UI only.
 * Does not change VP / MAP / qualification / gamification / promotion authority.
 */

import type { Priority } from "@/types/president-ai";
import type { MemberComputedMetrics } from "@/lib/services/recalculate-member-metrics";
import type { DailyActionSnapshot } from "@/types/daily-action";
import { formatDailyActionProgress } from "@/lib/daily-action/daily-action-selectors";

const INTERNAL_COPY_PATTERNS = [
  /\bVP Sprint\b/i,
  /\bMAP Sprint\b/i,
  /\bPromotion Sprint\b/i,
  /\bRetail Sprint\b/i,
  /\bLeadership Sprint\b/i,
  /\bWorld Team Sprint\b/i,
  /\bPresident Sprint\b/i,
  /\bscore\s*%/i,
  /\bsourceKey\b/i,
  /\bexpectedImpact\b/i,
  /\bQUALIFICATION\b/,
  /\bPROMOTION\b/,
  /\bMISSION\b/,
  /\bACTIVE\b/,
  /_[a-z0-9]+_[a-z0-9]+/,
];

export function containsInternalMyHomeTerminology(text: string): boolean {
  return INTERNAL_COPY_PATTERNS.some((pattern) => pattern.test(text));
}

export function humanizeHomePriorityCopy(text: string | null | undefined): string {
  const raw = text?.trim() ?? "";
  if (!raw) return "請查看今日行動了解細節";
  if (containsInternalMyHomeTerminology(raw)) {
    // Soft strip known English sprint labels; keep Chinese body if mixed.
    const cleaned = raw
      .replace(/\b(VP|MAP|Promotion|Retail|Leadership|World Team|President)\s+Sprint\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (cleaned && !containsInternalMyHomeTerminology(cleaned)) return cleaned;
    return "請查看今日行動了解細節";
  }
  return raw;
}

export type HomeTodayPriorityCard = {
  index: number;
  title: string;
  description: string | null;
  href: string | null;
};

/** Max 3; never expose score / category / sourceKey. */
export function buildHomeTodayPriorities(priorities: Priority[]): HomeTodayPriorityCard[] {
  return priorities.slice(0, 3).map((priority, index) => ({
    index: index + 1,
    title: humanizeHomePriorityCopy(priority.title),
    description: priority.description
      ? humanizeHomePriorityCopy(priority.description)
      : null,
    href: priority.actionHref?.trim() || null,
  }));
}

export type HomeProgressRow = {
  label: string;
  value: string;
  percent: number | null;
};

export type HomeProgressView = {
  nextGoalLabel: string;
  nextGoalValue: string | null;
  nextGoalPercent: number | null;
  rows: HomeProgressRow[];
  fullProgressHref: "/president-road";
};

function findVpTargetFromMetrics(metrics: MemberComputedMetrics): number | null {
  const vpStep = metrics.nextSteps.find(
    (step) =>
      step.stepKey.includes("vp") ||
      step.stepKey.includes("map_monthly") ||
      /VP/i.test(step.title),
  );
  if (vpStep && Number.isFinite(vpStep.target)) return vpStep.target;

  for (const result of metrics.qualificationResults) {
    const gap = result.gaps.find(
      (item) => item.unit.toLowerCase().includes("vp") || item.metric.includes("vp"),
    );
    if (gap && Number.isFinite(gap.target)) return gap.target;
  }
  return null;
}

function findMapConsecutiveLabel(metrics: MemberComputedMetrics): {
  value: string;
  percent: number | null;
} | null {
  for (const result of metrics.qualificationResults) {
    const walk = (
      node: (typeof result.root) | undefined,
    ): { current: number; target: number; percent: number | null } | null => {
      if (!node) return null;
      if (
        node.conditionKey?.includes("consecutive") &&
        node.current != null &&
        node.target != null
      ) {
        return {
          current: node.current,
          target: node.target,
          percent: node.progressPercent,
        };
      }
      for (const child of node.children ?? []) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    const hit = walk(result.root);
    if (hit) {
      return {
        value: `第 ${hit.current} / ${hit.target} 個月`,
        percent: hit.percent,
      };
    }
  }

  if (metrics.map.totalLines != null && metrics.map.totalLines > 0) {
    return {
      value: `活躍線 ${metrics.map.activeLines} / ${metrics.map.totalLines}`,
      percent: metrics.map.progressPercent,
    };
  }

  return null;
}

/**
 * Adaptive progress block from existing authorities only.
 * No aggregate "今日完成度". Monthly metrics labeled as monthly.
 */
export function buildHomeProgressView(
  metrics: MemberComputedMetrics,
  daily: Pick<DailyActionSnapshot, "monthlyMeasurement" | "monthlyConsultation">,
): HomeProgressView {
  const promotion = metrics.promotionProgress;
  const mapConsecutive = findMapConsecutiveLabel(metrics);
  const vpTarget = findVpTargetFromMetrics(metrics);

  const nextGoalLabel = promotion.isMaxRank
    ? "目前資格"
    : promotion.nextRankName
      ? `下一個目標`
      : "目前資格";

  let nextGoalValue: string | null = null;
  let nextGoalPercent: number | null = null;

  if (promotion.isMaxRank) {
    nextGoalValue = promotion.currentRankName || "—";
    nextGoalPercent = 100;
  } else if (mapConsecutive && (promotion.nextRankName?.includes("督導") || !promotion.nextRankName)) {
    nextGoalValue = promotion.nextRankName
      ? `${promotion.nextRankName} · ${mapConsecutive.value}`
      : mapConsecutive.value;
    nextGoalPercent = mapConsecutive.percent ?? promotion.progressPercent;
  } else if (promotion.nextRankName) {
    nextGoalValue = promotion.nextRankName;
    nextGoalPercent = promotion.progressPercent;
    if (promotion.progressSource === "downline" && promotion.target != null) {
      nextGoalValue = `${promotion.nextRankName}（${promotion.current} / ${promotion.target}）`;
    }
  } else {
    nextGoalValue = promotion.currentRankName || "—";
    nextGoalPercent = promotion.progressPercent;
  }

  const rows: HomeProgressRow[] = [];

  const vpStep = metrics.nextSteps.find(
    (step) => step.stepKey.includes("vp") || step.stepKey.includes("map_monthly"),
  );

  if (vpStep) {
    rows.push({
      label: "本月 VP",
      value: `${vpStep.current.toLocaleString("zh-Hant")} / ${vpStep.target.toLocaleString("zh-Hant")} VP`,
      percent: vpStep.progressPercent,
    });
  } else {
    rows.push({
      label: "本月 VP",
      value:
        vpTarget != null
          ? `${metrics.vp.totalVp.toLocaleString("zh-Hant")} / ${vpTarget.toLocaleString("zh-Hant")} VP`
          : `${metrics.vp.totalVp.toLocaleString("zh-Hant")} VP`,
      // Prefer engine percent only — never invent KPI math in UI.
      percent: null,
    });
  }

  rows.push({
    label: "本月量測",
    value: formatDailyActionProgress(
      daily.monthlyMeasurement.current,
      daily.monthlyMeasurement.target,
    ),
    percent: daily.monthlyMeasurement.progressPercent,
  });

  rows.push({
    label: "本月諮詢",
    value: formatDailyActionProgress(
      daily.monthlyConsultation.current,
      daily.monthlyConsultation.target,
    ),
    percent: daily.monthlyConsultation.progressPercent,
  });

  return {
    nextGoalLabel,
    nextGoalValue,
    nextGoalPercent,
    rows,
    fullProgressHref: "/president-road",
  };
}

/**
 * Partner App V2 — legacy home entries removed from product surface.
 * Routes remain accessible for deep links / admin; data preserved.
 */

export type HomeBusinessEntry = {
  href: string;
  title: string;
  iconKey: "goals" | "organization" | "retail" | "leaderboard" | "learning";
};

/** @deprecated V2 — empty; core features live in bottom nav. */
export const MY_HOME_BUSINESS_ENTRIES: HomeBusinessEntry[] = [];

export type HomeMoreEntry = {
  href: string;
  title: string;
};

/** V2 — profile & admin only; legacy partner tools hidden from home surface. */
export const MY_HOME_MORE_ENTRIES: HomeMoreEntry[] = [
  { href: "/profile", title: "個人資料／設定" },
  { href: "/promotions", title: "活動／促銷" },
  { href: "/pre-meeting-graphic", title: "會前會圖" },
];

export const CROSS_WORLD_HREFS = ["/customers", "/calendar", "/coaching"] as const;

export function isCrossWorldHomeShortcut(href: string): boolean {
  return (CROSS_WORLD_HREFS as readonly string[]).includes(href);
}
