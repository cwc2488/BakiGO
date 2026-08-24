import { z } from "zod";

export const INTERVIEW_FIELD_KIND = ["unknown", "fact", "inference"] as const;
export type InterviewFieldKind = (typeof INTERVIEW_FIELD_KIND)[number];

export const interviewKnowledgeFieldSchema = z.object({
  value: z.string(),
  kind: z.enum(INTERVIEW_FIELD_KIND),
});
export type InterviewKnowledgeField = z.infer<typeof interviewKnowledgeFieldSchema>;

export const INTERVIEW_STAGES = [
  "motivation_discovery",
  "meaning_discovery",
  "barrier_discovery",
  "mechanism_discovery",
  "change_fit",
  "readiness",
  "complete",
] as const;
export type InterviewStage = (typeof INTERVIEW_STAGES)[number];

export const INTERVIEW_UNDERSTANDING_KEYS = [
  "stated_goal",
  "immediate_trigger",
  "deeper_motivation",
  "desired_future",
  "emotional_significance",
  "primary_barrier",
  "barrier_mechanism",
  "dropout_pattern",
  "interpretation_pattern",
  "lifestyle_constraints",
  "behavior_constraints",
  "perceived_cost_of_change",
  "unacceptable_tradeoffs",
  "acceptable_change",
  "support_receptivity",
  "readiness_stage",
  "safety_context",
] as const;
export type InterviewUnderstandingKey = (typeof INTERVIEW_UNDERSTANDING_KEYS)[number];

export const understandingStateSchema = z.object({
  stated_goal: interviewKnowledgeFieldSchema,
  immediate_trigger: interviewKnowledgeFieldSchema,
  deeper_motivation: interviewKnowledgeFieldSchema,
  desired_future: interviewKnowledgeFieldSchema,
  emotional_significance: interviewKnowledgeFieldSchema,
  primary_barrier: interviewKnowledgeFieldSchema,
  barrier_mechanism: interviewKnowledgeFieldSchema,
  dropout_pattern: interviewKnowledgeFieldSchema,
  interpretation_pattern: interviewKnowledgeFieldSchema,
  lifestyle_constraints: interviewKnowledgeFieldSchema,
  behavior_constraints: interviewKnowledgeFieldSchema,
  perceived_cost_of_change: interviewKnowledgeFieldSchema,
  unacceptable_tradeoffs: interviewKnowledgeFieldSchema,
  acceptable_change: interviewKnowledgeFieldSchema,
  support_receptivity: interviewKnowledgeFieldSchema,
  readiness_stage: interviewKnowledgeFieldSchema,
  safety_context: interviewKnowledgeFieldSchema,
  unresolved_questions: z.array(z.string()),
  key_evidence: z.array(
    z.object({
      claim: z.string(),
      source_turn_id: z.string(),
      type: z.enum(["fact", "inference"]),
    }),
  ),
  inferred_insights: z.array(z.string()),
  conversation_stage: z.enum(INTERVIEW_STAGES),
  hypotheses: z
    .array(
      z.object({
        id: z.string(),
        claim: z.string(),
        status: z.enum(["proposed", "confirmed", "contradicted", "abandoned"]),
        evidence_turn_ids: z.array(z.string()),
        reasoning: z.string(),
      }),
    )
    .optional(),
});
export type UnderstandingState = z.infer<typeof understandingStateSchema>;

export function unknownField(): InterviewKnowledgeField {
  return { value: "", kind: "unknown" };
}

export function emptyUnderstandingState(): UnderstandingState {
  const fields = Object.fromEntries(
    INTERVIEW_UNDERSTANDING_KEYS.map((k) => [k, unknownField()]),
  ) as Record<InterviewUnderstandingKey, InterviewKnowledgeField>;
  return {
    ...fields,
    unresolved_questions: [],
    key_evidence: [],
    inferred_insights: [],
    conversation_stage: "motivation_discovery",
    hypotheses: [],
  };
}

