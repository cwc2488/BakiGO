import { createHash } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service-client";
import {
  getCoachingDailyLogDetail,
  type ResolvedCoachingPortal,
} from "@/lib/coaching/coaching-service";
import {
  downloadCoachingMealPhotoFromStorage,
  processCoachingMealImageForModel,
} from "@/lib/coaching/ai/coaching-meal-image-processor";
import { observeCoachingMeals } from "@/lib/coaching/ai/observe-coaching-meals";
import { parseCoachingMealPhotoPath } from "@/lib/coaching/ai/validate-coaching-meal-photo-path";
import type { CoachingGenerationInput, PreparedCoachingMealImage } from "@/types/coaching-ai";
import type { CoachingMealObservation } from "@/types/coaching-signals";
import type { CoachingMealSlot, PrimaryMealSlot } from "@/types/coaching";
import {
  assessGo21VisionFoodRelevance,
  buildGo21NonFoodEvidenceSummary,
  type Go21VisionFoodRelevance,
} from "@/lib/go21/vision-food-relevance";

export type Go21RealtimeVisionResult = {
  ran: boolean;
  reusedCache: boolean;
  failed: boolean;
  failureReason: string | null;
  storagePath: string | null;
  mealSlotResolved: PrimaryMealSlot | null;
  mealSlotUnresolved: boolean;
  observations: CoachingMealObservation[];
  /** Short evidence summary for V2 freeMessage / prompts — not a scanner report. */
  evidenceSummary: string | null;
  source: "vision" | "heuristic" | "merged" | "cache" | "none";
  usage: { inputTokens: number; outputTokens: number; imageCount: number };
  /** Food relevance gate — false blocks meal/nutrition/plan-food pipelines. */
  foodRelevant: boolean;
  foodRelevance: Go21VisionFoodRelevance | null;
};

/**
 * Resolve authoritative photo for this portal + log date + optional slot.
 * Never trusts client-supplied storage paths.
 */
export async function resolveAuthoritativeGo21Photo(input: {
  portal: ResolvedCoachingPortal;
  logDate: string;
  preferredSlot: CoachingMealSlot | null;
}): Promise<{
  storagePath: string | null;
  mealSlot: CoachingMealSlot | null;
  photoId: string | null;
}> {
  const detail = await getCoachingDailyLogDetail({
    enrollmentId: input.portal.enrollmentId,
    logDate: input.logDate,
    ownerMemberId: input.portal.ownerMemberId,
  });

  const withPhoto = detail.meals.filter((m) => m.photo?.storagePath);
  if (withPhoto.length === 0) {
    return { storagePath: null, mealSlot: null, photoId: null };
  }

  const preferred =
    (input.preferredSlot
      ? withPhoto.find((m) => m.mealSlot === input.preferredSlot)
      : null) ??
    withPhoto.find((m) => m.mealSlot === "snacks" && /待確認餐別|photo/i.test(m.textNote ?? "")) ??
    withPhoto.sort((a, b) =>
      String(b.photo?.uploadedAt ?? "").localeCompare(String(a.photo?.uploadedAt ?? "")),
    )[0];

  if (!preferred?.photo?.storagePath) {
    return { storagePath: null, mealSlot: null, photoId: null };
  }

  const storagePath = preferred.photo.storagePath;
  const parsed = parseGo21PhotoPath(storagePath);
  if (!parsed) {
    return { storagePath: null, mealSlot: null, photoId: null };
  }
  if (parsed.customerId !== input.portal.customerId) {
    throw new Error("photo_customer_mismatch");
  }
  if (parsed.enrollmentId !== input.portal.enrollmentId) {
    throw new Error("photo_enrollment_mismatch");
  }
  if (parsed.logDate !== input.logDate) {
    // Allow same-day only for this turn's event date
    return { storagePath: null, mealSlot: null, photoId: null };
  }

  return {
    storagePath,
    mealSlot: preferred.mealSlot,
    photoId: preferred.photo.id,
  };
}

