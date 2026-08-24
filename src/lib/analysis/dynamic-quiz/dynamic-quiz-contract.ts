import { z } from "zod";

export const DYNAMIC_QUIZ_META_KEY = "__dynamicQuiz" as const;
export const DYNAMIC_QUIZ_SCHEMA_VERSION = "analysis_dynamic_quiz_v1" as const;
export const DYNAMIC_QUIZ_PROMPT_VERSION = "analysis_dynamic_quiz_v1_3" as const;
export const ANALYSIS_NATIVE_V1_SCHEMA_VERSION = "analysis_native_v1" as const;

export const DYNAMIC_QUIZ_MODEL_MINI = "gpt-4.1-mini" as const;
export const DYNAMIC_QUIZ_MODEL_STRONG = "gpt-4.1" as const;
export const DYNAMIC_QUIZ_TIMEOUT_MS = 20_000 as const;
export const DYNAMIC_QUIZ_MAX_OUTPUT_TOKENS = 1000 as const;

export const DYNAMIC_QUIZ_BOUNDS = {
  min: 6,
  preferCompleteFrom: 8,
  hardMax: 8,
} as const;

export const DYNAMIC_QUIZ_OPENER_ID = "dq_q1" as const;

export const DYNAMIC_QUIZ_OPENER = {
  id: DYNAMIC_QUIZ_OPENER_ID,
  question: "最近最讓你想改變體態的是什麼？",
  type: "single_choice" as const,
  options: [
    { id: "clothes", label: "衣服越來越不好穿" },
    { id: "health", label: "健康／健檢讓我開始在意" },
    { id: "people", label: "身邊的人一直提醒我" },
    { id: "looks", label: "最近對自己的外表比較沒自信" },
    { id: "rebound", label: "以前瘦過，但後來又胖回來" },
    { id: "unsure", label: "其實我也說不上來" },
  ],
  reasoning_tag: "opening_calibration",
  hypothesis_targets: ["primary_motivation", "readiness"],
};

export const quizOptionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(2).max(80),
});

export const HYPOTHESIS_STATUSES = [
  "active",
  "confirmed",
  "weakened",
  "rejected",
  "superseded",
] as const;
export type HypothesisStatus = (typeof HYPOTHESIS_STATUSES)[number];

export const HYPOTHESIS_KINDS = [
  "motivation",
  "barrier",
  "tradeoff",
  "behavior_pattern",
  "readiness",
] as const;
export type HypothesisKind = (typeof HYPOTHESIS_KINDS)[number];

export const MATERIAL_CHANGE_TARGETS = [
  "motivation",
  "barrier",
  "tradeoff",
  "behavior_pattern",
  "readiness",
  "competing_hypothesis",
  "why_now",
  "causal_mechanism",
  "next_consultant_action",
] as const;

export const informationGainSchema = z.object({
  target: z.string().max(120),
  plausible_answers: z.array(z.string().max(80)).max(3),
  material_change: z.boolean(),
  change_dimensions: z.array(z.enum(MATERIAL_CHANGE_TARGETS)).max(6),
  short_rationale: z.string().max(160),
});
export type InformationGain = z.infer<typeof informationGainSchema>;

export function emptyInformationGain(complete: boolean): InformationGain {
  return {
    target: "",
    plausible_answers: [],
    material_change: !complete,
    change_dimensions: complete ? [] : ["motivation"],
    short_rationale: complete ? "no material change" : "",
  };
}

export type CorrectionEvent = {
  id: string;
  turn: string;
  user_text: string;
  new_claim: string;
  supersedes_claim_ids: string[];
  authority: "explicit_user_correction";
  status: "active" | "superseded";
};

export type HypothesisSeq = Record<HypothesisKind, number>;

export function emptyHypothesisSeq(): HypothesisSeq {
  return { motivation: 0, barrier: 0, tradeoff: 0, behavior_pattern: 0, readiness: 0 };
}

export const quizPriorClaimSchema = z.object({
  id: z.string().max(40).default("h"),
  kind: z.enum(HYPOTHESIS_KINDS).default("motivation"),
  claim: z.string().max(180),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string().max(120)).max(6),
  status: z.enum(HYPOTHESIS_STATUSES).default("active"),
});

