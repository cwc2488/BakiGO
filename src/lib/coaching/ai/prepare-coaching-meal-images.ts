import {
  COACHING_AI_MEAL_IMAGE_FETCH_CONCURRENCY,
} from "@/lib/coaching/ai/coaching-meal-photo-constants";
import {
  downloadCoachingMealPhotoFromStorage,
  processCoachingMealImageForModel,
  type ProcessedCoachingMealImage,
} from "@/lib/coaching/ai/coaching-meal-image-processor";
import {
  buildGenerationMealPhotoRefs,
  extractCoachingMealPhotoCandidates,
  selectCoachingPhotosForGeneration,
  type CoachingMealPhotoCandidate,
} from "@/lib/coaching/ai/select-coaching-photos-for-generation";
import { validateCoachingMealPhotoPath } from "@/lib/coaching/ai/validate-coaching-meal-photo-path";
import type {
  CoachingMealImageUsageMetadata,
  FailedCoachingMealImage,
  PreparedCoachingMealImage,
} from "@/types/coaching-ai";
import type { CoachingDailyLogDetail, PrimaryMealSlot } from "@/types/coaching";

export type PrepareCoachingMealImagesResult = {
  prepared: PreparedCoachingMealImage[];
  failed: FailedCoachingMealImage[];
  telemetry: CoachingMealImageUsageMetadata;
};

type PrepareCoachingMealImagesDeps = {
  download?: (storagePath: string) => Promise<Buffer>;
  process?: (buffer: Buffer) => Promise<ProcessedCoachingMealImage>;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

function buildTelemetry(input: {
  prepared: PreparedCoachingMealImage[];
  failed: FailedCoachingMealImage[];
  selectedCount: number;
}): CoachingMealImageUsageMetadata {
  const images = input.prepared.map((image) => ({
    mealSlot: image.mealSlot,
    sourceStoragePath: image.sourceStoragePath,
    originalWidth: image.originalWidth,
    originalHeight: image.originalHeight,
    originalByteLength: image.originalByteLength,
    processedWidth: image.width,
    processedHeight: image.height,
    processedByteLength: image.byteLength,
  }));

  return {
    selectedImageCount: input.selectedCount,
    originalTotalBytes: images.reduce((sum, item) => sum + item.originalByteLength, 0),
    processedTotalBytes: images.reduce((sum, item) => sum + item.processedByteLength, 0),
    failedImageCount: input.failed.length,
    images,
  };
}

export async function prepareCoachingMealImagesForGeneration(input: {
  customerId: string;
  enrollmentId: string;
  logDate: string;
  todayLog: CoachingDailyLogDetail;
  candidates?: CoachingMealPhotoCandidate[];
  deps?: PrepareCoachingMealImagesDeps;
}): Promise<PrepareCoachingMealImagesResult> {
  const download = input.deps?.download ?? downloadCoachingMealPhotoFromStorage;
  const process = input.deps?.process ?? processCoachingMealImageForModel;

  const candidates = input.candidates ?? extractCoachingMealPhotoCandidates(input.todayLog);
  const selections = selectCoachingPhotosForGeneration(candidates).filter((item) => item.storagePath);

  const prepared: PreparedCoachingMealImage[] = [];
  const failed: FailedCoachingMealImage[] = [];

  const outcomes = await mapWithConcurrency(
    selections,
    COACHING_AI_MEAL_IMAGE_FETCH_CONCURRENCY,
    async (selection) => {
      const mealSlot = selection.mealSlot as PrimaryMealSlot;
      const storagePath = selection.storagePath!;

      const validation = validateCoachingMealPhotoPath({
        storagePath,
        customerId: input.customerId,
        enrollmentId: input.enrollmentId,
        logDate: input.logDate,
        mealSlot,
      });

      if (!validation.valid) {
        return {
          ok: false as const,
          failed: {
            mealSlot,
            sourceStoragePath: storagePath,
            errorCode: validation.reason,
            errorMessage: validation.reason,
          },
        };
      }

      try {
        const rawBuffer = await download(storagePath);
        const processed = await process(rawBuffer);
        return {
          ok: true as const,
          prepared: {
            mealSlot,
            sourceStoragePath: storagePath,
            mimeType: processed.mimeType,
            width: processed.width,
            height: processed.height,
            byteLength: processed.byteLength,
            buffer: processed.buffer,
            originalWidth: processed.originalWidth,
            originalHeight: processed.originalHeight,
            originalByteLength: processed.originalByteLength,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "meal_photo_prepare_failed";
        return {
          ok: false as const,
          failed: {
            mealSlot,
            sourceStoragePath: storagePath,
            errorCode: "prepare_failed",
            errorMessage: message,
          },
        };
      }
    },
  );

  for (const outcome of outcomes) {
    if (outcome.ok) {
      prepared.push(outcome.prepared);
    } else {
      failed.push(outcome.failed);
    }
  }

  prepared.sort((left, right) => left.mealSlot.localeCompare(right.mealSlot));

  return {
    prepared,
    failed,
    telemetry: buildTelemetry({
      prepared,
      failed,
      selectedCount: selections.length,
    }),
  };
}

export function buildCoachingMealImageUsageMetadataForLlmLog(
  telemetry: CoachingMealImageUsageMetadata,
): CoachingMealImageUsageMetadata {
  return telemetry;
}

export { buildGenerationMealPhotoRefs, extractCoachingMealPhotoCandidates, selectCoachingPhotosForGeneration };
