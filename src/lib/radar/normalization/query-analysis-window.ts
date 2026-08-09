import { ANALYSIS_WINDOW_DAYS } from "./constants";
import type { NormalizedContentItem } from "./schema";

export type AnalysisWindow = {
  window_start_at: string;
  window_end_at: string;
  analysis_window_days: typeof ANALYSIS_WINDOW_DAYS;
};

export function buildAnalysisWindow(referenceDate: Date = new Date()): AnalysisWindow {
  const window_end_at = referenceDate.toISOString();
  const start = new Date(referenceDate);
  start.setUTCDate(start.getUTCDate() - ANALYSIS_WINDOW_DAYS);
  return {
    analysis_window_days: ANALYSIS_WINDOW_DAYS,
    window_start_at: start.toISOString(),
    window_end_at,
  };
}

export function isWithinAnalysisWindow(
  published_at: string,
  window: AnalysisWindow,
): boolean {
  const ts = new Date(published_at).getTime();
  const start = new Date(window.window_start_at).getTime();
  const end = new Date(window.window_end_at).getTime();
  return ts >= start && ts <= end;
}

export function queryAnalysisWindow(
  items: NormalizedContentItem[],
  window: AnalysisWindow,
): NormalizedContentItem[] {
  return items.filter((item) => isWithinAnalysisWindow(item.published_at, window));
}

export function queryAnalyzableInWindow(
  items: NormalizedContentItem[],
  window: AnalysisWindow,
): NormalizedContentItem[] {
  return queryAnalysisWindow(items, window).filter(
    (item) => item.is_analyzable && item.duplicate_of === null,
  );
}
