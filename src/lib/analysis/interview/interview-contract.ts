import { z } from "zod";
import {
  INTERVIEW_STAGES,
  INTERVIEW_UNDERSTANDING_KEYS,
  type UnderstandingState,
} from "@/lib/analysis/interview/understanding-state";

export const ANALYSIS_INTERVIEW_SCHEMA_VERSION = "analysis_interview_v1" as const;
export const ANALYSIS_INTERVIEW_META_KEY = "__interview" as const;
export const ANALYSIS_INTERVIEW_PROMPT_VERSION = "analysis_interview_v1_8" as const;

/** Faster approved model already used in production coaching. Layer2 report stays on gpt-4.1-mini. */
export const ANALYSIS_INTERVIEW_MODEL_ID = "gpt-4o-mini-2024-07-18" as const;
export const ANALYSIS_INTERVIEW_TIMEOUT_MS = 20_000 as const;
/** One attempt: a retry doubles perceived latency. Fallback is programmatic. */
export const ANALYSIS_INTERVIEW_MAX_ATTEMPTS = 1 as const;
/** Conversation move + short reply/question + small patch. */
export const ANALYSIS_INTERVIEW_MAX_OUTPUT_TOKENS = 640 as const;

export const CONVERSATIONAL_MOVES = [
  "acknowledge_and_ask",
  "reflect_and_verify",
  "test_hypothesis",
  "distinguish_two_explanations",
  "follow_new_information",
  "deepen_when_useful",
  "challenge_gently",
  "answer_then_ask",
  "explain_and_return_control",
  "summarize_and_verify",
  "complete",
] as const;
export type ConversationalMove = (typeof CONVERSATIONAL_MOVES)[number];

export const ANALYSIS_INTERVIEW_BOUNDS = {
  recommendedMin: 4,
  typicalMin: 5,
  typicalMax: 8,
  hardMax: 10,
} as const;

export const INTERVIEW_OPENER_ID = "iv_open" as const;
export const INTERVIEW_OPENER_QUESTION = "先不用想得很完整。你現在會想改變，最主要是因為什麼？" as const;
export const INTERVIEW_SAFETY_QUESTION_ID = "iv_safety" as const;
export const INTERVIEW_SAFETY_QUESTION =
  "目前是否有醫師要求你特別注意的飲食、運動或健康狀況？（有的話用一句話說一下；沒有也可以直接說沒有。）" as const;

export const CONVERSION_SIGNAL_TYPES = [
  "duration_question",
  "how_it_works",
  "cost_question",
  "support_interest",
  "trial_interest",
  "coach_interest",
  "readiness_language",
] as const;
export type ConversionSignalType = (typeof CONVERSION_SIGNAL_TYPES)[number];

export const understandingPatchItemSchema = z.object({
  field: z.enum(INTERVIEW_UNDERSTANDING_KEYS),
  value: z.string().max(200),
  kind: z.enum(["fact", "inference"]),
  evidence_turn_ids: z.array(z.string().max(40)).max(4),
  reasoning: z.string().max(200),
});
export type UnderstandingPatchItem = z.infer<typeof understandingPatchItemSchema>;

export const reasoningSummarySchema = z.object({
  new_information: z.string().max(160),
  current_interpretation: z.string().max(160),
  why_this_move: z.string().max(200),
  hypothesis_being_tested: z.string().max(160),
});
export type ReasoningSummary = z.infer<typeof reasoningSummarySchema>;

export const interviewAiTurnSchema = z.object({
  move: z.enum(CONVERSATIONAL_MOVES),
  reasoning_summary: reasoningSummarySchema,
  understanding_patch: z.array(understandingPatchItemSchema).max(6),
  evidence: z
    .array(
      z.object({
        claim: z.string(),
        source_turn_id: z.string(),
        type: z.enum(["fact", "inference"]),
      }),
    )
    .max(8),
  stage: z.enum(INTERVIEW_STAGES),
  next_action: z.enum(["ask", "complete", "answer_then_ask"]),
  reason_for_next_question: z.string().max(400),
  assistant_response: z.string().max(420),
  follow_up_question: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().max(280).nullable(),
  ),
  answer_mode: z.enum(["free_text", "optional_choices"]),
  optional_choices: z.array(z.string().max(80)).max(5),
  conversion_signal: z.object({
    detected: z.boolean(),
    type: z.enum(CONVERSION_SIGNAL_TYPES).nullable(),
  }),
  safety_signal: z.object({
    flagged: z.boolean(),
    kind: z.string().max(40),
    note: z.string().max(200),
  }),
  user_question_detected: z.boolean(),
});
export type InterviewAiTurn = z.infer<typeof interviewAiTurnSchema>;

