import { describe, expect, it } from "vitest";
import {
  assertNoBase64InPersistedPayload,
  encodePreparedCoachingMealImageAsBase64,
  processCoachingMealImageForModel,
} from "@/lib/coaching/ai/coaching-meal-image-processor";
import {
  COACHING_AI_MAX_IMAGES_PER_MEAL,
  COACHING_AI_MAX_MEAL_IMAGES_PER_DAY,
  COACHING_AI_MEAL_IMAGE_MAX_LONG_EDGE,
} from "@/lib/coaching/ai/coaching-meal-photo-constants";
import { prepareCoachingMealImagesForGeneration } from "@/lib/coaching/ai/prepare-coaching-meal-images";
import {
  extractCoachingMealPhotoCandidates,
  selectCoachingPhotosForGeneration,
} from "@/lib/coaching/ai/select-coaching-photos-for-generation";
import {
  parseCoachingMealPhotoPath,
  validateCoachingMealPhotoPath,
} from "@/lib/coaching/ai/validate-coaching-meal-photo-path";
import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";

const CUSTOMER_ID = "cust-1";
const ENROLLMENT_ID = "enroll-1";
const LOG_DATE = "2026-08-11";

function photoPath(mealSlot: string, photoId: string): string {
  return `${CUSTOMER_ID}/${ENROLLMENT_ID}/${LOG_DATE}/${mealSlot}/${photoId}.jpg`;
}

function enrollment(): CoachingEnrollment {
  return {
    id: ENROLLMENT_ID,
    customerId: CUSTOMER_ID,
    ownerMemberId: "member-1",
    goal: "健康減脂",
    status: "active",
    startedAt: "2026-07-28T00:00:00.000Z",
    endedAt: null,
    onboardingCompletedAt: null,
    planSnapshot: cloneDefaultCoachingPlanSnapshot(),
    baselineBodyRecordId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function dailyLog(overrides?: Partial<CoachingDailyLogDetail>): CoachingDailyLogDetail {
  return {
    id: "log-1",
    enrollmentId: ENROLLMENT_ID,
    customerId: CUSTOMER_ID,
    ownerMemberId: "member-1",
    logDate: LOG_DATE,
    waterMl: 1500,
    exerciseNote: null,
    bowelMovementCount: null,
    sleepDuration: null,
    sleepBedtime: null,
    sleepWakeTime: null,
    customerNote: null,
    submittedAt: `${LOG_DATE}T10:00:00.000Z`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    meals: [],
    ...overrides,
  };
}

describe("selectCoachingPhotosForGeneration", () => {
  it("selects at most one photo per primary meal and three per day", () => {
    const selections = selectCoachingPhotosForGeneration([
      { mealSlot: "breakfast", storagePath: photoPath("breakfast", "a"), uploadedAt: "2026-08-11T08:00:00.000Z" },
      { mealSlot: "breakfast", storagePath: photoPath("breakfast", "b"), uploadedAt: "2026-08-11T09:00:00.000Z" },
      { mealSlot: "lunch", storagePath: photoPath("lunch", "a"), uploadedAt: "2026-08-11T12:00:00.000Z" },
      { mealSlot: "dinner", storagePath: photoPath("dinner", "a"), uploadedAt: "2026-08-11T18:00:00.000Z" },
    ]);

    expect(selections).toHaveLength(3);
    expect(selections.find((item) => item.mealSlot === "breakfast")?.storagePath).toBe(photoPath("breakfast", "b"));
    expect(selections.filter((item) => item.storagePath)).toHaveLength(COACHING_AI_MAX_MEAL_IMAGES_PER_DAY);
    expect(COACHING_AI_MAX_IMAGES_PER_MEAL).toBe(1);
  });

  it("picks the latest upload when the same meal has multiple photos", () => {
    const selections = selectCoachingPhotosForGeneration([
      { mealSlot: "lunch", storagePath: photoPath("lunch", "old"), uploadedAt: "2026-08-11T08:00:00.000Z" },
      { mealSlot: "lunch", storagePath: photoPath("lunch", "new"), uploadedAt: "2026-08-11T12:00:00.000Z" },
      { mealSlot: "lunch", storagePath: photoPath("lunch", "unused"), uploadedAt: "2026-08-11T07:00:00.000Z" },
    ]);

    expect(selections.find((item) => item.mealSlot === "lunch")?.storagePath).toBe(photoPath("lunch", "new"));
  });

  it("does not select secondary meal photos", () => {
    const log = dailyLog({
      meals: [
        {
          id: "snack-1",
          dailyLogId: "log-1",
          mealSlot: "snacks",
          textNote: "堅果",
          eatenAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          photo: {
            id: "photo-snack",
            mealEntryId: "snack-1",
            storagePath: photoPath("snacks", "secret"),
            uploadedAt: "2026-08-11T10:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    });

    expect(extractCoachingMealPhotoCandidates(log)).toEqual([]);
  });
});

describe("validateCoachingMealPhotoPath", () => {
  it("accepts owned primary-meal paths", () => {
    const path = photoPath("breakfast", "x");
    expect(parseCoachingMealPhotoPath(path)?.mealSlot).toBe("breakfast");
    expect(
      validateCoachingMealPhotoPath({
        storagePath: path,
        customerId: CUSTOMER_ID,
        enrollmentId: ENROLLMENT_ID,
        logDate: LOG_DATE,
        mealSlot: "breakfast",
      }).valid,
    ).toBe(true);
  });

  it("rejects arbitrary or mismatched storage paths", () => {
    expect(parseCoachingMealPhotoPath("https://evil.example/photo.jpg")).toBeNull();
    expect(parseCoachingMealPhotoPath("../secret.jpg")).toBeNull();
    expect(
      validateCoachingMealPhotoPath({
        storagePath: photoPath("breakfast", "x"),
        customerId: "other-customer",
        enrollmentId: ENROLLMENT_ID,
        logDate: LOG_DATE,
      }),
    ).toEqual({ valid: false, reason: "customer_mismatch" });
    expect(parseCoachingMealPhotoPath(`${CUSTOMER_ID}/${ENROLLMENT_ID}/${LOG_DATE}/snacks/x.jpg`)).toBeNull();
  });
});

describe("prepareCoachingMealImagesForGeneration", () => {
  it("continues when one image fails and prepares the rest", async () => {
    const breakfastPath = photoPath("breakfast", "ok");
    const lunchPath = photoPath("lunch", "bad");

    const result = await prepareCoachingMealImagesForGeneration({
      customerId: CUSTOMER_ID,
      enrollmentId: ENROLLMENT_ID,
      logDate: LOG_DATE,
      todayLog: dailyLog(),
      candidates: [
        { mealSlot: "breakfast", storagePath: breakfastPath, uploadedAt: "2026-08-11T08:00:00.000Z" },
        { mealSlot: "lunch", storagePath: lunchPath, uploadedAt: "2026-08-11T12:00:00.000Z" },
      ],
      deps: {
        download: async (path) => {
          if (path === lunchPath) {
            throw new Error("download_failed");
          }
          return Buffer.from("fake-breakfast");
        },
        process: async (buffer) => ({
          buffer,
          mimeType: "image/jpeg" as const,
          width: 800,
          height: 600,
          byteLength: buffer.length,
          originalWidth: 1200,
          originalHeight: 900,
          originalByteLength: buffer.length + 100,
        }),
      },
    });

    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0]?.mealSlot).toBe("breakfast");
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.sourceStoragePath).toBe(lunchPath);
    expect(result.telemetry.selectedImageCount).toBe(2);
    expect(result.telemetry.failedImageCount).toBe(1);
    expect(result.telemetry.processedTotalBytes).toBeGreaterThan(0);
  });

  it("does not persist base64 in telemetry metadata", async () => {
    const result = await prepareCoachingMealImagesForGeneration({
      customerId: CUSTOMER_ID,
      enrollmentId: ENROLLMENT_ID,
      logDate: LOG_DATE,
      todayLog: dailyLog(),
      candidates: [
        { mealSlot: "dinner", storagePath: photoPath("dinner", "a"), uploadedAt: "2026-08-11T18:00:00.000Z" },
      ],
      deps: {
        download: async () => Buffer.from("fake-dinner"),
        process: async (buffer) => ({
          buffer,
          mimeType: "image/jpeg" as const,
          width: 640,
          height: 480,
          byteLength: buffer.length,
          originalWidth: 640,
          originalHeight: 480,
          originalByteLength: buffer.length,
        }),
      },
    });

    const serialized = JSON.stringify(result.telemetry);
    assertNoBase64InPersistedPayload(serialized);
    expect(serialized).not.toContain("buffer");
    expect(encodePreparedCoachingMealImageAsBase64(result.prepared[0]!)).toBeTruthy();
  });
});

describe("processCoachingMealImageForModel", () => {
  it("resizes image metadata for model-ready payload", async () => {
    const sharp = (await import("sharp")).default;
    const source = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 255, g: 120, b: 80 },
      },
    })
      .jpeg()
      .toBuffer();

    const processed = await processCoachingMealImageForModel(source);

    expect(processed.mimeType).toBe("image/jpeg");
    expect(Math.max(processed.width, processed.height)).toBeLessThanOrEqual(COACHING_AI_MEAL_IMAGE_MAX_LONG_EDGE);
    expect(processed.byteLength).toBeGreaterThan(0);
    expect(processed.originalByteLength).toBe(source.length);
  });
});

