import { z } from "zod";
import {
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  COACHING_INTERVENTION_LEVELS,
  type CoachingDailyGenerationOutputJson,
  type CoachingInterventionLevel,
} from "@/types/coaching-ai";

const interventionLevelSchema = z.enum(COACHING_INTERVENTION_LEVELS);

export const coachingDailyGenerationCustomerOutputSchema = z.object({
  encouragement: z.string().min(1).max(240),
  today_feedback: z.string().min(1).max(500),
  adjustment_priorities: z.array(z.string().min(1).max(120)).max(2),
  tomorrow_focus: z.string().min(1).max(160),
});

export const coachingDailyGenerationCoachOutputSchema = z.object({
  daily_summary: z.string().min(1).max(280),
  recurring_issue: z.string().min(1).max(200).nullable(),
  improved_issue: z.string().min(1).max(200).nullable(),
  proposed_intervention_level: interventionLevelSchema,
  coach_attention_required: z.boolean(),
  attention_reason: z.string().min(1).max(240).nullable(),
  evidence: z.array(z.string().min(1).max(200)).max(6),
});

export const coachingDailyGenerationOutputSchema = z.object({
  version: z.literal(COACHING_DAILY_GENERATION_OUTPUT_VERSION),
  customer: coachingDailyGenerationCustomerOutputSchema,
  coach: coachingDailyGenerationCoachOutputSchema,
});

export type CoachingDailyGenerationOutputParsed = z.infer<typeof coachingDailyGenerationOutputSchema>;

export function isCoachingInterventionLevel(value: string): value is CoachingInterventionLevel {
  return (COACHING_INTERVENTION_LEVELS as readonly string[]).includes(value);
}

export function parseCoachingDailyGenerationOutput(
  value: unknown,
): { ok: true; data: CoachingDailyGenerationOutputJson } | { ok: false; error: string } {
  const parsed = coachingDailyGenerationOutputSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

export function validateCoachingDailyGenerationOutputJson(
  value: unknown,
): CoachingDailyGenerationOutputJson | null {
  const parsed = parseCoachingDailyGenerationOutput(value);
  return parsed.ok ? parsed.data : null;
}

export function extractAiProposedInterventionLevel(
  output: CoachingDailyGenerationOutputJson | null | undefined,
): CoachingInterventionLevel | null {
  return output?.coach.proposed_intervention_level ?? null;
}

/** OpenAI Structured Outputs schema — aligned with Zod validators above. */
export const coachingDailyGenerationOpenAiJsonSchema = {
  type: "object",
  properties: {
    version: { type: "integer", const: COACHING_DAILY_GENERATION_OUTPUT_VERSION },
    customer: {
      type: "object",
      properties: {
        encouragement: { type: "string" },
        today_feedback: { type: "string" },
        adjustment_priorities: {
          type: "array",
          items: { type: "string" },
          maxItems: 2,
        },
        tomorrow_focus: { type: "string" },
      },
      required: ["encouragement", "today_feedback", "adjustment_priorities", "tomorrow_focus"],
      additionalProperties: false,
    },
    coach: {
      type: "object",
      properties: {
        daily_summary: { type: "string" },
        recurring_issue: { type: ["string", "null"] },
        improved_issue: { type: ["string", "null"] },
        proposed_intervention_level: {
          type: "string",
          enum: [...COACHING_INTERVENTION_LEVELS],
        },
        coach_attention_required: { type: "boolean" },
        attention_reason: { type: ["string", "null"] },
        evidence: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "daily_summary",
        "recurring_issue",
        "improved_issue",
        "proposed_intervention_level",
        "coach_attention_required",
        "attention_reason",
        "evidence",
      ],
      additionalProperties: false,
    },
  },
  required: ["version", "customer", "coach"],
  additionalProperties: false,
} as const;