/** Path parser that also allows snacks (photo-only / unconfirmed meal). */
export function parseGo21PhotoPath(storagePath: string): {
  customerId: string;
  enrollmentId: string;
  logDate: string;
  mealSlot: string;
  photoId: string;
} | null {
  const primary = parseCoachingMealPhotoPath(storagePath);
  if (primary) {
    return {
      customerId: primary.customerId,
      enrollmentId: primary.enrollmentId,
      logDate: primary.logDate,
      mealSlot: primary.mealSlot,
      photoId: primary.photoId,
    };
  }
  const match =
    /^([^/]+)\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/(snacks)\/([^/]+\.jpg)$/.exec(
      storagePath.trim(),
    );
  if (!match) return null;
  return {
    customerId: match[1]!,
    enrollmentId: match[2]!,
    logDate: match[3]!,
    mealSlot: match[4]!,
    photoId: match[5]!.replace(/\.jpg$/, ""),
  };
}

export async function loadVisionCache(
  storagePath: string,
): Promise<{ observation: CoachingMealObservation; source: string } | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("coaching_meal_photos")
    .select("vision_observation_json, vision_source, vision_observed_at")
    .eq("storage_path", storagePath)
    .not("vision_observation_json", "is", null)
    .order("vision_observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.vision_observation_json || typeof data.vision_observation_json !== "object") {
    return null;
  }
  if (data.vision_source === "failed") return null;
  return {
    observation: data.vision_observation_json as CoachingMealObservation,
    source: String(data.vision_source ?? "cache"),
  };
}

/** Load cached vision observations for daily job reuse (skip duplicate OpenAI calls). */
export async function loadGo21VisionCacheForStoragePaths(
  storagePaths: string[],
): Promise<Map<string, CoachingMealObservation>> {
  const map = new Map<string, CoachingMealObservation>();
  const unique = Array.from(new Set(storagePaths.filter(Boolean)));
  await Promise.all(
    unique.map(async (path) => {
      const cached = await loadVisionCache(path);
      if (cached?.observation) map.set(path, cached.observation);
    }),
  );
  return map;
}

export async function saveVisionCache(input: {
  storagePath: string;
  observation: CoachingMealObservation | null;
  source: "vision" | "heuristic" | "merged" | "failed";
  model: string | null;
}): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("coaching_meal_photos")
    .update({
      vision_observation_json: input.observation,
      vision_observed_at: new Date().toISOString(),
      vision_model: input.model,
      vision_source: input.source,
    })
    .eq("storage_path", input.storagePath);
  if (error) {
    // Column may be missing pre-migration — log and continue.
    console.error(
      JSON.stringify({
        event: "go21_vision_cache_write_failed",
        error: error.message,
        storagePathHash: createHash("sha256").update(input.storagePath).digest("hex").slice(0, 12),
      }),
    );
  }
}

function toVisionApiSlot(slot: string | null): PrimaryMealSlot {
  if (slot === "breakfast" || slot === "lunch" || slot === "dinner") return slot;
  // Unconfirmed snack/pending photos: API schema requires a primary slot label.
  // This label is NOT promoted to canonical meal_slot when unresolved.
  return "lunch";
}

/**
 * Apply food-relevance gate to an observation set.
 * Non-food → empty meal observations + non-food evidence summary.
 */
export function gateGo21VisionObservations(input: {
  observations: CoachingMealObservation[];
  mealSlotUnresolved: boolean;
  mealSlotResolved: PrimaryMealSlot | null;
}): Pick<
  Go21RealtimeVisionResult,
  "observations" | "evidenceSummary" | "foodRelevant" | "foodRelevance" | "mealSlotResolved"
> {
  const primary = input.observations[0] ?? null;
  const relevance = assessGo21VisionFoodRelevance(primary);
  if (!relevance.isFoodRelevant) {
    return {
      observations: [],
      evidenceSummary: buildGo21NonFoodEvidenceSummary(relevance),
      foodRelevant: false,
      foodRelevance: relevance,
      mealSlotResolved: null,
    };
  }
  return {
    observations: input.mealSlotUnresolved ? [] : input.observations,
    evidenceSummary: primary
      ? buildEvidenceSummary(
          input.mealSlotUnresolved ? [primary] : input.observations,
          input.mealSlotUnresolved,
        )
      : null,
    foodRelevant: true,
    foodRelevance: relevance,
    mealSlotResolved: input.mealSlotUnresolved ? null : input.mealSlotResolved,
  };
}

