/**
 * Historical Vision evidence must never masquerade as current-image evidence.
 *
 * Production may contain corrupted summaries (e.g. cat photo stored as
 * 「今天是會議午餐吃飯糰」). Tolerate them as history; do not let them
 * replace fresh current-turn observation.
 */

export type Go21HistoricalVisionRow = {
  summary: string;
  correction: string | null;
  createdAt?: string;
  /** When known from turn metadata. Missing on legacy rows. */
  foodRelevant?: boolean | null;
};

const NON_FOOD_SUMMARY = /非餐點|不是餐點|可見：貓|可見：狗|可見：寵物|風景|自拍/;

/**
 * Structured Vision summaries look like: 「午餐｜可見：…」or 「非餐點｜…」.
 * Corrupted Production rows often store raw meal notes instead.
 */
export function go21VisionSummaryLooksStructured(summary: string): boolean {
  const s = summary.trim();
  if (!s) return false;
  if (/^非餐點/.test(s)) return true;
  if (/^(早餐|午餐|晚餐|餐別未確認|snacks)/.test(s) && /可見：|信心：|不確定：/.test(s)) {
    return true;
  }
  return false;
}

/**
 * Select prior vision rows safe to pass as HISTORICAL context only.
 * Excludes non-food and corrupted meal-note masquerading as vision.
 */
export function selectGo21HistoricalVisionForGeneration(input: {
  prior: Go21HistoricalVisionRow[];
  /** When current turn is a photo, be stricter about contaminated history. */
  currentTurnHasPhoto: boolean;
  currentTurnNonFood: boolean;
}): Array<{ summary: string; correction: string | null; scope: "historical" }> {
  const out: Array<{ summary: string; correction: string | null; scope: "historical" }> = [];

  for (const row of input.prior) {
    const raw = (row.correction?.trim() || row.summary?.trim() || "").trim();
    if (!raw) continue;

    if (row.foodRelevant === false) continue;
    if (NON_FOOD_SUMMARY.test(raw)) continue;

    // Legacy corrupted: meal-note text without vision structure.
    // Never feed as image evidence — especially next to a fresh photo turn.
    if (!go21VisionSummaryLooksStructured(raw)) {
      if (input.currentTurnHasPhoto || input.currentTurnNonFood) continue;
      // Text-only turns may still recall prior meals via today.meals / timeline;
      // skip unstructured "vision" rows to avoid double-counting corruption.
      continue;
    }

    if (row.foodRelevant !== true && input.currentTurnHasPhoto) {
      // Unknown foodRelevant + photo turn: only keep clearly structured food rows.
      if (!/可見：/.test(raw) || NON_FOOD_SUMMARY.test(raw)) continue;
    }

    out.push({
      summary: `[歷史影像｜非本回合] ${raw}`,
      correction: row.correction,
      scope: "historical",
    });
    if (out.length >= 3) break;
  }

  return out;
}
