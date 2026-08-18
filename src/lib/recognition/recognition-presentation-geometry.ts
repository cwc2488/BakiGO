import type { RecognitionMasterId } from "@/lib/recognition/recognition-presentation-assets";
import {
  hero1PortraitSlot,
  hero2PortraitSlots,
  hero3PortraitSlots,
  millionPortraitSlots,
  slideBoxContains,
  slideBoxesIntersect,
  titleGeometryForMaster,
  wallPortraitSlots,
  type RecognitionPortraitSlot,
  type RecognitionSlideBox,
} from "@/lib/recognition/recognition-presentation-master-layout";

export type RecognitionReservedZone = {
  id: string;
  box: RecognitionSlideBox;
};

/**
 * Decorative artwork that titles must not cover. Measured from the approved
 * masters. Wall/hero-1 gaps are physically tight; boxes still stay off the art.
 */
export const RECOGNITION_RESERVED_ZONES: Record<RecognitionMasterId, readonly RecognitionReservedZone[]> = {
  "name-only": [
    { id: "crown", box: { x: 4.4, y: 0.42, w: 1.2, h: 0.6 } },
    { id: "center-ornament", box: { x: 4.7, y: 0.96, w: 0.6, h: 0.12 } },
    { id: "gold-line", box: { x: 2.3, y: 1.55, w: 5.4, h: 0.05 } },
    { id: "laurel-left", box: { x: 2.2, y: 0.7, w: 0.35, h: 0.85 } },
    { id: "laurel-right", box: { x: 7.45, y: 0.7, w: 0.35, h: 0.85 } },
  ],
  "hero-1": [
    { id: "crown", box: { x: 4.45, y: 0.32, w: 1.1, h: 0.78 } },
    { id: "center-ornament", box: { x: 4.78, y: 1.28, w: 0.44, h: 0.08 } },
    { id: "gold-line", box: { x: 2.7, y: 1.31, w: 4.6, h: 0.05 } },
    { id: "laurel-left", box: { x: 2.4, y: 0.7, w: 0.5, h: 0.72 } },
    { id: "laurel-right", box: { x: 7.1, y: 0.7, w: 0.5, h: 0.72 } },
    { id: "frame", box: { x: 3.44, y: 1.78, w: 3.12, h: 4.35 } },
  ],
  "hero-2-3": [
    { id: "crown", box: { x: 4.5, y: 0.5, w: 1.0, h: 0.62 } },
    { id: "center-ornament", box: { x: 4.78, y: 1.44, w: 0.44, h: 0.08 } },
    { id: "gold-line", box: { x: 2.65, y: 1.45, w: 4.7, h: 0.05 } },
    { id: "laurel-left", box: { x: 2.55, y: 0.85, w: 0.5, h: 0.7 } },
    { id: "laurel-right", box: { x: 6.95, y: 0.85, w: 0.5, h: 0.7 } },
  ],
  "wall-4-12": [
    { id: "crown", box: { x: 4.25, y: 0.38, w: 1.5, h: 0.9 } },
    { id: "center-ornament", box: { x: 4.82, y: 1.46, w: 0.36, h: 0.07 } },
    { id: "gold-line", box: { x: 2.7, y: 1.47, w: 4.6, h: 0.05 } },
    { id: "laurel-left", box: { x: 2.65, y: 0.7, w: 0.4, h: 0.75 } },
    { id: "laurel-right", box: { x: 6.95, y: 0.7, w: 0.4, h: 0.75 } },
    { id: "first-row", box: { x: 0.82, y: 1.86, w: 8.36, h: 1.78 } },
  ],
  "million-lifetime": [
    { id: "crown", box: { x: 4.35, y: 0.44, w: 1.3, h: 1.18 } },
    { id: "center-ornament", box: { x: 3.2, y: 1.12, w: 3.6, h: 0.5 } },
  ],
};

export type RecognitionGeometryVerification = {
  masterId: RecognitionMasterId;
  title: RecognitionSlideBox;
  slots: RecognitionPortraitSlot[];
  expectedPortraitCount: number;
};

export type RecognitionGeometryIssue = {
  code: string;
  message: string;
};

export function portraitSlotsForMaster(
  masterId: RecognitionMasterId,
  recipientCount: number,
): RecognitionPortraitSlot[] {
  if (masterId === "name-only") return [];
  if (masterId === "hero-1") return [hero1PortraitSlot()];
  if (masterId === "hero-2-3") {
    return recipientCount === 2 ? hero2PortraitSlots() : hero3PortraitSlots();
  }
  if (masterId === "million-lifetime") return millionPortraitSlots(recipientCount);
  return wallPortraitSlots().slice(0, recipientCount);
}

export function verifyRecognitionSlideGeometry(
  input: RecognitionGeometryVerification,
): RecognitionGeometryIssue[] {
  const issues: RecognitionGeometryIssue[] = [];
  const title = input.title;
  const locked = titleGeometryForMaster(input.masterId);
  if (
    Math.abs(title.x - locked.x) > 0.0001
    || Math.abs(title.y - locked.y) > 0.0001
    || Math.abs(title.w - locked.w) > 0.0001
    || Math.abs(title.h - locked.h) > 0.0001
  ) {
    issues.push({
      code: "title-box-moved",
      message: `${input.masterId} title box does not match the locked per-master geometry`,
    });
  }

  for (const zone of RECOGNITION_RESERVED_ZONES[input.masterId]) {
    if (slideBoxesIntersect(title, zone.box)) {
      issues.push({
        code: "title-intersects-reserved",
        message: `${input.masterId} title intersects ${zone.id}`,
      });
    }
  }

  if (input.slots.length !== input.expectedPortraitCount) {
    issues.push({
      code: "portrait-count",
      message: `expected ${input.expectedPortraitCount} portraits, got ${input.slots.length}`,
    });
  }

  input.slots.forEach((slot, index) => {
    if (!slideBoxContains(slot.inner, slot.photo)) {
      issues.push({
        code: "photo-outside-inner",
        message: `portrait ${index + 1} is not inside the gold-frame inner bounds`,
      });
    }
    if (slideBoxesIntersect(slot.name, slot.photo)) {
      issues.push({
        code: "name-intersects-photo",
        message: `name ${index + 1} intersects its photo`,
      });
    }
    if (slideBoxesIntersect(slot.name, slot.inner)) {
      issues.push({
        code: "name-intersects-frame",
        message: `name ${index + 1} intersects its portrait inner frame`,
      });
    }
    if (slideBoxesIntersect(title, slot.photo) || slideBoxesIntersect(title, slot.inner)) {
      issues.push({
        code: "title-intersects-portrait",
        message: `title intersects portrait ${index + 1}`,
      });
    }
  });

  if (input.expectedPortraitCount === 2 && input.slots.length === 2) {
    const left = input.slots[0]!;
    const right = input.slots[1]!;
    if (Math.abs(left.photo.y - right.photo.y) > 0.001) {
      issues.push({ code: "pair-y", message: "2-person portraits are not on the same Y" });
    }
    if (Math.abs(left.photo.w - right.photo.w) > 0.001 || Math.abs(left.photo.h - right.photo.h) > 0.001) {
      issues.push({ code: "pair-size", message: "2-person portraits are not equal size" });
    }
    const leftGap = left.overlay.x;
    const rightGap = 10 - (right.overlay.x + right.overlay.w);
    if (Math.abs(leftGap - rightGap) > 0.02) {
      issues.push({ code: "pair-center", message: "2-person pair is not centered on the slide" });
    }
  }

  return issues;
}
