import { z } from "zod";
import {
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  COACHING_INTERVENTION_LEVELS,
  type CoachingDailyGenerationOutputJson,
  type CoachingInterventionLevel,
} from "@/types/coaching-ai";

const interventionLevelSchema = z.enum(COACHING_INTERVENTION_LEVELS);

const mealFeedbackSchema = z.object({
  summary: z.string().min(1).max(240),
  good_point: z.string().min(1).max(160).nullable(),
  adjustment: z.string().min(1).max(200).nullable(),
  follow_up_question: z.string().min(1).max(200).nullable(),
});

export const coachingDailyGenerationCustomerOutputSchema = z.object({
  encouragement: z.string().min(1).max(240),
  today_feedback: z.string().min(1).max(500),
  daily_food_summary: z.string().min(1).max(320),
  meal_feedback: z.object({
    breakfast: mealFeedbackSchema.nullable(),
    lunch: mealFeedbackSchema.nullable(),
    dinner: mealFeedbackSchema.nullable(),
  }),
  lifestyle_feedback: z.object({
    hydration: z.string().min(1).max(200).nullable(),
    sleep: z.string().min(1).max(200).nullable(),
    exercise: z.string().min(1).max(200).nullable(),
  }),
  customer_voice_response: z.string().min(1).max(320).nullable(),
  adjustment_priorities: z.array(z.string().min(1).max(120)).max(2),
  tomorrow_focus: z.string().min(1).max(160),
  follow_up_for_tomorrow: z.string().min(1).max(200).nullable(),
});

export const coachingDailyGenerationCoachOutputSchema = z.object({
  daily_summary: z.string().min(1).max(280),
  recurring_issue: z.string().min(1).max(200).nullable(),
  improved_issue: z.string().min(1).max(200).nullable(),
  proposed_intervention_level: interventionLevelSchema,
  coach_attention_required: z.boolean(),
  attention_reason: z.string().min(1).max(240).nullable(),
  evidence: z.array(z.string().min(1).max(200)).max(8),
  follow_ups: z
    .array(
      z.object({
        subject: z.string().min(1).max(80),
        question: z.string().min(1).max(200),
        status: z.enum(["pending", "resolved", "improved"]),
      }),
    )
    .max(4),
  photo_reuse_flags: z
    .array(
      z.object({
        meal_slot: z.enum(["breakfast", "lunch", "dinner"]),
        suspected: z.boolean(),
        matched_log_date: z.string().nullable(),
        method: z.string().min(1).max(40),
      }),
    )
    .max(3),
  daily_nutrition_assessment: z
    .object({
      level: z.enum(["on_track", "needs_adjustment", "off_track", "insufficient_data"]),
      label: z.string().min(1).max(80),
      reasons: z.array(z.string().min(1).max(200)).max(6),
      positive_factors: z.array(z.string().min(1).max(160)).max(4),
      adjustment_subjects: z.array(z.string().min(1).max(160)).max(6),
      confidence: z.number().min(0).max(1),
    })
    .nullable()
    .default(null),
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
        daily_food_summary: { type: "string" },
        meal_feedback: {
          type: "object",
          properties: {
            breakfast: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    good_point: { type: ["string", "null"] },
                    adjustment: { type: ["string", "null"] },
                    follow_up_question: { type: ["string", "null"] },
                  },
                  required: ["summary", "good_point", "adjustment", "follow_up_question"],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
            lunch: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    good_point: { type: ["string", "null"] },
                    adjustment: { type: ["string", "null"] },
                    follow_up_question: { type: ["string", "null"] },
                  },
                  required: ["summary", "good_point", "adjustment", "follow_up_question"],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
            dinner: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    summary: { type: "string" },
                    good_point: { type: ["string", "null"] },
                    adjustment: { type: ["string", "null"] },
                    follow_up_question: { type: ["string", "null"] },
                  },
                  required: ["summary", "good_point", "adjustment", "follow_up_question"],
                  additionalProperties: false,
                },
                { type: "null" },
              ],
            },
          },
          required: ["breakfast", "lunch", "dinner"],
          additionalProperties: false,
        },
        lifestyle_feedback: {
          type: "object",
          properties: {
            hydration: { type: ["string", "null"] },
            sleep: { type: ["string", "null"] },
            exercise: { type: ["string", "null"] },
          },
          required: ["hydration", "sleep", "exercise"],
          additionalProperties: false,
        },
        customer_voice_response: { type: ["string", "null"] },
        adjustment_priorities: {
          type: "array",
          items: { type: "string" },
          maxItems: 2,
        },
        tomorrow_focus: { type: "string" },
        follow_up_for_tomorrow: { type: ["string", "null"] },
      },
      required: [
        "encouragement",
        "today_feedback",
        "daily_food_summary",
        "meal_feedback",
        "lifestyle_feedback",
        "customer_voice_response",
        "adjustment_priorities",
        "tomorrow_focus",
        "follow_up_for_tomorrow",
      ],
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
        follow_ups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              question: { type: "string" },
              status: { type: "string", enum: ["pending", "resolved", "improved"] },
            },
            required: ["subject", "question", "status"],
            additionalProperties: false,
          },
        },
        photo_reuse_flags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              meal_slot: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
              suspected: { type: "boolean" },
              matched_log_date: { type: ["string", "null"] },
              method: { type: "string" },
            },
            required: ["meal_slot", "suspected", "matched_log_date", "method"],
            additionalProperties: false,
          },
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
        "follow_ups",
        "photo_reuse_flags",
      ],
      additionalProperties: false,
    },
  },
  required: ["version", "customer", "coach"],
  additionalProperties: false,
} as const;
