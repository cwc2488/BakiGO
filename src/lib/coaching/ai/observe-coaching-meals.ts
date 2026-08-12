import { z } from "zod";
import {
  COACHING_DAILY_AI_MODEL_ID,
  COACHING_DAILY_AI_OPENAI_IMAGE_DETAIL,
  COACHING_DAILY_AI_TIMEOUT_MS,
} from "@/lib/coaching/ai/model-config";
import { encodePreparedCoachingMealImageAsBase64 } from "@/lib/coaching/ai/coaching-meal-image-processor";
import { parseOpenAiChatCompletionUsage } from "@/lib/coaching/ai/parse-openai-usage";
import { buildLlmCallLogEntry, logLlmCall } from "@/lib/ai/llm-telemetry";
import type { CoachingGenerationInput, PreparedCoachingMealImage } from "@/types/coaching-ai";
import {
  COACHING_MEAL_OBSERVATION_SIGNALS,
  type CoachingMealObservation,
  type CoachingMealObservationSignal,
} from "@/types/coaching-signals";

const observationItemSchema = z.object({
  mealSlot: z.enum(["breakfast", "lunch", "dinner"]),
  observedFoods: z.array(z.string()).max(8),
  signals: z.array(z.enum(COACHING_MEAL_OBSERVATION_SIGNALS)).max(6),
  evidenceText: z.array(z.string()).max(4),
  mealType: z.string().nullable().optional(),
  visibleProteinSource: z.boolean().nullable().optional(),
  visibleVegetables: z.boolean().nullable().optional(),
  visibleCarbohydrate: z.boolean().nullable().optional(),
  sugaryDrinkObserved: z.boolean().optional(),
  friedOrHighOilCookingObserved: z.boolean().optional(),
  shakeObserved: z.boolean().optional(),
  solidFoodObserved: z.boolean().nullable().optional(),
  noOtherFoodVisible: z.boolean().optional(),
  possibleIssues: z.array(z.string()).max(6).optional(),
  uncertainties: z.array(z.string()).max(6).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  followUpQuestion: z.string().nullable().optional(),
});

const observationResponseSchema = z.object({
  meals: z.array(observationItemSchema).max(3),
});

function heuristicObservationFromNote(input: {
  mealSlot: "breakfast" | "lunch" | "dinner";
  textNote: string | null;
  hasPhoto: boolean;
}): CoachingMealObservation | null {
  const note = input.textNote?.trim() ?? "";
  if (!note && !input.hasPhoto) {
    return null;
  }

  const observedFoods: string[] = [];
  const signals: CoachingMealObservationSignal[] = [];
  const uncertainties: string[] = [];
  const possibleIssues: string[] = [];
  let shakeObserved = false;
  let friedOrHighOilCookingObserved = false;
  let followUpQuestion: string | null = null;
  let noOtherFoodVisible = false;

  if (/奶昔|蛋白飲|代餐/.test(note)) {
    shakeObserved = true;
    observedFoods.push(note.includes("奶昔") ? "奶昔" : "蛋白飲／代餐");
    signals.push("shake_dominant");
    noOtherFoodVisible = true;
    uncertainties.push("照片／備註無法證明這餐只有奶昔，可能還有其他食物未拍到");
    possibleIssues.push("possible_meal_insufficiency");
    followUpQuestion = "照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？";
  }

  if (/炒飯|炒麵|炸雞|鹹酥雞|薯條|油炸/.test(note)) {
    friedOrHighOilCookingObserved = /炸|油炸|鹹酥雞|薯條/.test(note);
    if (/炒飯|炒麵/.test(note)) {
      signals.push("starch_concentrated");
      if (/炒飯/.test(note)) observedFoods.push("炒飯");
      if (/炒麵/.test(note)) observedFoods.push("炒麵");
      possibleIssues.push("starch_concentrated", "higher_oil_cooking_method");
      if (!signals.includes("fried_food")) {
        signals.push("fried_food");
      }
      uncertainties.push("蛋白質與青菜份量從備註看不清楚");
    }
    if (friedOrHighOilCookingObserved && !signals.includes("fried_food")) {
      signals.push("fried_food");
    }
  }

  if (/奶茶|手搖|含糖|可樂|汽水|珍奶/.test(note)) {
    signals.push("sugary_drink");
    observedFoods.push("含糖飲料");
  }

  if (observedFoods.length === 0 && note) {
    observedFoods.push(note.slice(0, 40));
  }

  return {
    mealSlot: input.mealSlot,
    observedFoods,
    signals: Array.from(new Set(signals)),
    evidenceText: [
      note ? `${input.mealSlot} text: ${note}` : `${input.mealSlot}: photo_only`,
    ],
    mealType: shakeObserved ? "shake" : null,
    shakeObserved,
    solidFoodObserved: shakeObserved ? null : note ? true : null,
    friedOrHighOilCookingObserved,
    noOtherFoodVisible,
    possibleIssues,
    uncertainties,
    confidence: input.hasPhoto ? "medium" : "low",
    followUpQuestion,
  };
}