export const quizPriorSchema = z.object({
  unverified: z.literal(true),
  likely_primary_motivation: quizPriorClaimSchema,
  likely_barriers: z.array(quizPriorClaimSchema).max(4),
  possible_tradeoffs: z.array(quizPriorClaimSchema).max(4),
  possible_behavior_pattern: z.array(quizPriorClaimSchema).max(4),
  confidence: z.object({
    overall: z.enum(["low", "medium", "high"]),
    motivation: z.enum(["low", "medium", "high"]),
    barrier: z.enum(["low", "medium", "high"]),
  }),
  contradictions: z.array(z.string().max(180)).max(6),
  unresolved: z.array(z.string().max(180)).max(6),
  evidence: z.array(z.string().max(180)).max(12),
  hypotheses: z.array(quizPriorClaimSchema).max(10).default([]),
});
export type QuizPriorClaim = z.infer<typeof quizPriorClaimSchema>;
export type QuizPrior = z.infer<typeof quizPriorSchema>;

export function quizClaim(
  text: string,
  confidence: QuizPriorClaim["confidence"],
  evidence: string[],
  kind: HypothesisKind = "motivation",
  id = "h_mot_1",
  status: HypothesisStatus = "active",
): QuizPriorClaim {
  return { id, kind, claim: text, confidence, evidence, status };
}

export const quizUnderstandingSchema = z.object({
  observed_signals: z.array(z.string().max(160)).max(10),
  provisional_motivations: z.array(z.string().max(160)).max(6),
  possible_barriers: z.array(z.string().max(160)).max(6),
  possible_tradeoffs: z.array(z.string().max(160)).max(6),
  confidence: z.enum(["low", "medium", "high"]),
  contradictions: z.array(z.string().max(180)).max(6),
  unresolved_hypotheses: z.array(z.string().max(180)).max(6),
});
export type QuizUnderstanding = z.infer<typeof quizUnderstandingSchema>;

export const quizTurnOutputSchema = z.object({
  action: z.enum(["ask", "complete"]),
  decision: z.enum(["continue", "complete"]),
  why_next_question: z.string().max(200),
  last_answer_added: z.string().max(180),
  remaining_uncertainty: z.string().max(180),
  material_change_targets: z.array(z.enum(MATERIAL_CHANGE_TARGETS)).max(6),
  information_gain: informationGainSchema,
  question: z.string().max(160),
  type: z.enum(["single_choice", "multi_select"]),
  options: z.array(quizOptionSchema).max(7),
  reasoning_tag: z.string().max(80),
  hypothesis_targets: z.array(z.string().max(40)).max(6),
  understanding: quizUnderstandingSchema,
  quiz_prior: quizPriorSchema,
});
export type QuizTurnOutput = z.infer<typeof quizTurnOutputSchema>;

