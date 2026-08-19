import {
  INSIGHT_HARD_MAX_TURNS,
  createInitialInsightSession,
  type InsightSessionState,
  type InsightTurn,
} from "@/lib/analysis/interview/insight/insight-contract";
import { generateInsightTurn } from "@/lib/analysis/interview/insight/insight-provider";
import {
  looksLikeParaphraseOnly,
  stripUnsafeMedicalCopy,
  validateInsightTurn,
} from "@/lib/analysis/interview/insight/insight-validate";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

export async function processInsightAnswer(input: {
  state: InsightSessionState;
  value: string;
  quizPrior?: QuizPrior | null;
  quizHistory?: Array<{ question: string; selected: string[] }>;
  opening?: string | null;
}): Promise<{
  state: InsightSessionState;
  complete: boolean;
  spoken: string;
  regenerated: boolean;
  paraphraseOnlyObservation: boolean;
  inputTokens: number;
  outputTokens: number;
  openaiMs: number;
  serverMs: number;
  move: string;
}> {
  const text = input.value.trim();
  if (!text) throw new Error("invalid_answer:請用一句話回答。");
  if (text.length > 400) throw new Error("invalid_answer:請控制在 400 字以內。");

  const userTurn = {
    id: `u_${input.state.turns.length + 1}`,
    role: "user" as const,
    text,
    createdAt: new Date().toISOString(),
  };
  let state: InsightSessionState = {
    ...input.state,
    turns: [...input.state.turns, userTurn],
  };

  const generateArgs = {
    state,
    currentAnswer: text,
    quizPrior: input.quizPrior ?? null,
    quizHistory: input.quizHistory ?? [],
    opening: input.opening ?? null,
  };

  let native: InsightTurn;
  let usedFixture = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let openaiMs = 0;
  let regenerated = false;
  const wall = Date.now();

  try {
    const generated = await generateInsightTurn(generateArgs);
    native = generated.output;
    usedFixture = generated.usedFixture;
    inputTokens = generated.inputTokens;
    outputTokens = generated.outputTokens;
    openaiMs = generated.openaiMs;
    state = { ...state, aiCallCount: state.aiCallCount + 1 };
  } catch {
    native = {
      private_reasoning: {
        surface_statement: text.slice(0, 80),
        current_best_hypothesis: state.reasoning?.current_best_hypothesis ?? "",
        evidence_for: [],
        evidence_against: [],
        contradictions: [],
        possible_deeper_driver: "",
        confidence: "low",
        what_changed_this_turn: "llm_unavailable",
        most_valuable_next_move: "listen",
      },
      assistant_response: "我這邊沒接到完整回覆。你可以用一句話再講一次。",
      safety_signal: { needs_boundary: false, reason: null },
    };
    state = { ...state, usedFallback: true };
  }

  let validation = validateInsightTurn(native);
  if (!usedFixture && validation.violations.length) {
    try {
      const repaired = await generateInsightTurn({
        ...generateArgs,
        contractRepair: {
          violations: validation.violations,
          note: "Fix only medical safety or stacked interrogation. Do not rewrite into an interview template. Do not drop a real hypothesis to become safer-sounding paraphrase.",
        },
      });
      native = repaired.output;
      inputTokens += repaired.inputTokens;
      outputTokens += repaired.outputTokens;
      openaiMs += repaired.openaiMs;
      regenerated = !repaired.usedFixture;
      state = { ...state, aiCallCount: state.aiCallCount + 1 };
      validation = validateInsightTurn(native);
    } catch {
      // Keep the original LLM utterance.
    }
  }
  if (validation.violations.includes("unsafe_medical")) {
    native = { ...native, assistant_response: stripUnsafeMedicalCopy(native.assistant_response) };
  }

  const spoken = native.assistant_response.trim();
  const medical = /醫生|醫師|血糖|紅字|吃藥/.test(text);
  const userTurns = state.turns.filter((t) => t.role === "user").length;
  const atHardMax = userTurns >= INSIGHT_HARD_MAX_TURNS;
  const modelStop = native.private_reasoning.most_valuable_next_move === "stop" && Boolean(spoken);
  const complete = atHardMax || modelStop;

  state = {
    ...state,
    reasoning: native.private_reasoning,
    reasoningHistory: [...state.reasoningHistory, native.private_reasoning].slice(-10),
    pendingResponse: spoken,
    completionReason: complete ? (atHardMax ? "hard_max" : "model_stop") : null,
    safety: {
      flagged: state.safety.flagged || native.safety_signal.needs_boundary || medical,
      userReportedMedical: state.safety.userReportedMedical || medical,
    },
    turns: spoken
      ? [
          ...state.turns,
          {
            id: `a_${state.turns.length + 1}`,
            role: "assistant",
            text: spoken,
            createdAt: new Date().toISOString(),
          },
        ]
      : state.turns,
  };

  return {
    state,
    complete,
    spoken,
    regenerated,
    paraphraseOnlyObservation: looksLikeParaphraseOnly(text, spoken),
    inputTokens,
    outputTokens,
    openaiMs,
    serverMs: Date.now() - wall,
    move: native.private_reasoning.most_valuable_next_move,
  };
}

export { createInitialInsightSession };
