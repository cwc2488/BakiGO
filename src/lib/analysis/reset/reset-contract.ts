import {
  RESET_CONVERSATION_PROMPT_VERSION,
  RESET_HARD_MAX_TURNS,
  RESET_META_KEY,
  RESET_MODEL,
  RESET_OPENING,
  RESET_SCHEMA_VERSION,
} from "@/lib/analysis/reset/reset-path";
import {
  RESET_QUIZ_QUESTIONS,
  RESET_QUIZ_VERSION,
  type ResetQuizAnswerRecord,
  type ResetQuizV2Result,
} from "@/lib/analysis/reset/reset-quiz";
import type { ResetAnimalCopy } from "@/lib/analysis/reset/reset-animals";
import type { Experience21dPublicHandoff } from "@/lib/analysis/handoff/experience-21d-invitation";

export type ResetAct = "quiz" | "reveal" | "conversation" | "report";

export type ResetTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

export type ResetPrivateReasoning = {
  current_hypothesis: string;
  evidence_for: string[];
  evidence_against: string[];
  what_changed: string;
  unresolved_core_question: string;
  ready_to_close: boolean;
};

export type ResetQuizState = {
  version: typeof RESET_QUIZ_VERSION;
  answers: ResetQuizAnswerRecord[];
  currentQuestionId: string;
  result: ResetQuizV2Result | null;
};

export type ResetConversationState = {
  turns: ResetTurn[];
  private: ResetPrivateReasoning | null;
  userTurnCount: number;
  complete: boolean;
  completionReason: "model_close" | "hard_max" | null;
};

export type ResetReport = {
  version: string;
  why_now: string;
  bottleneck: string;
  first_change: string;
};

export type ResetUsage = {
  conversationInputTokens: number;
  conversationOutputTokens: number;
  reportInputTokens: number;
  reportOutputTokens: number;
  conversationLatenciesMs: number[];
  reportLatencyMs: number | null;
};

export type ResetSession = {
  version: typeof RESET_SCHEMA_VERSION;
  promptVersion: typeof RESET_CONVERSATION_PROMPT_VERSION;
  model: typeof RESET_MODEL;
  act: ResetAct;
  quiz: ResetQuizState;
  animal: ResetAnimalCopy | null;
  conversation: ResetConversationState;
  report: ResetReport | null;
  usage: ResetUsage;
  safety: { flagged: boolean; guidance: string | null };
};

export function emptyPrivateReasoning(): ResetPrivateReasoning {
  return {
    current_hypothesis: "",
    evidence_for: [],
    evidence_against: [],
    what_changed: "",
    unresolved_core_question: "",
    ready_to_close: false,
  };
}

export function createInitialResetSession(): ResetSession {
  return {
    version: RESET_SCHEMA_VERSION,
    promptVersion: RESET_CONVERSATION_PROMPT_VERSION,
    model: RESET_MODEL,
    act: "quiz",
    quiz: {
      version: RESET_QUIZ_VERSION,
      answers: [],
      currentQuestionId: RESET_QUIZ_QUESTIONS[0]!.id,
      result: null,
    },
    animal: null,
    conversation: {
      turns: [],
      private: null,
      userTurnCount: 0,
      complete: false,
      completionReason: null,
    },
    report: null,
    usage: {
      conversationInputTokens: 0,
      conversationOutputTokens: 0,
      reportInputTokens: 0,
      reportOutputTokens: 0,
      conversationLatenciesMs: [],
      reportLatencyMs: null,
    },
    safety: { flagged: false, guidance: null },
  };
}

export function openingAssistantTurn(): ResetTurn {
  return {
    id: "a_open",
    role: "assistant",
    text: RESET_OPENING,
    createdAt: new Date().toISOString(),
  };
}

export function isResetSession(raw: Record<string, unknown> | null | undefined): boolean {
  const meta = raw?.[RESET_META_KEY];
  return Boolean(
    meta &&
      typeof meta === "object" &&
      (meta as { version?: string }).version === RESET_SCHEMA_VERSION,
  );
}

export function readResetSession(
  raw: Record<string, unknown> | null | undefined,
): ResetSession | null {
  if (!isResetSession(raw)) return null;
  return raw![RESET_META_KEY] as ResetSession;
}

export function packResetSession(session: ResetSession): Record<string, unknown> {
  return { [RESET_META_KEY]: session };
}

export type ResetPublicView = {
  kind: "reset";
  act: ResetAct;
  quiz: {
    current: number;
    total: number;
    question: { id: string; text: string; support?: string; options: Array<{ id: string; label: string }> } | null;
  };
  animal: ResetAnimalCopy | null;
  conversation: {
    turns: ResetTurn[];
    complete: boolean;
  };
  report: ResetReport | null;
  thinkingCopy: string;
  safetyGuidance: string | null;
  handoff?: Experience21dPublicHandoff | null;
};

export function toPublicView(session: ResetSession): ResetPublicView {
  const index = RESET_QUIZ_QUESTIONS.findIndex((q) => q.id === session.quiz.currentQuestionId);
  const question = RESET_QUIZ_QUESTIONS[index] ?? null;
  return {
    kind: "reset",
    act: session.act,
    quiz: {
      current: session.quiz.answers.length + (session.act === "quiz" ? 1 : 0),
      total: RESET_QUIZ_QUESTIONS.length,
      question:
        session.act === "quiz" && question
          ? {
              id: question.id,
              text: question.text,
              support: question.support,
              options: question.options.map((o) => ({ id: o.id, label: o.label })),
            }
          : null,
    },
    animal: session.animal,
    conversation: {
      turns: session.conversation.turns,
      complete: session.conversation.complete,
    },
    report: session.report,
    thinkingCopy: "正在想你剛剛這句……",
    safetyGuidance: session.safety.guidance,
  };
}
