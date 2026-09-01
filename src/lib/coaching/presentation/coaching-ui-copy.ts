/**
 * Centralized Coach/Customer UI copy — presentation only.
 * Does not change Outcome / Attention / Growth authority or engine outputs.
 */

import {
  COACHING_MEASUREMENT_STAGE_LABELS,
  COACHING_OUTCOME_STATUS_LABELS,
  COACHING_TREND_STATUS_LABELS,
} from "@/lib/coaching/ai/assess-coaching-outcome";
import { bandLabel, growthPathLabel, readinessLabel } from "@/lib/coaching/growth/build-growth-intelligence";
import { resolveShareReadiness, shareReadinessCopy } from "@/lib/coaching/semantics/share-readiness";
import type { CoachingMeasurementStage, CoachingOutcomeStatus, CoachingTrendStatus } from "@/types/coaching-signals";

/** UX-1.2 Coach-facing outcome labels (presentation only). */
export const UI_OUTCOME_STATUS_LABELS: Record<CoachingOutcomeStatus, string> = {
  ...COACHING_OUTCOME_STATUS_LABELS,
  not_yet_measurable: "等待下一次量測",
  improving: "進展良好",
  mixed: "有進展，仍需留意",
  flat: "最近變化不明顯",
  worsening: "需要調整",
  insufficient_data: "資料不足",
};

export const UI_MEASUREMENT_STAGE_LABELS: Record<CoachingMeasurementStage, string> = {
  ...COACHING_MEASUREMENT_STAGE_LABELS,
  baseline_only: "目前只有起始量測",
  comparison_available: "已可對照起始與最新",
  trend_available: "已可看趨勢",
};

export const UI_TREND_STATUS_LABELS: Record<CoachingTrendStatus, string> = {
  ...COACHING_TREND_STATUS_LABELS,
  not_applicable: "尚不能看趨勢",
  improving: "進展良好",
  mixed: "有進展，仍需留意",
  flat: "最近變化不明顯",
  worsening: "需要調整",
  insufficient_data: "資料不足",
};

export const UI_ATTENTION_TIER_LABELS: Record<string, string> = {
  routine: "陪跑中",
  watch: "持續觀察",
  coach_attention: "建議今天關心",
  normal: "正常",
  measurement_due: "建議安排回測",
  positive_progress: "進展良好",
};

/** Day N/90 → 第 N 天｜90 天陪跑 */
export function formatCoachingDayProgressLabel(
  dayNumber: number | null | undefined,
  dayTotal = 90,
): string {
  if (dayNumber == null || !Number.isFinite(dayNumber)) {
    return `${dayTotal} 天陪跑`;
  }
  return `第 ${Math.max(0, Math.floor(dayNumber))} 天｜${dayTotal} 天陪跑`;
}

export function formatAttentionTierLabel(tier: string | null | undefined): string {
  if (!tier) return "—";
  return UI_ATTENTION_TIER_LABELS[tier] ?? "狀態更新中";
}

export function formatInterventionSuggestionLabel(level: string | null | undefined): string {
  if (level === "coach_attention") return "建議今天關心";
  if (level === "watch") return "持續觀察";
  if (level === "normal") return "維持目前節奏";
  return "—";
}

/**
 * Drop raw enums / snake_case / UUID from coach-facing evidence lines.
 * Prefer Chinese lines; map known codes; otherwise omit.
 */
export function sanitizeCoachFacingEvidenceLines(lines: string[] | null | undefined): string[] {
  if (!lines?.length) return [];
  const mapped = mapGrowthWhyEvidenceToZh(lines);
  if (mapped.length > 0) return mapped;
  return lines
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(line)) {
        return false;
      }
      if (/^[a-z0-9_]+(=|:)/i.test(line)) return false;
      if (/^[a-z]+_[a-z0-9_]+$/i.test(line)) return false;
      return /[\u4e00-\u9fff]/.test(line);
    });
}

export const GROWTH_UI_LABELS = {
  sectionTitle: "成果與分享機會",
  suitableQuestion: "現在適不適合談？",
  measuredOutcome: "量測成果",
  perceivedOutcome: "顧客自覺改變",
  coachHelpfulness: "教練幫助程度",
  experienceSatisfaction: "整體體驗",
  recommendationWillingness: "推薦意願",
  mostFeltChange: "最有感的改變",
  primaryPath: "建議主路徑",
  whyTitle: "判斷依據",
  decline: "顧客婉拒",
  inviteCheckinHint: "建議先邀請顧客做「陪跑小回顧」，再決定是否談分享／轉介紹。",
  expandDetails: "查看詳細判斷",
  collapseDetails: "收合詳細判斷",
  summarySuitable: "現在適合談",
  summaryContinue: "先持續陪跑",
  summaryNotSuitable: "現在不適合談",
  summaryNotEnoughData: "資料還不足，等待下一次量測",
} as const;

export function formatOutcomeStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (UI_OUTCOME_STATUS_LABELS as Record<string, string>)[status] ?? "狀態更新中";
}

export function formatMeasurementStageLabel(stage: string | null | undefined): string {
  if (!stage) return "—";
  return (UI_MEASUREMENT_STAGE_LABELS as Record<string, string>)[stage] ?? "量測階段更新中";
}

export function formatTrendStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return (UI_TREND_STATUS_LABELS as Record<string, string>)[status] ?? "趨勢更新中";
}

export function formatOutcomeBandLabel(band: string | null | undefined): string {
  if (!band) return "—";
  return bandLabel(band);
}