function buildEvidenceSummary(
  observations: CoachingMealObservation[],
  mealSlotUnresolved: boolean,
): string | null {
  if (observations.length === 0) return null;
  const parts: string[] = [];
  for (const obs of observations) {
    const foods = (obs.observedFoods ?? []).slice(0, 6).join("、");
    const uncertain = (obs.uncertainties ?? []).slice(0, 2).join("；");
    const veg = obs.visibleVegetables === true ? "有看到蔬菜" : null;
    const protein = obs.visibleProteinSource === true ? "有看到蛋白質來源" : null;
    const cues = [veg, protein].filter(Boolean).join("，");
    parts.push(
      [
        mealSlotUnresolved ? "餐別未確認" : obs.mealSlot,
        foods ? `可見：${foods}` : null,
        cues || null,
        uncertain ? `不確定：${uncertain}` : null,
        obs.confidence ? `信心：${obs.confidence}` : null,
      ]
        .filter(Boolean)
        .join("｜"),
    );
  }
  return parts.join("\n");
}

/**
 * Real-time vision for the current Go21 chat turn.
 * Uses private storage download (service role) — never client-supplied URLs.
 */
export async function runGo21RealtimeVision(input: {
  portal: ResolvedCoachingPortal;
  generationInput: CoachingGenerationInput;
  logDate: string;
  preferredSlot: CoachingMealSlot | null;
  mealSlotUnresolved: boolean;
  forceRefresh?: boolean;
}): Promise<Go21RealtimeVisionResult> {
  const empty: Go21RealtimeVisionResult = {
    ran: false,
    reusedCache: false,
    failed: false,
    failureReason: null,
    storagePath: null,
    mealSlotResolved: null,
    mealSlotUnresolved: input.mealSlotUnresolved,
    observations: [],
    evidenceSummary: null,
    source: "none",
    usage: { inputTokens: 0, outputTokens: 0, imageCount: 0 },
    foodRelevant: false,
    foodRelevance: null,
  };

  let resolved;
  try {
    resolved = await resolveAuthoritativeGo21Photo({
      portal: input.portal,
      logDate: input.logDate,
      preferredSlot: input.preferredSlot,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "go21_photo_resolve_failed",
        enrollmentId: input.portal.enrollmentId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ...empty, failed: true, failureReason: "photo_ownership_or_resolve_failed" };
  }

  if (!resolved.storagePath) {
    return { ...empty, failureReason: "no_authoritative_photo" };
  }

  const slotForApi = toVisionApiSlot(
    input.preferredSlot && ["breakfast", "lunch", "dinner"].includes(input.preferredSlot)
      ? input.preferredSlot
      : resolved.mealSlot,
  );

  if (!input.forceRefresh) {
    const cached = await loadVisionCache(resolved.storagePath);
    if (cached?.observation) {
      const obs = {
        ...cached.observation,
        mealSlot: slotForApi,
      };
      const gated = gateGo21VisionObservations({
        observations: [obs],
        mealSlotUnresolved: input.mealSlotUnresolved,
        mealSlotResolved: input.mealSlotUnresolved ? null : slotForApi,
      });
      return {
        ran: true,
        reusedCache: true,
        failed: false,
        failureReason: null,
        storagePath: resolved.storagePath,
        mealSlotUnresolved: input.mealSlotUnresolved,
        source: "cache",
        usage: { inputTokens: 0, outputTokens: 0, imageCount: 0 },
        ...gated,
      };
    }
  }

  let prepared: PreparedCoachingMealImage;
  try {
    const raw = await downloadCoachingMealPhotoFromStorage(resolved.storagePath);
    const processed = await processCoachingMealImageForModel(raw);
    prepared = {
      mealSlot: slotForApi,
      sourceStoragePath: resolved.storagePath,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      byteLength: processed.byteLength,
      originalWidth: processed.originalWidth,
      originalHeight: processed.originalHeight,
      originalByteLength: processed.originalByteLength,
      buffer: processed.buffer,
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "go21_vision_prepare_failed",
        enrollmentId: input.portal.enrollmentId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    await saveVisionCache({
      storagePath: resolved.storagePath,
      observation: null,
      source: "failed",
      model: null,
    });
    return {
      ...empty,
      ran: true,
      failed: true,
      failureReason: "image_prepare_failed",
      storagePath: resolved.storagePath,
    };
  }

  // Ensure generation input references this photo for vision meal notes
  const generationInput: CoachingGenerationInput = {
    ...input.generationInput,
    todayContext: {
      ...input.generationInput.todayContext,
      primaryMeals: input.generationInput.todayContext.primaryMeals.map((m) =>
        m.mealSlot === slotForApi
          ? {
              ...m,
              storagePath: resolved.storagePath,
              textNote:
                m.textNote ||
                (input.mealSlotUnresolved ? "（照片待確認餐別）" : null),
            }
          : m,
      ),
    },
  };

  // If slot was snacks-only, inject a synthetic primary meal row for vision notes
  if (
    !generationInput.todayContext.primaryMeals.some(
      (m) => m.mealSlot === slotForApi && m.storagePath === resolved.storagePath,
    )
  ) {
    generationInput.todayContext.primaryMeals = generationInput.todayContext.primaryMeals.map(
      (m) =>
        m.mealSlot === slotForApi
          ? {
              ...m,
              storagePath: resolved.storagePath,
              textNote: input.mealSlotUnresolved
                ? "（照片待確認餐別）"
                : m.textNote,
            }
          : m,
    );
  }

  const hasKey = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (!hasKey) {
    await saveVisionCache({
      storagePath: resolved.storagePath,
      observation: null,
      source: "failed",
      model: null,
    });
    return {
      ...empty,
      ran: true,
      failed: true,
      failureReason: "vision_unavailable",
      storagePath: resolved.storagePath,
    };
  }

  const observed = await observeCoachingMeals({
    generationInput,
    preparedMealImages: [prepared],
    ownerMemberId: input.portal.ownerMemberId,
    persistTelemetry: true,
  });

  // Real-time path requires actual vision/merged — never treat text heuristics as image evidence.
  if (observed.source === "heuristic") {
    await saveVisionCache({
      storagePath: resolved.storagePath,
      observation: null,
      source: "failed",
      model: null,
    });
    console.error(
      JSON.stringify({
        event: "go21_realtime_vision_failed",
        enrollmentId: input.portal.enrollmentId,
        reason: "fell_back_to_heuristic",
      }),
    );
    return {
      ...empty,
      ran: true,
      failed: true,
      failureReason: "vision_unavailable_or_failed",
      storagePath: resolved.storagePath,
    };
  }

  const primaryObs =
    observed.observations.find((o) => o.mealSlot === slotForApi) ??
    observed.observations[0] ??
    null;

  if (primaryObs) {
    await saveVisionCache({
      storagePath: resolved.storagePath,
      observation: primaryObs,
      source: observed.source,
      model: process.env.COACHING_DAILY_AI_MODEL_ID ?? "meal_vision",
    });
  }

  const gated = gateGo21VisionObservations({
    observations: primaryObs ? [primaryObs] : observed.observations,
    mealSlotUnresolved: input.mealSlotUnresolved,
    mealSlotResolved: input.mealSlotUnresolved ? null : slotForApi,
  });

  return {
    ran: true,
    reusedCache: false,
    failed: false,
    failureReason: null,
    storagePath: resolved.storagePath,
    mealSlotUnresolved: input.mealSlotUnresolved,
    source: observed.source,
    usage: {
      inputTokens: observed.usage.inputTokens,
      outputTokens: observed.usage.outputTokens,
      imageCount: observed.usage.imageCount,
    },
    ...gated,
  };
}

/** Compose coach-facing free message enrichment from vision (not a calorie report). */
export function composeGo21VisionFreeMessage(input: {
  customerMessage: string;
  hasPhoto: boolean;
  vision: Go21RealtimeVisionResult;
}): string {
  const nonFood = input.vision.ran && input.vision.foodRelevant === false;
  const base =
    input.customerMessage.trim() ||
    (input.hasPhoto
      ? nonFood
        ? "（傳了一張照片）"
        : "（傳了一張餐點照片）"
      : "");

  if (!input.vision.ran) return base;

  if (input.vision.failed) {
    return `${base}\n\n[系統] 照片已收到，但這次影像理解未成功；請顧客用文字補充主要吃了什麼。`;
  }

  if (nonFood && input.vision.evidenceSummary) {
    return `${base}\n\n[影像觀察｜非餐點]\n${input.vision.evidenceSummary}`;
  }

  if (input.vision.evidenceSummary) {
    return `${base}\n\n[影像觀察｜僅供教練參考，非已確認事實]\n${input.vision.evidenceSummary}`;
  }

  return base;
}
