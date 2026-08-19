import { z } from "zod";
import { INTERVIEW_UNDERSTANDING_KEYS } from "@/lib/analysis/interview/understanding-state";
import { understandingPatchItemSchema } from "@/lib/analysis/interview/interview-contract";

export const NATIVE_INTERVIEW_PROMPT_VERSION = "analysis_interview_native_v1_3" as const;
export const NATIVE_INTERVIEW_MODEL_MINI = "gpt-4o-mini-2024-07-18" as const;
export const NATIVE_INTERVIEW_MODEL_FOUR_ONE_MINI = "gpt-4.1-mini" as const;
/** QUIZ-AI-23 default deep-interview model. */
export const NATIVE_INTERVIEW_MODEL_STRONG = "gpt-4.1" as const;
export const NATIVE_INTERVIEW_TIMEOUT_MS = 25_000 as const;
export const NATIVE_INTERVIEW_MAX_OUTPUT_TOKENS = 720 as const;

export const NATIVE_CONVERSATION_ACTIONS = [
  "reflect",
  "ask",
  "reflect_and_ask",
  "verify",
  "challenge",
  "answer_then_continue",
  "summarize",
  "complete",
] as const;
export type NativeConversationAction = (typeof NATIVE_CONVERSATION_ACTIONS)[number];

export const nativeHypothesisSchema = z.object({
  claim: z.string().max(160),
  status: z.enum(["proposed", "confirmed", "rejected"]),
});

export const nativeInterviewTurnSchema = z.object({
  assistant_response: z.string().max(640),
  conversation_action: z.enum(NATIVE_CONVERSATION_ACTIONS),
  understanding_patch: z.array(understandingPatchItemSchema).max(6),
  hypotheses: z.array(nativeHypothesisSchema).max(4),
  completion_signal: z.object({
    ready: z.boolean(),
    reason: z.string().max(200),
  }),
  safety_signal: z.object({
    needs_boundary: z.boolean(),
    reason: z.string().max(200).nullable(),
  }),
});
export type NativeInterviewTurn = z.infer<typeof nativeInterviewTurnSchema>;

export const NATIVE_INTERVIEW_JSON_SCHEMA = {
  name: "native_interview_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "assistant_response",
      "conversation_action",
      "understanding_patch",
      "hypotheses",
      "completion_signal",
      "safety_signal",
    ],
    properties: {
      assistant_response: {
        type: "string",
        description:
          "The only user-visible utterance. At most one interrogative intent and one question mark. May contain zero questions. If the user asked duration/cost/how, answer in a statement first.",
      },
      conversation_action: { type: "string", enum: [...NATIVE_CONVERSATION_ACTIONS] },
      understanding_patch: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "value", "kind", "evidence_turn_ids", "reasoning"],
          properties: {
            field: { type: "string", enum: [...INTERVIEW_UNDERSTANDING_KEYS] },
            value: { type: "string" },
            kind: { type: "string", enum: ["fact", "inference"] },
            evidence_turn_ids: { type: "array", items: { type: "string" } },
            reasoning: { type: "string" },
          },
        },
      },
      hypotheses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim", "status"],
          properties: {
            claim: { type: "string" },
            status: { type: "string", enum: ["proposed", "confirmed", "rejected"] },
          },
        },
      },
      completion_signal: {
        type: "object",
        additionalProperties: false,
        required: ["ready", "reason"],
        properties: {
          ready: { type: "boolean" },
          reason: { type: "string" },
        },
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

export function blankNativeTurn(): NativeInterviewTurn {
  return {
    assistant_response: "",
    conversation_action: "reflect",
    understanding_patch: [],
    hypotheses: [],
    completion_signal: { ready: false, reason: "" },
    safety_signal: { needs_boundary: false, reason: null },
  };
}