export function formatExperienceBandLabel(band: string | null | undefined): string {
  if (!band) return "—";
  return bandLabel(band);
}

export function formatGrowthPathLabel(path: string | null | undefined): string {
  return growthPathLabel(path ?? null);
}

export function formatReadinessHeadline(readiness: string | null | undefined): string {
  if (!readiness) return GROWTH_UI_LABELS.summaryNotSuitable;
  return readinessLabel(readiness);
}

/** 5–10 秒摘要：適合談 / 先持續陪跑 / 資料不足 / 現在不適合談 */
export function formatGrowthSummaryTone(input: {
  suitableNow: boolean;
  readiness?: string | null;
  inviteCheckin?: boolean;
  repairExperience?: boolean;
  measurementStage?: string | null;
  outcomeStatus?: string | null;
}): string {
  const share = resolveShareReadiness({
    suitableNow: input.suitableNow,
    readiness: input.readiness,
    inviteCheckin: input.inviteCheckin,
    repairExperience: input.repairExperience,
    measurementStage: input.measurementStage,
    outcomeStatus: input.outcomeStatus,
  });
  if (share === "NOT_ENOUGH_DATA") return GROWTH_UI_LABELS.summaryNotEnoughData;
  if (share === "READY") return GROWTH_UI_LABELS.summarySuitable;
  if (share === "POSSIBLE_SIGNAL") return GROWTH_UI_LABELS.summaryContinue;
  return GROWTH_UI_LABELS.summaryNotSuitable;
}

export function formatMeasuredOutcomeDisplay(input: {
  outcomeStatus: string;
  outcomeBand: string;
}): string {
  return `${formatOutcomeStatusLabel(input.outcomeStatus)}（${formatOutcomeBandLabel(input.outcomeBand)}）`;
}

const BLOCK_REASON_LABELS: Record<string, string> = {
  rescue_active: "目前以陪跑救援為優先",
  struggle_active: "顧客目前較辛苦，先陪伴",
  ask_recent: "最近剛談過分享／轉介紹",
  declined_recent: "顧客近期婉拒過",
  cooldown_active: "還在等待再次詢問的合適時機",
  outcome_not_ready: "量測成果尚不足以談分享",
  experience_not_ready: "體驗回饋尚不足以談分享",
};

const EXPERIENCE_BAND_EVIDENCE: Record<string, string> = {
  high: "顧客體驗回饋偏高",
  mid: "顧客體驗回饋中等",
  low: "顧客體驗回饋偏低",
  struggle: "顧客目前感受卡住或低落",
  unknown: "尚無顧客體驗回饋",
};

/**
 * Deterministic mapper: engine whyEvidence / block codes → 繁中判斷依據.
 * Never AI-translated. Drops UUID / fingerprint / snake_case dumps.
 */
export function mapGrowthWhyEvidenceToZh(lines: string[] | null | undefined): string[] {
  if (!lines?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const measured = line.match(/^measured_outcome=([^/]+)\/([^→]+)→(.+)$/);
    if (measured) {
      push(
        `量測成果：${formatOutcomeStatusLabel(measured[1])}；${formatMeasurementStageLabel(measured[2])}（${formatOutcomeBandLabel(measured[3])}）`,
      );
      continue;
    }

    const experience = line.match(/^experience=([a-z_]+)(?:\(checkin:[^)]+\))?$/i);
    if (experience) {
      push(EXPERIENCE_BAND_EVIDENCE[experience[1]] ?? `體驗判斷：${formatExperienceBandLabel(experience[1])}`);
      continue;
    }

    const scales = line.match(
      /^scales:\s*perception=([^\s]+)\s+helpfulness=([^\s]+)\s+satisfaction=([^\s]+)\s+willingness=([^\s]+)/i,
    );
    if (scales) {
      const fmt = (v: string) => (v === "—" || v === "null" || v === "undefined" ? "尚未回饋" : v);
      push(
        `回饋分數：自覺改變 ${fmt(scales[1])}／5、教練幫助 ${fmt(scales[2])}／5、整體體驗 ${fmt(scales[3])}／5、推薦意願 ${fmt(scales[4])}／10`,
      );
      continue;
    }

    if (line.startsWith("felt_change=")) {
      const text = line.slice("felt_change=".length).trim();
      if (text) push(`最有感的改變：${text}`);
      continue;
    }

    if (line.startsWith("heuristic=")) {
      push("另有顧客確認的體驗訊號（非正式 check-in）");
      continue;
    }

    if (line === "repair_experience_required") {
      push("量測不錯，但體驗偏低——請先修復信任與期待");
      continue;
    }

    if (line === "invite_checkin_before_strong") {
      push("建議先完成「陪跑小回顧」再談分享");
      continue;
    }

    if (line.startsWith("primary_path=")) {
      const path = line.slice("primary_path=".length);
      push(`建議主路徑：${formatGrowthPathLabel(path)}`);
      continue;
    }

    if (line.startsWith("blocks=")) {
      const codes = line
        .slice("blocks=".length)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      for (const code of codes) {
        push(BLOCK_REASON_LABELS[code] ?? "目前暫不建議談分享／轉介紹");
      }
      continue;
    }

    // Drop raw UUID / fingerprint / unmapped debug dumps.
    if (
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(line) ||
      line.includes("=") ||
      /fingerprint|snake|debug/i.test(line)
    ) {
      continue;
    }

    // Already human Chinese lines (pass through).
    if (/[\u4e00-\u9fff]/.test(line)) {
      push(line);
    }
  }

  return out;
}