export const INTERVIEW_AI_JSON_SCHEMA = {
  name: "analysis_interview_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "move",
      "reasoning_summary",
      "understanding_patch",
      "evidence",
      "stage",
      "next_action",
      "reason_for_next_question",
      "assistant_response",
      "follow_up_question",
      "answer_mode",
      "optional_choices",
      "conversion_signal",
      "safety_signal",
      "user_question_detected",
    ],
    properties: {
      move: { type: "string", enum: [...CONVERSATIONAL_MOVES] },
      reasoning_summary: {
        type: "object",
        additionalProperties: false,
        required: ["new_information", "current_interpretation", "why_this_move", "hypothesis_being_tested"],
        properties: {
          new_information: { type: "string" },
          current_interpretation: { type: "string" },
          why_this_move: { type: "string" },
          hypothesis_being_tested: { type: "string" },
        },
      },
      understanding_patch: {
        type: "array",
        maxItems: 6,
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
      evidence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["claim", "source_turn_id", "type"],
          properties: {
            claim: { type: "string" },
            source_turn_id: { type: "string" },
            type: { type: "string", enum: ["fact", "inference"] },
          },
        },
      },
      stage: { type: "string", enum: [...INTERVIEW_STAGES] },
      next_action: { type: "string", enum: ["ask", "complete", "answer_then_ask"] },
      reason_for_next_question: { type: "string" },
      assistant_response: { type: "string" },
      follow_up_question: { type: ["string", "null"] },
      answer_mode: { type: "string", enum: ["free_text", "optional_choices"] },
      optional_choices: { type: "array", items: { type: "string" } },
      conversion_signal: {
        type: "object",
        additionalProperties: false,
        required: ["detected", "type"],
        properties: {
          detected: { type: "boolean" },
          type: { type: ["string", "null"], enum: [...CONVERSION_SIGNAL_TYPES, null] },
        },
      },
      safety_signal: {
        type: "object",
        additionalProperties: false,
        required: ["flagged", "kind", "note"],
        properties: {
          flagged: { type: "boolean" },
          kind: { type: "string" },
          note: { type: "string" },
        },
      },
      user_question_detected: { type: "boolean" },
    },
  },
} as const;

export type InterviewTurn = {
  id: string;
  role: "assistant" | "user";
  text: string;
  questionId?: string;
  createdAt: string;
};

export type InterviewSessionState = {
  version: typeof ANALYSIS_INTERVIEW_SCHEMA_VERSION;
  turns: InterviewTurn[];
  understanding: UnderstandingState;
  currentQuestionId: string;
  pendingAssistant: {
    response: string;
    question: string;
    choices: string[];
    answerMode: "free_text" | "optional_choices";
  };
  conversionSignals: Array<{ type: ConversionSignalType; turnId: string }>;
  safety: {
    flagged: boolean;
    askedSafetyQuestion: boolean;
    userReportedMedical: boolean;
  };
  completionReason: null | "semantic" | "hard_max" | "safety_stop" | "fallback";
  aiCallCount: number;
  lastUserFingerprint: string | null;
  failedAiTurns: number;
  usedFallback: boolean;
  /** P2.8 native experiment. Absent / legacy = Conversation Reasoner path. */
  conversationEngine?: "legacy" | "native";
  conversationModel?: string;
  promptVersion?: string;
};

export function blankTurnOutput(): InterviewAiTurn {
  return {
    move: "acknowledge_and_ask",
    reasoning_summary: {
      new_information: "",
      current_interpretation: "",
      why_this_move: "",
      hypothesis_being_tested: "",
    },
    understanding_patch: [],
    evidence: [],
    stage: "motivation_discovery",
    next_action: "ask",
    reason_for_next_question: "opener",
    assistant_response: "",
    follow_up_question: INTERVIEW_OPENER_QUESTION,
    answer_mode: "free_text",
    optional_choices: [],
    conversion_signal: { detected: false, type: null },
    safety_signal: { flagged: false, kind: "", note: "" },
    user_question_detected: false,
  };
}
