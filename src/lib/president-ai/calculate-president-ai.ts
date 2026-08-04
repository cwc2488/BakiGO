import type { FocusMode, PresidentAIResult, Priority } from "@/types/president-ai";
import { DEFAULT_MISSION_RULES } from "@/lib/mission-engine/rules";
import type { PresidentAIInput } from "./types";
import { candidatesToPriorities, collectPriorityCandidates } from "./collect-candidates";
import { collectOpportunities, collectWarnings } from "./collect-insights";
import { resolveFocusModeFromCategory } from "./map-category";
import { sortCandidates } from "./score-priority";

function buildReasoning(
  topPriorities: Priority[],
  focusMode: FocusMode,
  warnings: ReturnType<typeof collectWarnings>,
): string[] {
  const reasoning: string[] = [];

  if (topPriorities.length > 0) {
    const top = topPriorities[0];
    reasoning.push(
      `今日最高優先：${top.title}（${top.category}，完成度 ${top.score}%）`,
    );
  }

  reasoning.push(`目前專注模式：${focusMode.label} — ${focusMode.reason}`);

  if (topPriorities.length > 1) {
    reasoning.push(
      `次要優先：${topPriorities
        .slice(1, 3)
        .map((item) => item.title)
        .join("、")}`,
    );
  }

  if (warnings.length > 0) {
    reasoning.push(`注意事項 ${warnings.length} 項 — 部分 KPI 尚未定義或需補資料`);
  }

  return reasoning;
}

function selectFocusMode(
  topPriority: Priority | null,
): FocusMode {
  if (!topPriority) {
    return {
      key: "Leadership Sprint",
      label: "Leadership Sprint",
      reason: "尚無可排序的優先事項，維持日常領導節奏",
    };
  }

  const key = resolveFocusModeFromCategory(topPriority.category, topPriority.sourceKey);

  return {
    key,
    label: key,
    reason: `依 ${topPriority.category} 類最高優先「${topPriority.title}」自動選定`,
  };
}

/**
 * President AI — decision layer above all Business Engines.
 * Reads computed metrics only; never recalculates KPIs or invents thresholds.
 */
export function calculatePresidentAI(
  input: PresidentAIInput,
  maxPriorities: number = DEFAULT_MISSION_RULES.dailyMissionSet.maxCount,
): PresidentAIResult {
  const rawCandidates = collectPriorityCandidates(input);
  const scored = sortCandidates(candidatesToPriorities(rawCandidates));

  const topPriorities: Priority[] = scored.slice(0, maxPriorities).map((candidate) => ({
    title: candidate.title,
    description: candidate.description,
    score: candidate.score,
    category: candidate.category,
    expectedImpact: candidate.remaining,
    sourceKey: candidate.sourceKey,
  }));

  const warnings = collectWarnings(input);
  const opportunities = collectOpportunities(input);
  const focusMode = selectFocusMode(topPriorities[0] ?? null);
  const reasoning = buildReasoning(topPriorities, focusMode, warnings);

  return {
    topPriorities,
    reasoning,
    warnings,
    opportunities,
    focusMode,
    computedAt: new Date().toISOString(),
  };
}
