import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { processCoachingMealImageForModel } from "@/lib/coaching/ai/coaching-meal-image-processor";
import type { CoachingAiFixtureScenario } from "@/lib/coaching/ai/coaching-ai-fixtures";
import type { PreparedCoachingMealImage } from "@/types/coaching-ai";
import type { PrimaryMealSlot } from "@/types/coaching";

const FIXTURE_ROOT = resolve(process.cwd(), "test-fixtures/coaching-meals");

export type CoachingEvalFixtureImageSpec = {
  mealSlot: PrimaryMealSlot;
  fileName: string;
};

const SCENARIO_IMAGES: Record<CoachingAiFixtureScenario, CoachingEvalFixtureImageSpec[]> = {
  A_normal: [
    { mealSlot: "breakfast", fileName: "breakfast-shake.jpg" },
    { mealSlot: "lunch", fileName: "lunch-chicken-salad.jpg" },
    { mealSlot: "dinner", fileName: "dinner-shake-veg.jpg" },
  ],
  B_breakfast_deviation: [
    { mealSlot: "breakfast", fileName: "breakfast-egg-pancake-tea.jpg" },
    { mealSlot: "lunch", fileName: "lunch-bento.jpg" },
    { mealSlot: "dinner", fileName: "dinner-shake-veg.jpg" },
  ],
  C_watch_pattern: [
    { mealSlot: "breakfast", fileName: "breakfast-shake.jpg" },
    { mealSlot: "lunch", fileName: "lunch-bento.jpg" },
    { mealSlot: "dinner", fileName: "dinner-hotpot.jpg" },
  ],
  D_hunger_shake_fried_rice: [
    { mealSlot: "breakfast", fileName: "breakfast-shake.jpg" },
    { mealSlot: "lunch", fileName: "lunch-fried-rice.jpg" },
    { mealSlot: "dinner", fileName: "dinner-shake-person.jpg" },
  ],
};

export function getCoachingEvalFixtureImageSpecs(scenario: CoachingAiFixtureScenario): CoachingEvalFixtureImageSpec[] {
  return SCENARIO_IMAGES[scenario];
}

export async function loadPreparedCoachingEvalMealImages(
  scenario: CoachingAiFixtureScenario,
): Promise<PreparedCoachingMealImage[]> {
  const specs = getCoachingEvalFixtureImageSpecs(scenario);
  const prepared: PreparedCoachingMealImage[] = [];

  for (const spec of specs) {
    const sourcePath = resolve(FIXTURE_ROOT, spec.fileName);
    const raw = await readFile(sourcePath);
    const processed = await processCoachingMealImageForModel(raw);

    prepared.push({
      mealSlot: spec.mealSlot,
      sourceStoragePath: `eval-fixtures/${scenario}/${spec.fileName}`,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      byteLength: processed.byteLength,
      buffer: processed.buffer,
      originalWidth: processed.originalWidth,
      originalHeight: processed.originalHeight,
      originalByteLength: processed.originalByteLength,
    });
  }

  return prepared;
}

export function buildCoachingEvalImageTelemetry(prepared: PreparedCoachingMealImage[]) {
  return {
    selectedImageCount: prepared.length,
    originalTotalBytes: prepared.reduce((sum, item) => sum + item.originalByteLength, 0),
    processedTotalBytes: prepared.reduce((sum, item) => sum + item.byteLength, 0),
    failedImageCount: 0,
    images: prepared.map((item) => ({
      mealSlot: item.mealSlot,
      sourceStoragePath: item.sourceStoragePath,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      originalByteLength: item.originalByteLength,
      processedWidth: item.width,
      processedHeight: item.height,
      processedByteLength: item.byteLength,
    })),
  };
}
