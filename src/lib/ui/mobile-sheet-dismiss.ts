/** Default drag distance (px) before a mobile bottom sheet dismisses. */
export const MOBILE_SHEET_DISMISS_THRESHOLD_PX = 96;

export type SheetDismissReleaseAction = "close" | "snap_back" | "ignore";

/**
 * Dismiss drag is only allowed when the sheet's scrollable content is at the top.
 * While scrolled (scrollTop > 0), vertical gestures must scroll content, not close.
 */
export function canStartSheetDismissDrag(scrollTop: number): boolean {
  return scrollTop <= 0;
}

/**
 * Pure release decision for a tracked downward dismiss drag.
 * Positive offsetY means the sheet was pulled down.
 */
export function resolveSheetDismissRelease(options: {
  offsetY: number;
  thresholdPx?: number;
  wasTracking: boolean;
}): SheetDismissReleaseAction {
  const { offsetY, wasTracking, thresholdPx = MOBILE_SHEET_DISMISS_THRESHOLD_PX } = options;
  if (!wasTracking) {
    return "ignore";
  }
  if (offsetY >= thresholdPx) {
    return "close";
  }
  return "snap_back";
}

/** Clamp drag offset so the sheet never moves upward past its rest position. */
export function clampSheetDismissOffset(offsetY: number): number {
  if (!Number.isFinite(offsetY) || offsetY < 0) {
    return 0;
  }
  return offsetY;
}
