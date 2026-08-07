import type { FocusMode, PresidentAIResult, Priority } from "@/types/president-ai";
import { DEFAULT_MISSION_RULES } from "@/lib/mission-engine/rules";
import type { PresidentAIInput, PriorityCandidate } from "./types";
import { candidatesToPriorities, collectPriorityCandidates } from "./collect-candidates";
import { collectOpportunities, collectWarnings } from "./collect-insights";
import { resolveFocusModeFromCategory } from "./map-category";
import { formatFocusModeLabel, formatPriorityCategoryLabel } from "./display-labels";
import { sortCandidates } from "./score-priority";

const HORIZON_ORDER = { short: 0, medium: 1, long: 2 } as const;

function buildReasoning(
  topPriorities: Priority[],
  focusMode: FocusMode,
  warnings: ReturnType<typeof collectWarnings>,
): string[] {
  const reasoning: string[] = [];

  if (topPriorities.length > 0) {
    const top = topPriorities[0];
    reasoning.push(
      `今日最高優先：${top.title}（${formatPriorityCategoryLabel(top.category)}，完成度 ${top.score}%）`,
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
      label: formatFocusModeLabel("Leadership Sprint"),
      reason: "尚無可排序的優先事項，維持日常領導節奏",
    };
  }

  const key = resolveFocusModeFromCategory(topPriority.category, topPriority.sourceKey);

  return {
    key,
    label: formatFocusModeLabel(key),
    reason: `依 ${formatPriorityCategoryLabel(topPriority.category)} 類最高優先「${topPriority.title}」自動選定`,
  };
}

function pickTodayPriority(
  scored: Array<PriorityCandidate & { score: number }>,
  input: PresidentAIInput,
): (PriorityCandidate & { score: number }) | null {
  if (scored.length === 0) {
    return null;
  }

  const incompleteGoals = input.memberGoals.filter((goal) => goal.remaining > 0);
  if (incompleteGoals.length > 0) {
    const prioritized = [...incompleteGoals].sort((left, right) => {
      const horizonDiff = HORIZON_ORDER[left.horizon] - HORIZON_ORDER[right.horizon];
      if (horizonDiff !== 0) {
        return horizonDiff;
      }
      if (left.progressPercent !== right.progressPercent) {
        return left.progressPercent - right.progressPercent;
      }
      return right.remaining - left.remaining;
    });
    const topGoal = prioritized[0];
    const matched = scored.find((item) => item.sourceKey === `member_goal_${topGoal.goalId}`);
    if (matched) {
      return matched;
    }
  }

  if (input.careerGoal && input.careerGoal.remaining > 0) {
    const matched =
      scored.find((item) => item.sourceKey === input.careerGoal!.sourceKey) ??
      scored.find(
        (item) => item.category === "PROMOTION" && item.sourceKey.startsWith("promotion_"),
      );
    if (matched) {
      return matched;
    }
  }

  return scored[0] ?? null;
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
  const todayPick = pickTodayPriority(scored, input);
  const ordered = todayPick
    ? [todayPick, ...scored.filter((item) => item.sourceKey !== todayPick.sourceKey)]
    : scored;

  const topPriorities: Priority[] = ordered.slice(0, maxPriorities).map((candidate) => ({
    title: candidate.title,
    description: candidate.description,
    score: candidate.score,
    category: candidate.category,
    expectedImpact: candidate.remaining,
    sourceKey: candidate.sourceKey,
    actionHref: candidate.actionHref,
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
