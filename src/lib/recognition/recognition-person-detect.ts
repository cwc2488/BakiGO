/**
 * Recognition photo person-count detection (Vision).
 *
 * Scoped to Recognition Center only. Does not modify Coaching / Quiz / Radar AI.
 * Counts visible people only — no identity, face embeddings, or biometric storage.
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";

export const RECOGNITION_PERSON_DETECT_MODEL = "gpt-4o-mini-2024-07-18" as const;
export const RECOGNITION_PERSON_DETECT_TIMEOUT_MS = 20_000 as const;
export const RECOGNITION_PERSON_DETECT_IMAGE_DETAIL = "low" as const;

/** Fail-closed: classifications below this confidence are treated as uncertain. */
export const RECOGNITION_PERSON_DETECT_CONFIDENCE_THRESHOLD = 0.70;

export type RecognitionPersonCountCategory = "none" | "single" | "multiple" | "uncertain";

export type RecognitionPersonDetection = {
  personCount: 0 | 1 | 2;
  personCountCategory: RecognitionPersonCountCategory;
  confidence: number;
};

const responseSchema = z.object({
  personCountCategory: z.enum(["none", "single", "multiple", "uncertain"]),
  personCount: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  confidence: z.number().min(0).max(1),
});

const detectionCache = new Map<string, RecognitionPersonDetection>();
const DETECTION_CACHE_MAX = 64;

function uncertainResult(): RecognitionPersonDetection {
  return { personCount: 0, personCountCategory: "uncertain", confidence: 0 };
}

function normalizePersonCount(
  category: RecognitionPersonCountCategory,
): 0 | 1 | 2 {
  if (category === "none" || category === "uncertain") return 0;
  if (category === "single") return 1;
  return 2;
}

/**
 * Fail-closed confidence gate for Vision person-count results.
 * Missing / non-finite / below-threshold confidence → uncertain.
 * Never defaults missing confidence to a high value.
 */
export function applyRecognitionPersonConfidenceGate(input: {
  personCountCategory: RecognitionPersonCountCategory;
  personCount?: 0 | 1 | 2;
  confidence?: number | null;
}): RecognitionPersonDetection {
  const confidence = input.confidence;
  if (
    typeof confidence !== "number"
    || !Number.isFinite(confidence)
    || confidence < RECOGNITION_PERSON_DETECT_CONFIDENCE_THRESHOLD
  ) {
    return uncertainResult();
  }
  const category = input.personCountCategory;
  return {
    personCountCategory: category,
    personCount: input.personCount ?? normalizePersonCount(category),
    confidence,
  };
}

function cacheGet(key: string): RecognitionPersonDetection | null {
  return detectionCache.get(key) ?? null;
}

function cacheSet(key: string, value: RecognitionPersonDetection): void {
  if (detectionCache.size >= DETECTION_CACHE_MAX) {
    const first = detectionCache.keys().next().value;
    if (first) detectionCache.delete(first);
  }
  detectionCache.set(key, value);
}

export function clearRecognitionPersonDetectionCache(): void {
  detectionCache.clear();
}

export function personDetectionFromStoredIssueCodes(
  codes: readonly string[] | null | undefined,
): RecognitionPersonDetection | null {
  if (!codes?.length) return null;
  if (codes.includes("no_person")) {
    return { personCount: 0, personCountCategory: "none", confidence: 1 };
  }
  if (codes.includes("uncertain_person")) {
    return { personCount: 0, personCountCategory: "uncertain", confidence: 0 };
  }
  if (codes.includes("multi_person")) {
    return { personCount: 2, personCountCategory: "multiple", confidence: 1 };
  }
  return null;
}

async function prepareJpegForVision(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: 1024,
      height: 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 75 })
    .toBuffer();
}

/**
 * Detect whether a Recognition photo contains identifiable people.
 * Fail-closed: API / parse failures return `uncertain` (must re-upload).
 */
export async function detectRecognitionPhotoPersons(input: {
  buffer: Buffer;
  mimeType?: string | null;
  apiKey?: string | null;
}): Promise<RecognitionPersonDetection> {
  let jpeg: Buffer;
  try {
    jpeg = await prepareJpegForVision(input.buffer);
  } catch {
    return uncertainResult();
  }

  const cacheKey = createHash("sha256").update(jpeg).digest("hex");
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) {
    const result = uncertainResult();
    cacheSet(cacheKey, result);
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECOGNITION_PERSON_DETECT_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: RECOGNITION_PERSON_DETECT_MODEL,
        temperature: 0,
        max_tokens: 80,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "recognition_person_count",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                personCountCategory: {
                  type: "string",
                  enum: ["none", "single", "multiple", "uncertain"],
                },
                personCount: { type: "integer", enum: [0, 1, 2] },
                confidence: { type: "number" },
              },
              required: ["personCountCategory", "personCount", "confidence"],
            },
          },
        },
        messages: [
          {
            role: "system",
            content:
              "You count visible people in recognition award photos. "
              + "Return only JSON. "
              + "none = no identifiable person visible (background, floor, texture, empty scene). "
              + "single = exactly one clear person. "
              + "multiple = two or more people clearly visible. "
              + "uncertain = cannot reliably tell. "
              + "personCount must be 0 for none/uncertain, 1 for single, 2 for multiple (use 2 even if more than two). "
              + "Do not identify anyone, estimate age/gender, or describe appearance.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "How many identifiable people are clearly visible in this photo?",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
                  detail: RECOGNITION_PERSON_DETECT_IMAGE_DETAIL,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const result = uncertainResult();
      cacheSet(cacheKey, result);
      return result;
    }

    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    const parsedJson = JSON.parse(content) as unknown;
    const parsed = responseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      const result = uncertainResult();
      cacheSet(cacheKey, result);
      return result;
    }

    const normalized = applyRecognitionPersonConfidenceGate({
      personCountCategory: parsed.data.personCountCategory,
      personCount: normalizePersonCount(parsed.data.personCountCategory),
      confidence: parsed.data.confidence,
    });
    cacheSet(cacheKey, normalized);
    return normalized;
  } catch {
    const result = uncertainResult();
    cacheSet(cacheKey, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
