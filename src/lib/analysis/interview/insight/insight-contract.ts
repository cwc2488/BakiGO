import { z } from "zod";

/**
 * QUIZ-AI-30 isolated experiment. Not Preview consumer default.
 *
 * Root cause of ChatGPT-B paraphrase loop lives in the shared interview
 * runtime: speech-act JSON, short visible budget, truncated history, no
 * persisted hypothesis, and a prompt that rewards proving you listened.
 * This module is a separate contract so Preview B stays untouched.
 */
export const INSIGHT_CONSULTANT_PROMPT_VERSION = "analysis_interview_insight_v1" as const;
export const INSIGHT_CONSULTANT_MODEL = "gpt-4.1" as const;
export const INSIGHT_TIMEOUT_MS = 28_000 as const;
export const INSIGHT_MAX_OUTPUT_TOKENS = 1400 as const;
export const INSIGHT_HARD_MAX_TURNS = 10 as const;

export const INSIGHT_NEXT_MOVES = [
  "listen",
  "connect",
  "challenge",
  "hypothesize",
  "clarify",
  "answer",
  "stop",
  "ask",
] as const;
export type InsightNextMove = (typeof INSIGHT_NEXT_MOVES)[number];

export const insightReasoningSchema = z.object({
  surface_statement: z.string().max(240),
  current_best_hypothesis: z.string().max(320),
  evidence_for: z.array(z.string().max(180)).max(6),
  evidence_against: z.array(z.string().max(180)).max(6),
  contradictions: z.array(z.string().max(180)).max(4),
  possible_deeper_driver: z.string().max(240),
  confidence: z.enum(["low", "medium", "high"]),
  what_changed_this_turn: z.string().max(240),
  most_valuable_next_move: z.enum(INSIGHT_NEXT_MOVES),
});
export type InsightReasoning = z.infer<typeof insightReasoningSchema>;

export const insightTurnSchema = z.object({
  private_reasoning: insightReasoningSchema,
  assistant_response: z.string().max(1200),
  safety_signal: z.object({
    needs_boundary: z.boolean(),
    reason: z.string().max(200).nullable(),
  }),
});
export type InsightTurn = z.infer<typeof insightTurnSchema>;

export const INSIGHT_TURN_JSON_SCHEMA = {
  name: "insight_consultant_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["private_reasoning", "assistant_response", "safety_signal"],
    properties: {
      private_reasoning: {
        type: "object",
        additionalProperties: false,
        required: [
          "surface_statement",
          "current_best_hypothesis",
          "evidence_for",
          "evidence_against",
          "contradictions",
          "possible_deeper_driver",
          "confidence",
          "what_changed_this_turn",
          "most_valuable_next_move",
        ],
        properties: {
          surface_statement: { type: "string" },
          current_best_hypothesis: { type: "string" },
          evidence_for: { type: "array", items: { type: "string" } },
          evidence_against: { type: "array", items: { type: "string" } },
          contradictions: { type: "array", items: { type: "string" } },
          possible_deeper_driver: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          what_changed_this_turn: { type: "string" },
          most_valuable_next_move: { type: "string", enum: [...INSIGHT_NEXT_MOVES] },
        },
      },
      assistant_response: {
        type: "string",
        description:
          "User-visible utterance. Must add understanding beyond restating the last user line. Asking is optional. At most one stacked interrogation.",
      },
      safety_signal: {
        type: "object",
        additionalProperties: false,
        required: ["needs_boundary", "reason"],
        properties: {
          needs_boundary: { type: "boolean" },
          reason: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export type InsightTurnRecord = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type InsightSessionState = {
  version: "analysis_insight_v1";
  promptVersion: typeof INSIGHT_CONSULTANT_PROMPT_VERSION;
  conversationModel: string;
  turns: InsightTurnRecord[];
  reasoning: InsightReasoning | null;
  reasoningHistory: InsightReasoning[];
  pendingResponse: string;
  aiCallCount: number;
  usedFallback: boolean;
  completionReason: "hard_max" | "model_stop" | null;
  safety: { flagged: boolean; userReportedMedical: boolean };
};

export function emptyInsightReasoning(): InsightReasoning {
  return {
    surface_statement: "",
    current_best_hypothesis: "",
    evidence_for: [],
    evidence_against: [],
    contradictions: [],
    possible_deeper_driver: "",
    confidence: "low",
    what_changed_this_turn: "",
    most_valuable_next_move: "listen",
  };
}

export function createInitialInsightSession(model = INSIGHT_CONSULTANT_MODEL): InsightSessionState {
  return {
    version: "analysis_insight_v1",
    promptVersion: INSIGHT_CONSULTANT_PROMPT_VERSION,
    conversationModel: model,
    turns: [],
    reasoning: null,
    reasoningHistory: [],
    pendingResponse: "",
    aiCallCount: 0,
    usedFallback: false,
    completionReason: null,
    safety: { flagged: false, userReportedMedical: false },
  };
}
