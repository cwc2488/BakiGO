import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  portraitSlotsForMaster,
  verifyRecognitionSlideGeometry,
} from "@/lib/recognition/recognition-presentation-geometry";
import { recognitionFrameAbsolutePath } from "@/lib/recognition/recognition-presentation-assets";
import {
  fitRecognitionTitleInBox,
  titleGeometryForMaster,
} from "@/lib/recognition/recognition-presentation-master-layout";

describe("Recognition presentation geometry lock", () => {
  it("keeps per-master titles off reserved crown and decorative zones", () => {
    const cases: Array<{ masterId: "name-only" | "hero-1" | "hero-2-3" | "wall-4-12" | "million-lifetime"; count: number }> = [
      { masterId: "name-only", count: 3 },
      { masterId: "hero-1", count: 1 },
      { masterId: "hero-2-3", count: 2 },
      { masterId: "hero-2-3", count: 3 },
      { masterId: "wall-4-12", count: 12 },
      { masterId: "million-lifetime", count: 1 },
    ];
    for (const item of cases) {
      const issues = verifyRecognitionSlideGeometry({
        masterId: item.masterId,
        title: titleGeometryForMaster(item.masterId),
        slots: portraitSlotsForMaster(item.masterId, item.count),
        expectedPortraitCount: item.masterId === "name-only" ? 0 : item.count,
      });
      expect(issues, `${item.masterId} x${item.count}: ${issues.map((issue) => issue.message).join("; ")}`).toEqual([]);
    }
  });

  it("shrinks long titles inside the locked box instead of moving the box", () => {
    const wall = titleGeometryForMaster("wall-4-12");
    const fitted = fitRecognitionTitleInBox("萬點高手", wall);
    expect(fitted.fontSizePt).toBeLessThanOrEqual(wall.maxFontPt);
    expect(fitted.fontSizePt).toBeGreaterThanOrEqual(wall.minFontPt);
    const long = fitRecognitionTitleInBox("MAP 第三個月（MAP 第三個月過關）", titleGeometryForMaster("hero-1"));
    expect(long.fontSizePt).toBeLessThan(titleGeometryForMaster("hero-1").maxFontPt);
  });

  it("keeps extracted frame interiors transparent so photos sit behind gold", async () => {
    const sprite = sharp(recognitionFrameAbsolutePath("hero-portrait-frame"));
    const { data, info } = await sprite.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cx = Math.floor(info.width / 2);
    const cy = Math.floor(info.height / 2);
    const alpha = data[(cy * info.width + cx) * info.channels + 3];
    expect(alpha).toBe(0);
  });
});
