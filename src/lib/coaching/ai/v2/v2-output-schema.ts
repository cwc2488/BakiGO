/**
 * Three contracts for Coaching Brain V3 generation:
 *
 * 1. MODEL RESPONSE — minimal: coach_message + optional soft meta
 * 2. CANONICAL INTERNAL — after normalize + server enrichment
 * 3. PERSISTED STATE — unchanged Supabase rows / memory ops
 *
 * Server-owned (never trust model for success):
 *   lifecycle_day, lifecycle_stage
 *
 * Model-owned:
 *   coach_message (critical)
 *   intention (noncritical metadata — normalize)
 *   memory/open_loop/hypothesis ops (optional — soft drop invalid)
 *   safety flags (default false; server may escalate)
 *   day21_reflection (optional structured)
 */
import { z } from "zod";
import {
  COACHING_AI_V2_INTENTIONS,
  COACHING_AI_V2_LIFECYCLE_STAGES,
  COACHING_AI_V2_MEMORY_CATEGORIES,
  type CoachingAiV2GenerationDraft,
  type CoachingAiV2GenerationMeta,
  type CoachingAiV2Intention,
  type CoachingAiV2LifecycleStage,
  type CoachingAiV2MemoryWrite,
  type CoachingAiV2OpenLoopOp,
  type CoachingAiV2HypothesisOp,
  type CoachingAiV2Day21ReflectionJson,
} from "@/types/coaching-ai-v2";
import {
  logCoachingAiV2MoveNormalized,
  normalizeCoachingAiV2Intention,
} from "@/lib/coaching/ai/v2/intention-normalize";

const MEMORY_CATEGORY_SET = new Set<string>(COACHING_AI_V2_MEMORY_CATEGORIES);
const LIFECYCLE_STAGE_SET = new Set<string>(COACHING_AI_V2_LIFECYCLE_STAGES);

export type ParseCoachingAiV2Enrichment = {
  /** Authoritative day from server lifecycle snapshot. */
  lifecycleDay: number | null;
  /** Authoritative stage from server lifecycle snapshot. */
  lifecycleStage: CoachingAiV2LifecycleStage;
};

/**
 * Loose model-facing schema: only coach_message is strictly required.
 * lifecycle_* accepted if present but always overwritten by enrichment.
 */
const modelResponseSchema = z.object({
  coach_message: z.string().min(1).max(4000),
  meta: z
    .object({
      intention: z.union([z.string(), z.null()]).optional(),
      lifecycle_day: z.unknown().optional(),
      lifecycle_stage: z.unknown().optional(),
      memory_writes: z.unknown().optional(),
      open_loop_ops: z.unknown().optional(),
      hypothesis_ops: z.unknown().optional(),
      safety_triggered: z.unknown().optional(),
      escalation_suggested: z.unknown().optional(),
      escalation_reason: z.unknown().optional(),
      day21_reflection: z.unknown().optional(),
    })
    .passthrough()
    .optional()
    .default({}),
});

/** @deprecated Prefer parseCoachingAiV2Generation with enrichment. Kept for tests that pass full meta. */
export const coachingAiV2GenerationSchema = z.object({
  coach_message: z.string().min(1).max(4000),
  meta: z.object({
    intention: z.union([z.string().min(1).max(80), z.null()]).optional(),
    lifecycle_day: z.number().int().min(1).max(21).nullable().optional(),
    lifecycle_stage: z.enum(COACHING_AI_V2_LIFECYCLE_STAGES).optional(),
    memory_writes: z.array(z.unknown()).max(4).optional().default([]),
    open_loop_ops: z.array(z.unknown()).max(4).optional().default([]),
    hypothesis_ops: z.array(z.unknown()).max(4).optional().default([]),
    safety_triggered: z.boolean().optional().default(false),
    escalation_suggested: z.boolean().optional().default(false),
    escalation_reason: z.string().max(240).nullable().optional().default(null),
    day21_reflection: z.unknown().optional().nullable(),
  }),
});