export function isKnown(field: InterviewKnowledgeField): boolean {
  return field.kind !== "unknown" && field.value.trim().length > 0;
}

/** Confirmed user-supported fact. Inference is not knowledge. */
export function isFact(field: InterviewKnowledgeField): boolean {
  return field.kind === "fact" && field.value.trim().length > 0;
}

export const HYPOTHESIS_STATUSES = ["proposed", "confirmed", "contradicted", "abandoned"] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

export type InterviewHypothesis = {
  id: string;
  claim: string;
  status: HypothesisStatus;
  evidence_turn_ids: string[];
  reasoning: string;
};

/** Fact wins. Inference cannot overwrite an existing fact. */
export function mergeKnowledgeField(
  current: InterviewKnowledgeField,
  incoming: InterviewKnowledgeField | undefined,
): InterviewKnowledgeField {
  if (!incoming) return current;
  if (incoming.kind === "unknown" || !incoming.value.trim()) return current;
  if (current.kind === "fact" && incoming.kind === "inference") return current;
  return { value: incoming.value.trim(), kind: incoming.kind };
}

export function mergeUnderstanding(
  current: UnderstandingState,
  update: Partial<Record<InterviewUnderstandingKey, InterviewKnowledgeField>> | undefined,
  extras?: {
    evidence?: UnderstandingState["key_evidence"];
    inferred_insights?: string[];
    unresolved_questions?: string[];
    stage?: InterviewStage;
    hypotheses?: InterviewHypothesis[];
  },
): UnderstandingState {
  const next = { ...current, hypotheses: current.hypotheses ? [...current.hypotheses] : [] };
  for (const key of INTERVIEW_UNDERSTANDING_KEYS) {
    next[key] = mergeKnowledgeField(current[key], update?.[key]);
  }
  if (extras?.evidence?.length) {
    const seen = new Set(next.key_evidence.map((e) => `${e.type}:${e.claim}`));
    for (const item of extras.evidence) {
      const id = `${item.type}:${item.claim}`;
      if (!seen.has(id)) {
        next.key_evidence = [...next.key_evidence, item];
        seen.add(id);
      }
    }
  }
  if (extras?.inferred_insights?.length) {
    const seen = new Set(next.inferred_insights);
    for (const insight of extras.inferred_insights) {
      if (insight.trim() && !seen.has(insight)) {
        next.inferred_insights = [...next.inferred_insights, insight.trim()];
        seen.add(insight);
      }
    }
  }
  if (extras?.unresolved_questions) next.unresolved_questions = extras.unresolved_questions;
  if (extras?.stage) next.conversation_stage = extras.stage;
  if (extras?.hypotheses?.length) {
    const seen = new Set((next.hypotheses ?? []).map((h) => h.id));
    const hypotheses = [...(next.hypotheses ?? [])];
    for (const hypo of extras.hypotheses) {
      const existing = hypotheses.find((h) => h.id === hypo.id || h.claim === hypo.claim);
      if (existing) {
        existing.status = hypo.status;
        existing.reasoning = hypo.reasoning || existing.reasoning;
        existing.evidence_turn_ids = Array.from(new Set([...existing.evidence_turn_ids, ...hypo.evidence_turn_ids]));
      } else if (!seen.has(hypo.id)) {
        hypotheses.push(hypo);
        seen.add(hypo.id);
      }
    }
    next.hypotheses = hypotheses;
  }
  return next;
}

export function publicUnderstandingSummary(state: UnderstandingState): Record<string, { value: string; kind: InterviewFieldKind }> {
  const out: Record<string, { value: string; kind: InterviewFieldKind }> = {};
  for (const key of INTERVIEW_UNDERSTANDING_KEYS) {
    if (isKnown(state[key])) out[key] = { value: state[key].value, kind: state[key].kind };
  }
  return out;
}
