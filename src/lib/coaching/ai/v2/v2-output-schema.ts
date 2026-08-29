import { z } from "zod";
import {
  COACHING_AI_V2_INTENTIONS,
  COACHING_AI_V2_LIFECYCLE_STAGES,
  COACHING_AI_V2_MEMORY_CATEGORIES,
  type CoachingAiV2GenerationDraft,
  type CoachingAiV2GenerationMeta,
  type CoachingAiV2Intention,
  type CoachingAiV2LifecycleStage,
} from "@/types/coaching-ai-v2";

const memoryWriteSchema = z.object({
  category: z.enum(COACHING_AI_V2_MEMORY_CATEGORIES),
  content: z.string().min(1).max(500),
  evidenceSummary: z.string().min(1).max(400).nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const openLoopOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    subject: z.string().min(1).max(120),
    detail: z.string().min(1).max(400),
    dueLogDate: z.string().nullable().optional(),
    status: z.enum(["open", "waiting"]).optional(),
  }),
  z.object({
    op: z.enum(["resolve", "abandon"]),
    id: z.string().min(1).max(80),
    resolutionNote: z.string().min(1).max(400).nullable().optional(),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string().min(1).max(80),
    detail: z.string().min(1).max(400).optional(),
    dueLogDate: z.string().nullable().optional(),
    status: z.enum(["open", "waiting"]).optional(),
  }),
]);

const hypothesisOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    statement: z.string().min(1).max(400),
    supportingEvidence: z.array(z.string().min(1).max(200)).max(6).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    op: z.enum(["support", "contradict"]),
    id: z.string().min(1).max(80),
    evidence: z.string().min(1).max(200),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    op: z.enum(["reject", "confirm"]),
    id: z.string().min(1).max(80),
    evidence: z.string().min(1).max(200).optional(),
  }),
  z.object({
    op: z.literal("revise"),
    id: z.string().min(1).max(80),
    statement: z.string().min(1).max(400),
    supportingEvidence: z.array(z.string().min(1).max(200)).max(6).optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
]);

const day21Schema = z
  .object({
    startingSituation: z.string().min(1).max(400),
    majorPatterns: z.array(z.string().min(1).max(200)).max(6),
    meaningfulChanges: z.array(z.string().min(1).max(200)).max(6),
    recurringDifficulties: z.array(z.string().min(1).max(200)).max(6),
    triggers: z.array(z.string().min(1).max(200)).max(6),
    experimentsAttempted: z.array(z.string().min(1).max(200)).max(6),
    whatWorked: z.array(z.string().min(1).max(200)).max(6),
    whatDidNot: z.array(z.string().min(1).max(200)).max(6),
    sustainable: z.array(z.string().min(1).max(200)).max(6),
    nextActions: z.array(z.string().min(1).max(200)).max(3),
  })
  .nullable();

export const coachingAiV2GenerationSchema = z.object({
  coach_message: z.string().min(1).max(4000),
  meta: z.object({
    intention: z.enum(COACHING_AI_V2_INTENTIONS),
    lifecycle_day: z.number().int().min(1).max(21).nullable(),
    lifecycle_stage: z.enum(COACHING_AI_V2_LIFECYCLE_STAGES),
    memory_writes: z.array(memoryWriteSchema).max(4).default([]),
    open_loop_ops: z.array(openLoopOpSchema).max(4).default([]),
    hypothesis_ops: z.array(hypothesisOpSchema).max(4).default([]),
    safety_triggered: z.boolean().default(false),
    escalation_suggested: z.boolean().default(false),
    escalation_reason: z.string().min(1).max(240).nullable().default(null),
    day21_reflection: day21Schema.default(null),
  }),
});

export type CoachingAiV2GenerationParsed = z.infer<typeof coachingAiV2GenerationSchema>;