export type CoachingAiV2GenerationParsed = z.infer<typeof coachingAiV2GenerationSchema>;

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function asNullableString(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function softMemoryWrites(raw: unknown): CoachingAiV2MemoryWrite[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachingAiV2MemoryWrite[] = [];
  for (const item of raw.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const category = typeof row.category === "string" ? row.category : "";
    const content = typeof row.content === "string" ? row.content.trim() : "";
    if (!MEMORY_CATEGORY_SET.has(category) || !content) continue;
    out.push({
      category: category as CoachingAiV2MemoryWrite["category"],
      content: content.slice(0, 500),
      evidenceSummary:
        typeof row.evidenceSummary === "string"
          ? row.evidenceSummary.slice(0, 400)
          : row.evidenceSummary === null
            ? null
            : null,
      confidence: typeof row.confidence === "number" ? row.confidence : undefined,
    });
  }
  return out;
}

function softOpenLoopOps(raw: unknown): CoachingAiV2OpenLoopOp[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachingAiV2OpenLoopOp[] = [];
  for (const item of raw.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const op = typeof row.op === "string" ? row.op : "";
    try {
      if (op === "create") {
        const subject = typeof row.subject === "string" ? row.subject.trim() : "";
        const detail = typeof row.detail === "string" ? row.detail.trim() : "";
        if (!subject || !detail) continue;
        out.push({
          op: "create",
          subject: subject.slice(0, 120),
          detail: detail.slice(0, 400),
          dueLogDate: typeof row.dueLogDate === "string" ? row.dueLogDate : null,
          status:
            row.status === "waiting" || row.status === "open"
              ? row.status
              : undefined,
        });
      } else if (op === "resolve" || op === "abandon") {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id) continue;
        out.push({
          op,
          id: id.slice(0, 80),
          resolutionNote:
            typeof row.resolutionNote === "string"
              ? row.resolutionNote.slice(0, 400)
              : null,
        });
      } else if (op === "update") {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id) continue;
        out.push({
          op: "update",
          id: id.slice(0, 80),
          detail: typeof row.detail === "string" ? row.detail.slice(0, 400) : undefined,
          dueLogDate: typeof row.dueLogDate === "string" ? row.dueLogDate : undefined,
          status:
            row.status === "waiting" || row.status === "open"
              ? row.status
              : undefined,
        });
      }
    } catch {
      // drop malformed op
    }
  }
  return out;
}

function softHypothesisOps(raw: unknown): CoachingAiV2HypothesisOp[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachingAiV2HypothesisOp[] = [];
  for (const item of raw.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const op = typeof row.op === "string" ? row.op : "";
    try {
      if (op === "create") {
        const statement = typeof row.statement === "string" ? row.statement.trim() : "";
        if (!statement) continue;
        out.push({
          op: "create",
          statement: statement.slice(0, 400),
          supportingEvidence: Array.isArray(row.supportingEvidence)
            ? row.supportingEvidence
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.slice(0, 200))
                .slice(0, 6)
            : undefined,
          confidence: typeof row.confidence === "number" ? row.confidence : undefined,
        });
      } else if (op === "support" || op === "contradict") {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const evidence = typeof row.evidence === "string" ? row.evidence.trim() : "";
        if (!id || !evidence) continue;
        out.push({
          op,
          id: id.slice(0, 80),
          evidence: evidence.slice(0, 200),
          confidence: typeof row.confidence === "number" ? row.confidence : undefined,
        });
      } else if (op === "reject" || op === "confirm") {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (!id) continue;
        out.push({
          op,
          id: id.slice(0, 80),
          evidence: typeof row.evidence === "string" ? row.evidence.slice(0, 200) : undefined,
        });
      } else if (op === "revise") {
        const id = typeof row.id === "string" ? row.id.trim() : "";
        const statement = typeof row.statement === "string" ? row.statement.trim() : "";
        if (!id || !statement) continue;
        out.push({
          op: "revise",
          id: id.slice(0, 80),
          statement: statement.slice(0, 400),
          supportingEvidence: Array.isArray(row.supportingEvidence)
            ? row.supportingEvidence
                .filter((s): s is string => typeof s === "string")
                .map((s) => s.slice(0, 200))
                .slice(0, 6)
            : undefined,
          confidence: typeof row.confidence === "number" ? row.confidence : undefined,
        });
      }
    } catch {
      // drop
    }
  }
  return out;
}

