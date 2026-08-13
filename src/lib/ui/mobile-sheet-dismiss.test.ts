import { describe, expect, it } from "vitest";
import {
  MOBILE_SHEET_DISMISS_THRESHOLD_PX,
  canStartSheetDismissDrag,
  clampSheetDismissOffset,
  resolveSheetDismissRelease,
} from "@/lib/ui/mobile-sheet-dismiss";

describe("mobile-sheet-dismiss", () => {
  it("blocks dismiss drag when content is scrolled", () => {
    expect(canStartSheetDismissDrag(0)).toBe(true);
    expect(canStartSheetDismissDrag(-1)).toBe(true);
    expect(canStartSheetDismissDrag(1)).toBe(false);
    expect(canStartSheetDismissDrag(40)).toBe(false);
  });

  it("closes only past threshold after a tracked drag", () => {
    expect(
      resolveSheetDismissRelease({
        offsetY: MOBILE_SHEET_DISMISS_THRESHOLD_PX,
        wasTracking: true,
      }),
    ).toBe("close");
    expect(
      resolveSheetDismissRelease({
        offsetY: MOBILE_SHEET_DISMISS_THRESHOLD_PX - 1,
        wasTracking: true,
      }),
    ).toBe("snap_back");
    expect(
      resolveSheetDismissRelease({
        offsetY: 200,
        wasTracking: false,
      }),
    ).toBe("ignore");
  });

  it("clamps upward drag to rest position", () => {
    expect(clampSheetDismissOffset(-12)).toBe(0);
    expect(clampSheetDismissOffset(48)).toBe(48);
    expect(clampSheetDismissOffset(Number.NaN)).toBe(0);
  });
});