function mergeObservation(
  base: CoachingMealObservation,
  overlay: CoachingMealObservation | null,
): CoachingMealObservation {
  if (!overlay) return base;
  return {
    ...base,
    ...overlay,
    observedFoods: Array.from(new Set([...base.observedFoods, ...overlay.observedFoods])),
    signals: Array.from(new Set([...base.signals, ...overlay.signals])) as CoachingMealObservationSignal[],
    evidenceText: Array.from(new Set([...base.evidenceText, ...overlay.evidenceText])),
    possibleIssues: Array.from(new Set([...(base.possibleIssues ?? []), ...(overlay.possibleIssues ?? [])])),
    uncertainties: Array.from(new Set([...(base.uncertainties ?? []), ...(overlay.uncertainties ?? [])])),
    followUpQuestion: overlay.followUpQuestion ?? base.followUpQuestion ?? null,
  };
}

/**
 * Text-note heuristic observations — always available even if vision fails.
 */
export function buildHeuristicMealObservations(input: {
  generationInput: CoachingGenerationInput;
  preparedMealImages: PreparedCoachingMealImage[];
}): CoachingMealObservation[] {
  const photoSlots = new Set(input.preparedMealImages.map((image) => image.mealSlot));
  const observations: CoachingMealObservation[] = [];

  for (const meal of input.generationInput.todayContext.primaryMeals) {
    const obs = heuristicObservationFromNote({
      mealSlot: meal.mealSlot,
      textNote: meal.textNote,
      hasPhoto: Boolean(meal.storagePath) || photoSlots.has(meal.mealSlot),
    });
    if (obs) {
      observations.push(obs);
    }
  }

  return observations;
}