function softDay21Reflection(raw: unknown): CoachingAiV2Day21ReflectionJson | null {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const strArr = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.slice(0, 200)).slice(0, 6)
      : [];
  const startingSituation =
    typeof row.startingSituation === "string" ? row.startingSituation.trim().slice(0, 400) : "";
  const nextActions = strArr(row.nextActions).slice(0, 3);
  if (!startingSituation || nextActions.length === 0) return null;
  return {
    startingSituation,
    majorPatterns: strArr(row.majorPatterns),
    meaningfulChanges: strArr(row.meaningfulChanges),
    recurringDifficulties: strArr(row.recurringDifficulties),
    triggers: strArr(row.triggers),
    experimentsAttempted: strArr(row.experimentsAttempted),
    whatWorked: strArr(row.whatWorked),
    whatDidNot: strArr(row.whatDidNot),
    sustainable: strArr(row.sustainable),
    nextActions,
  };
}

function resolveLifecycle(
  enrich: ParseCoachingAiV2Enrichment | undefined,
  meta: Record<string, unknown>,
): { day: number | null; stage: CoachingAiV2LifecycleStage } {
  if (enrich) {
    return { day: enrich.lifecycleDay, stage: enrich.lifecycleStage };
  }
  // Backward-compat for unit tests that omit enrichment but pass lifecycle fields.
  let day: number | null = null;
  if (typeof meta.lifecycle_day === "number" && Number.isFinite(meta.lifecycle_day)) {
    const n = Math.trunc(meta.lifecycle_day);
    day = n >= 1 && n <= 21 ? n : null;
  }
  const stageRaw = typeof meta.lifecycle_stage === "string" ? meta.lifecycle_stage : "";
  const stage = LIFECYCLE_STAGE_SET.has(stageRaw)
    ? (stageRaw as CoachingAiV2LifecycleStage)
    : "understand";
  return { day, stage };
}

/**
 * Parse model JSON into a canonical draft.
 * Pass server enrichment so lifecycle never depends on the LLM.
 */
export function parseCoachingAiV2Generation(
  value: unknown,
  enrich?: ParseCoachingAiV2Enrichment,
): { ok: true; data: CoachingAiV2GenerationDraft } | { ok: false; error: string } {
  const loose = modelResponseSchema.safeParse(value);
  if (!loose.success) {
    return { ok: false, error: loose.error.message };
  }

  const coachMessage = loose.data.coach_message.trim();
  if (!coachMessage) {
    return { ok: false, error: "coach_message empty after trim" };
  }

  const metaRaw = (loose.data.meta ?? {}) as Record<string, unknown>;
  const safetyTriggered = asBool(metaRaw.safety_triggered, false);
  const escalationSuggested = asBool(metaRaw.escalation_suggested, false);

  const move = normalizeCoachingAiV2Intention({
    raw: metaRaw.intention,
    safetyTriggered,
    escalationSuggested,
  });
  if (move.normalized) {
    logCoachingAiV2MoveNormalized({
      raw: move.raw,
      intention: move.intention,
      reason: move.reason,
    });
  }

  const lifecycle = resolveLifecycle(enrich, metaRaw);

  const meta: CoachingAiV2GenerationMeta = {
    intention: move.intention as CoachingAiV2Intention,
    lifecycleDay: lifecycle.day,
    lifecycleStage: lifecycle.stage,
    memoryWrites: softMemoryWrites(metaRaw.memory_writes),
    openLoopOps: softOpenLoopOps(metaRaw.open_loop_ops),
    hypothesisOps: softHypothesisOps(metaRaw.hypothesis_ops),
    safetyTriggered,
    escalationSuggested,
    escalationReason: asNullableString(metaRaw.escalation_reason, 240),
    day21Reflection: softDay21Reflection(metaRaw.day21_reflection),
  };

  return {
    ok: true,
    data: {
      coachMessage,
      meta,
    },
  };
}

/**
 * OpenAI Structured Outputs schema — MODEL RESPONSE CONTRACT only.
 * lifecycle_day / lifecycle_stage are intentionally omitted (server-owned).
 */
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
        "memory_writes",
        "open_loop_ops",
        "hypothesis_ops",
        "safety_triggered",
        "escalation_suggested",
        "escalation_reason",
        "day21_reflection",
      ],
      properties: {
        intention: { type: "string", minLength: 1, maxLength: 80 },
        memory_writes: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "content"],
            properties: {
              // Soft string — invalid categories dropped server-side, not fatal.
              category: { type: "string", minLength: 1, maxLength: 40 },
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

/** Re-export canonical list for single-source consumers/tests. */
export { COACHING_AI_V2_INTENTIONS, COACHING_AI_V2_LIFECYCLE_STAGES };