export function parseCoachingAiV2Generation(
  value: unknown,
): { ok: true; data: CoachingAiV2GenerationDraft } | { ok: false; error: string } {
  const parsed = coachingAiV2GenerationSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  const meta: CoachingAiV2GenerationMeta = {
    intention: parsed.data.meta.intention as CoachingAiV2Intention,
    lifecycleDay: parsed.data.meta.lifecycle_day,
    lifecycleStage: parsed.data.meta.lifecycle_stage as CoachingAiV2LifecycleStage,
    memoryWrites: parsed.data.meta.memory_writes.map((w) => ({
      category: w.category,
      content: w.content,
      evidenceSummary: w.evidenceSummary ?? null,
      confidence: w.confidence,
    })),
    openLoopOps: parsed.data.meta.open_loop_ops,
    hypothesisOps: parsed.data.meta.hypothesis_ops,
    safetyTriggered: parsed.data.meta.safety_triggered,
    escalationSuggested: parsed.data.meta.escalation_suggested,
    escalationReason: parsed.data.meta.escalation_reason,
    day21Reflection: parsed.data.meta.day21_reflection,
  };
  return {
    ok: true,
    data: {
      coachMessage: parsed.data.coach_message.trim(),
      meta,
    },
  };
}

/** OpenAI Structured Outputs schema for V2 freeform generation. */
export const coachingAiV2OpenAiJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["coach_message", "meta"],
  properties: {
    coach_message: { type: "string", minLength: 1, maxLength: 4000 },
    meta: {
      type: "object",
      additionalProperties: false,
      required: [
        "intention",
        "lifecycle_day",
        "lifecycle_stage",
        "memory_writes",
        "open_loop_ops",
        "hypothesis_ops",
        "safety_triggered",
        "escalation_suggested",
        "escalation_reason",
        "day21_reflection",
      ],
      properties: {
        intention: { type: "string", enum: [...COACHING_AI_V2_INTENTIONS] },
        lifecycle_day: { anyOf: [{ type: "integer", minimum: 1, maximum: 21 }, { type: "null" }] },
        lifecycle_stage: { type: "string", enum: [...COACHING_AI_V2_LIFECYCLE_STAGES] },
        memory_writes: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "content"],
            properties: {
              category: { type: "string", enum: [...COACHING_AI_V2_MEMORY_CATEGORIES] },
              content: { type: "string", minLength: 1, maxLength: 500 },
              evidenceSummary: {
                anyOf: [{ type: "string", minLength: 1, maxLength: 400 }, { type: "null" }],
              },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
        open_loop_ops: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string" },
              id: { type: "string" },
              subject: { type: "string" },
              detail: { type: "string" },
              dueLogDate: { anyOf: [{ type: "string" }, { type: "null" }] },
              status: { type: "string" },
              resolutionNote: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
          },
        },
        hypothesis_ops: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              op: { type: "string" },
              id: { type: "string" },
              statement: { type: "string" },
              evidence: { type: "string" },
              supportingEvidence: { type: "array", items: { type: "string" } },
              confidence: { type: "number" },
            },
          },
        },
        safety_triggered: { type: "boolean" },
        escalation_suggested: { type: "boolean" },
        escalation_reason: { anyOf: [{ type: "string", maxLength: 240 }, { type: "null" }] },
        day21_reflection: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              additionalProperties: false,
              required: [
                "startingSituation",
                "majorPatterns",
                "meaningfulChanges",
                "recurringDifficulties",
                "triggers",
                "experimentsAttempted",
                "whatWorked",
                "whatDidNot",
                "sustainable",
                "nextActions",
              ],
              properties: {
                startingSituation: { type: "string" },
                majorPatterns: { type: "array", items: { type: "string" }, maxItems: 6 },
                meaningfulChanges: { type: "array", items: { type: "string" }, maxItems: 6 },
                recurringDifficulties: { type: "array", items: { type: "string" }, maxItems: 6 },
                triggers: { type: "array", items: { type: "string" }, maxItems: 6 },
                experimentsAttempted: { type: "array", items: { type: "string" }, maxItems: 6 },
                whatWorked: { type: "array", items: { type: "string" }, maxItems: 6 },
                whatDidNot: { type: "array", items: { type: "string" }, maxItems: 6 },
                sustainable: { type: "array", items: { type: "string" }, maxItems: 6 },
                nextActions: { type: "array", items: { type: "string" }, maxItems: 3 },
              },
            },
          ],
        },
      },
    },
  },
} as const;