async function callOpenAiMealVisionObservation(input: {
  apiKey: string;
  generationInput: CoachingGenerationInput;
  preparedMealImages: PreparedCoachingMealImage[];
}): Promise<{
  observations: CoachingMealObservation[];
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number; imageCount: number };
  latencyMs: number;
  model: string;
}> {
  const system = [
    "你是餐點影像觀察器，只做可見事實與不確定性標記。",
    "禁止估算 calories / grams / macros。",
    "禁止把「沒看到其他食物」寫成「確定沒吃其他食物」。",
    "若備註寫喝奶昔且照片主要是奶昔／本人，設 shakeObserved=true、noOtherFoodVisible=true；uncertainties 必須說明「照片沒看到≠實際沒吃」；followUpQuestion 用：「照片裡目前只看到奶昔，我想確認這餐還有沒有搭配其他東西？」",
    "禁止把 noOtherFoodVisible 解讀成確定只喝奶昔。",
    "若看到炒飯，observedFoods 含「炒飯」，可標記 fried_food 或 starch_concentrated，蛋白質／青菜看不清就寫 uncertainty。",
    "signals 只能使用指定 enum。",
  ].join("\n");

  const mealNotes = input.generationInput.todayContext.primaryMeals.map((meal) => ({
    mealSlot: meal.mealSlot,
    textNote: meal.textNote,
    hasPhotoPath: Boolean(meal.storagePath),
  }));

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } };

  const content: ContentPart[] = [
    {
      type: "text",
      text: `請觀察下列餐點（含備註）並輸出 JSON。\n${JSON.stringify({ mealNotes }, null, 2)}`,
    },
  ];

  for (const image of input.preparedMealImages) {
    content.push({ type: "text", text: `以下為 ${image.mealSlot} 照片：` });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${encodePreparedCoachingMealImageAsBase64(image)}`,
        detail: COACHING_DAILY_AI_OPENAI_IMAGE_DETAIL,
      },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COACHING_DAILY_AI_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: COACHING_DAILY_AI_MODEL_ID,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "coaching_meal_observations",
            strict: true,
            schema: {
              type: "object",
              properties: {
                meals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      mealSlot: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
                      observedFoods: { type: "array", items: { type: "string" } },
                      signals: {
                        type: "array",
                        items: { type: "string", enum: [...COACHING_MEAL_OBSERVATION_SIGNALS] },
                      },
                      evidenceText: { type: "array", items: { type: "string" } },
                      mealType: { type: ["string", "null"] },
                      visibleProteinSource: { type: ["boolean", "null"] },
                      visibleVegetables: { type: ["boolean", "null"] },
                      visibleCarbohydrate: { type: ["boolean", "null"] },
                      sugaryDrinkObserved: { type: "boolean" },
                      friedOrHighOilCookingObserved: { type: "boolean" },
                      shakeObserved: { type: "boolean" },
                      solidFoodObserved: { type: ["boolean", "null"] },
                      noOtherFoodVisible: { type: "boolean" },
                      possibleIssues: { type: "array", items: { type: "string" } },
                      uncertainties: { type: "array", items: { type: "string" } },
                      confidence: { type: "string", enum: ["high", "medium", "low"] },
                      followUpQuestion: { type: ["string", "null"] },
                    },
                    required: [
                      "mealSlot",
                      "observedFoods",
                      "signals",
                      "evidenceText",
                      "mealType",
                      "visibleProteinSource",
                      "visibleVegetables",
                      "visibleCarbohydrate",
                      "sugaryDrinkObserved",
                      "friedOrHighOilCookingObserved",
                      "shakeObserved",
                      "solidFoodObserved",
                      "noOtherFoodVisible",
                      "possibleIssues",
                      "uncertainties",
                      "confidence",
                      "followUpQuestion",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: ["meals"],
              additionalProperties: false,
            },
          },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
    });

    const latencyMs = Date.now() - startedAt;
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(json.error?.message ?? `meal_vision_http_${response.status}`);
    }

    const raw = json.choices?.[0]?.message?.content ?? "";
    const parsedJson = JSON.parse(raw) as unknown;
    const parsed = observationResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new Error(`meal_vision_schema:${parsed.error.message}`);
    }

    const usageParsed = parseOpenAiChatCompletionUsage(json);
    return {
      observations: parsed.data.meals,
      usage: {
        inputTokens: usageParsed?.inputTokens ?? 0,
        cachedInputTokens: usageParsed?.cachedInputTokens ?? 0,
        outputTokens: usageParsed?.outputTokens ?? 0,
        imageCount: input.preparedMealImages.length,
      },
      latencyMs,
      model: COACHING_DAILY_AI_MODEL_ID,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Meal Vision Observation layer.
 * Vision + text notes → structured observations. Falls back to heuristics if vision unavailable.
 */
export async function observeCoachingMeals(input: {
  generationInput: CoachingGenerationInput;
  preparedMealImages: PreparedCoachingMealImage[];
  ownerMemberId?: string | null;
  persistTelemetry?: boolean;
  apiKey?: string | null;
}): Promise<{
  observations: CoachingMealObservation[];
  source: "vision" | "heuristic" | "merged";
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number; imageCount: number };
  latencyMs: number;
}> {
  const emptyUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    imageCount: input.preparedMealImages.length,
  };
  const heuristic = buildHeuristicMealObservations({
    generationInput: input.generationInput,
    preparedMealImages: input.preparedMealImages,
  });

  const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || input.preparedMealImages.length === 0) {
    return { observations: heuristic, source: "heuristic", usage: emptyUsage, latencyMs: 0 };
  }

  try {
    const vision = await callOpenAiMealVisionObservation({
      apiKey,
      generationInput: input.generationInput,
      preparedMealImages: input.preparedMealImages,
    });

    if (input.persistTelemetry) {
      const entry = buildLlmCallLogEntry({
        feature: "coaching",
        pointKey: "daily_coach_meal_vision",
        customerId: input.generationInput.customerId,
        enrollmentId: input.generationInput.enrollmentId,
        ownerMemberId: input.ownerMemberId ?? null,
        model: vision.model,
        promptVersion: "coaching_meal_vision_v1",
        usage: vision.usage,
        latencyMs: vision.latencyMs,
        status: "completed",
      });
      await logLlmCall({
        feature: entry.feature,
        pointKey: entry.pointKey,
        customerId: entry.customerId,
        enrollmentId: entry.enrollmentId,
        ownerMemberId: entry.ownerMemberId,
        model: entry.model,
        promptVersion: entry.promptVersion,
        usage: {
          inputTokens: entry.inputTokens,
          cachedInputTokens: entry.cachedInputTokens,
          outputTokens: entry.outputTokens,
          imageCount: entry.imageCount,
        },
        latencyMs: entry.latencyMs,
        status: entry.status,
      });
    }

    const bySlot = new Map<string, CoachingMealObservation>();
    for (const item of heuristic) {
      bySlot.set(item.mealSlot, item);
    }
    for (const item of vision.observations) {
      const existing = bySlot.get(item.mealSlot) ?? null;
      bySlot.set(item.mealSlot, existing ? mergeObservation(existing, item) : item);
    }

    return {
      observations: Array.from(bySlot.values()),
      source: "merged",
      usage: vision.usage,
      latencyMs: vision.latencyMs,
    };
  } catch (error) {
    if (input.persistTelemetry) {
      try {
        await logLlmCall({
          feature: "coaching",
          pointKey: "daily_coach_meal_vision",
          customerId: input.generationInput.customerId,
          enrollmentId: input.generationInput.enrollmentId,
          ownerMemberId: input.ownerMemberId ?? null,
          model: COACHING_DAILY_AI_MODEL_ID,
          promptVersion: "coaching_meal_vision_v1",
          usage: emptyUsage,
          latencyMs: null,
          status: "failed",
          errorCode: error instanceof Error ? error.name : "meal_vision_error",
        });
      } catch {
        // telemetry best-effort
      }
    }
    return { observations: heuristic, source: "heuristic", usage: emptyUsage, latencyMs: 0 };
  }
}