export const DYNAMIC_QUIZ_JSON_SCHEMA = {
  name: "dynamic_quiz_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "action",
      "decision",
      "why_next_question",
      "last_answer_added",
      "remaining_uncertainty",
      "material_change_targets",
      "information_gain",
      "question",
      "type",
      "options",
      "reasoning_tag",
      "hypothesis_targets",
      "understanding",
      "quiz_prior",
    ],
    properties: {
      action: { type: "string", enum: ["ask", "complete"] },
      decision: { type: "string", enum: ["continue", "complete"] },
      why_next_question: { type: "string" },
      last_answer_added: { type: "string" },
      remaining_uncertainty: { type: "string" },
      material_change_targets: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "motivation",
            "barrier",
            "tradeoff",
            "behavior_pattern",
            "readiness",
            "competing_hypothesis",
            "why_now",
            "causal_mechanism",
            "next_consultant_action",
          ],
        },
      },
      information_gain: {
        type: "object",
        additionalProperties: false,
        required: ["target", "plausible_answers", "material_change", "change_dimensions", "short_rationale"],
        properties: {
          target: { type: "string" },
          plausible_answers: { type: "array", items: { type: "string" } },
          material_change: { type: "boolean" },
          change_dimensions: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "motivation",
                "barrier",
                "tradeoff",
                "behavior_pattern",
                "readiness",
                "competing_hypothesis",
                "why_now",
                "causal_mechanism",
                "next_consultant_action",
              ],
            },
          },
          short_rationale: { type: "string" },
        },
      },
      question: { type: "string" },
      type: { type: "string", enum: ["single_choice", "multi_select"] },
      options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label"],
          properties: { id: { type: "string" }, label: { type: "string" } },
        },
      },
      reasoning_tag: { type: "string" },
      hypothesis_targets: { type: "array", items: { type: "string" } },
      understanding: {
        type: "object",
        additionalProperties: false,
        required: [
          "observed_signals",
          "provisional_motivations",
          "possible_barriers",
          "possible_tradeoffs",
          "confidence",
          "contradictions",
          "unresolved_hypotheses",
        ],
        properties: {
          observed_signals: { type: "array", items: { type: "string" } },
          provisional_motivations: { type: "array", items: { type: "string" } },
          possible_barriers: { type: "array", items: { type: "string" } },
          possible_tradeoffs: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          contradictions: { type: "array", items: { type: "string" } },
          unresolved_hypotheses: { type: "array", items: { type: "string" } },
        },
      },
      quiz_prior: {
        type: "object",
        additionalProperties: false,
        required: [
          "unverified",
          "likely_primary_motivation",
          "likely_barriers",
          "possible_tradeoffs",
          "possible_behavior_pattern",
          "confidence",
          "contradictions",
          "unresolved",
          "evidence",
          "hypotheses",
        ],
        properties: {
          unverified: { type: "boolean" },
          likely_primary_motivation: {
            type: "object",
            additionalProperties: false,
            required: ["id", "kind", "claim", "confidence", "evidence", "status"],
            properties: {
              id: { type: "string" },
              kind: {
                type: "string",
                enum: ["motivation", "barrier", "tradeoff", "behavior_pattern", "readiness"],
              },
              claim: { type: "string" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              evidence: { type: "array", items: { type: "string" } },
              status: {
                type: "string",
                enum: ["active", "confirmed", "weakened", "rejected", "superseded"],
              },
            },
          },
          likely_barriers: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "kind", "claim", "confidence", "evidence", "status"],
              properties: {
                id: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["motivation", "barrier", "tradeoff", "behavior_pattern", "readiness"],
                },
                claim: { type: "string" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                evidence: { type: "array", items: { type: "string" } },
                status: {
                  type: "string",
                  enum: ["active", "confirmed", "weakened", "rejected", "superseded"],
                },
              },
            },
          },
          possible_tradeoffs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "kind", "claim", "confidence", "evidence", "status"],
              properties: {
                id: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["motivation", "barrier", "tradeoff", "behavior_pattern", "readiness"],
                },
                claim: { type: "string" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                evidence: { type: "array", items: { type: "string" } },
                status: {
                  type: "string",
                  enum: ["active", "confirmed", "weakened", "rejected", "superseded"],
                },
              },
            },
          },
          possible_behavior_pattern: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "kind", "claim", "confidence", "evidence", "status"],
              properties: {
                id: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["motivation", "barrier", "tradeoff", "behavior_pattern", "readiness"],
                },
                claim: { type: "string" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                evidence: { type: "array", items: { type: "string" } },
                status: {
                  type: "string",
                  enum: ["active", "confirmed", "weakened", "rejected", "superseded"],
                },
              },
            },
          },
          confidence: {
            type: "object",
            additionalProperties: false,
            required: ["overall", "motivation", "barrier"],
            properties: {
              overall: { type: "string", enum: ["low", "medium", "high"] },
              motivation: { type: "string", enum: ["low", "medium", "high"] },
              barrier: { type: "string", enum: ["low", "medium", "high"] },
            },
          },
          contradictions: { type: "array", items: { type: "string" } },
          unresolved: { type: "array", items: { type: "string" } },
          evidence: { type: "array", items: { type: "string" } },
          hypotheses: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "kind", "claim", "confidence", "evidence", "status"],
              properties: {
                id: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["motivation", "barrier", "tradeoff", "behavior_pattern", "readiness"],
                },
                claim: { type: "string" },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                evidence: { type: "array", items: { type: "string" } },
                status: {
                  type: "string",
                  enum: ["active", "confirmed", "weakened", "rejected", "superseded"],
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type HypothesisLifecycleChange = {
  hypothesisId: string;
  claim: string;
  from: HypothesisStatus | "absent";
  to: HypothesisStatus;
  reason: string;
  source: "quiz_answer" | "interview_correction";
  at: string;
};

export type DynamicQuizAsked = {
  id: string;
  question: string;
  type: "single_choice" | "multi_select";
  options: Array<{ id: string; label: string }>;
  selectedIds: string[];
  selectedLabels: string[];
  reasoning_tag: string;
  hypothesis_targets: string[];
  whyNextQuestion: string;
  informationGain: InformationGain | null;
};

export type DynamicQuizViolationLog = {
  originalQuestion: string;
  originalOptions: string[];
  violations: string[];
  regeneratedQuestion: string | null;
  finalQuestion: string | null;
  reason: string;
};

export const QUIZ_IG_JUDGE_MODEL = "gpt-4o-mini-2024-07-18" as const;
export const QUIZ_IG_JUDGE_PROMPT_VERSION = "analysis_quiz_ig_judge_v1" as const;
export const QUIZ_IG_JUDGE_TIMEOUT_MS = 6_000 as const;
export const QUIZ_IG_JUDGE_MAX_OUTPUT_TOKENS = 80 as const;

export const JUDGE_MATERIAL_DIMENSIONS = [
  "motivation",
  "urgency",
  "barrier",
  "causal_pattern",
  "tradeoff",
  "readiness",
  "competing_hypothesis",
] as const;
export type JudgeMaterialDimension = (typeof JUDGE_MATERIAL_DIMENSIONS)[number];

export type QuizIgJudgeDecision = {
  decision: "ask" | "stop";
  material_dimension: JudgeMaterialDimension[];
  counterfactual_change: boolean;
  short_reason: string;
};

export type QuizIgJudgeLog = {
  askedCount: number;
  candidateQuestion: string;
  candidateOptions: string[];
  intendedInformationTarget: string;
  judge_called: boolean;
  judge_model: string;
  judge_latency: number;
  judge_decision: "ask" | "stop" | null;
  judge_material_dimension: JudgeMaterialDimension[];
  judge_counterfactual_change: boolean | null;
  judge_short_reason: string;
  judge_failure: string | null;
  judge_fallback_used: boolean;
  generatorMs: number;
  combinedMs: number;
};

export type DynamicQuizState = {
  version: typeof DYNAMIC_QUIZ_SCHEMA_VERSION;
  model: string;
  promptVersion: string;
  status: "in_progress" | "complete";
  currentQuestion: {
    id: string;
    question: string;
    type: "single_choice" | "multi_select";
    options: Array<{ id: string; label: string }>;
    reasoning_tag: string;
    hypothesis_targets: string[];
    whyNextQuestion: string;
    informationGain: InformationGain | null;
  } | null;
  asked: DynamicQuizAsked[];
  understanding: QuizUnderstanding;
  prior: QuizPrior | null;
  lastFingerprint: string | null;
  usage: {
    promptTokens: number;
    outputTokens: number;
    regenerations: number;
    openaiMs: number[];
    serverMs: number[];
    judgePromptTokens: number;
    judgeOutputTokens: number;
    judgeMs: number[];
  };
  violationLog: DynamicQuizViolationLog[];
  lifecycleLog: HypothesisLifecycleChange[];
  correctionEvents: CorrectionEvent[];
  hypothesisSeq: HypothesisSeq;
  judgeLog: QuizIgJudgeLog[];
  payoffAnimal?: {
    type: "A" | "B" | "C" | "D" | "E" | "F";
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    source: "dynamic_quiz_interpretation";
    unverified: true;
  } | null;
};

export function emptyQuizUnderstanding(): QuizUnderstanding {
  return {
    observed_signals: [],
    provisional_motivations: [],
    possible_barriers: [],
    possible_tradeoffs: [],
    confidence: "low",
    contradictions: [],
    unresolved_hypotheses: [],
  };
}

export function createInitialDynamicQuiz(model: string): DynamicQuizState {
  return {
    version: DYNAMIC_QUIZ_SCHEMA_VERSION,
    model,
    promptVersion: DYNAMIC_QUIZ_PROMPT_VERSION,
    status: "in_progress",
    currentQuestion: {
      id: DYNAMIC_QUIZ_OPENER.id,
      question: DYNAMIC_QUIZ_OPENER.question,
      type: DYNAMIC_QUIZ_OPENER.type,
      options: DYNAMIC_QUIZ_OPENER.options,
      reasoning_tag: DYNAMIC_QUIZ_OPENER.reasoning_tag,
      hypothesis_targets: [...DYNAMIC_QUIZ_OPENER.hypothesis_targets],
      whyNextQuestion: "",
      informationGain: null,
    },
    asked: [],
    understanding: emptyQuizUnderstanding(),
    prior: null,
    lastFingerprint: null,
    usage: {
      promptTokens: 0,
      outputTokens: 0,
      regenerations: 0,
      openaiMs: [],
      serverMs: [],
      judgePromptTokens: 0,
      judgeOutputTokens: 0,
      judgeMs: [],
    },
    violationLog: [],
    lifecycleLog: [],
    correctionEvents: [],
    hypothesisSeq: emptyHypothesisSeq(),
    judgeLog: [],
  };
}

export function publicQuizQuestion(state: DynamicQuizState) {
  if (!state.currentQuestion) return null;
  return {
    id: state.currentQuestion.id,
    type: state.currentQuestion.type,
    prompt: state.currentQuestion.question,
    options: state.currentQuestion.options,
  };
}

export function compactQuizHistory(state: DynamicQuizState) {
  return state.asked.map((q) => ({
    question: q.question,
    selected: q.selectedLabels,
  }));
}
