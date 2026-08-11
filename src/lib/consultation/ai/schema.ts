import { z } from "zod";
import type { BarrierInsightOutput, MotivationInsightOutput } from "@/types/consultation-ai";

const boundedConfidence = z.number().min(0).max(1);

export const motivationInsightOutputSchema = z.object({
  coreMotivation: z.string().min(1).max(500),
  motivationSummary: z.string().min(1).max(800),
  signals: z.array(z.string().min(1).max(300)).min(1).max(5),
  recommendedFollowUpQuestion: z.string().min(1).max(400),
  coachNote: z.string().min(1).max(600),
  confidence: boundedConfidence,
});

export const barrierInsightOutputSchema = z.object({
  surfaceBarrier: z.string().min(1).max(500),
  possibleUnderlyingBarrier: z.string().min(1).max(600),
  evidence: z.array(z.string().min(1).max(300)).min(1).max(6),
  recommendedQuestion: z.string().min(1).max(400),
  coachNote: z.string().min(1).max(600),
  confidence: boundedConfidence,
});

export function parseMotivationInsightOutput(
  value: unknown,
): { ok: true; data: MotivationInsightOutput } | { ok: false; error: string } {
  const parsed = motivationInsightOutputSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

export function parseBarrierInsightOutput(
  value: unknown,
): { ok: true; data: BarrierInsightOutput } | { ok: false; error: string } {
  const parsed = barrierInsightOutputSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

/** OpenAI Structured Outputs schemas — aligned with Zod validators above. */
export const motivationInsightOpenAiJsonSchema = {
  type: "object",
  properties: {
    coreMotivation: { type: "string" },
    motivationSummary: { type: "string" },
    signals: {
      type: "array",
      items: { type: "string" },
    },
    recommendedFollowUpQuestion: { type: "string" },
    coachNote: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "coreMotivation",
    "motivationSummary",
    "signals",
    "recommendedFollowUpQuestion",
    "coachNote",
    "confidence",
  ],
  additionalProperties: false,
} as const;

export const barrierInsightOpenAiJsonSchema = {
  type: "object",
  properties: {
    surfaceBarrier: { type: "string" },
    possibleUnderlyingBarrier: { type: "string" },
    evidence: {
      type: "array",
      items: { type: "string" },
    },
    recommendedQuestion: { type: "string" },
    coachNote: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "surfaceBarrier",
    "possibleUnderlyingBarrier",
    "evidence",
    "recommendedQuestion",
    "coachNote",
    "confidence",
  ],
  additionalProperties: false,
} as const;