describe("generation fingerprint uses selected photos only", () => {
  it("ignores unused extra photos for the same meal", () => {
    const selectedCandidates = [
      { mealSlot: "breakfast" as const, storagePath: photoPath("breakfast", "new"), uploadedAt: "2026-08-11T09:00:00.000Z" },
      { mealSlot: "lunch" as const, storagePath: photoPath("lunch", "a"), uploadedAt: "2026-08-11T12:00:00.000Z" },
    ];
    const withUnused = [
      ...selectedCandidates,
      { mealSlot: "breakfast" as const, storagePath: photoPath("breakfast", "old"), uploadedAt: "2026-08-11T07:00:00.000Z" },
    ];

    const baseInput = buildCoachingGenerationInput({
      enrollment: enrollment(),
      customer: { displayName: "Amy" },
      logDate: LOG_DATE,
      todayLog: dailyLog(),
      recentLogs: [dailyLog()],
      bodyRecords: [],
      photoCandidates: selectedCandidates,
    });
    const withExtraInput = buildCoachingGenerationInput({
      enrollment: enrollment(),
      customer: { displayName: "Amy" },
      logDate: LOG_DATE,
      todayLog: dailyLog(),
      recentLogs: [dailyLog()],
      bodyRecords: [],
      photoCandidates: withUnused,
    });

    expect(fingerprintCoachingGenerationInput(baseInput)).toBe(
      fingerprintCoachingGenerationInput(withExtraInput),
    );
    expect(baseInput.todayContext.primaryMeals.find((item) => item.mealSlot === "breakfast")?.storagePath).toBe(
      photoPath("breakfast", "new"),
    );
  });
});
