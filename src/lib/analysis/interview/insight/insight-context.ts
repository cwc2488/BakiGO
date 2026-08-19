import type { InsightSessionState } from "@/lib/analysis/interview/insight/insight-contract";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

export function buildInsightUserPrompt(input: {
  state: InsightSessionState;
  currentAnswer: string;
  quizPrior?: QuizPrior | null;
  quizHistory?: Array<{ question: string; selected: string[] }>;
  opening?: string | null;
  contractRepair?: { violations: string[]; note: string };
}): string {
  const payload: Record<string, unknown> = {
    task: "Update your private hypothesis, then speak only if the visible line adds understanding.",
    conversation: input.state.turns.map((t) => ({
      role: t.role,
      text: t.text,
    })),
    latest_user_message: input.currentAnswer,
    previous_private_reasoning: input.state.reasoning,
    unverified_quiz_background: {
      note: "Starting guesses only. May be fully wrong. Do not let this re-anchor the conversation if spoken evidence moved.",
      opening: input.opening ?? null,
      prior_one_liners: compactPrior(input.quizPrior),
      answer_history: (input.quizHistory ?? []).slice(-8),
    },
    moves: ["listen", "connect", "challenge", "hypothesize", "clarify", "answer", "stop", "ask"],
    ask_is_not_default: true,
  };
  if (input.contractRepair) payload.boundary_repair = input.contractRepair;
  return JSON.stringify(payload);
}

function compactPrior(prior: QuizPrior | null | undefined) {
  if (!prior) return null;
  return {
    unverified: true,
    motivation: prior.likely_primary_motivation?.claim ?? null,
    barriers: (prior.likely_barriers ?? []).map((b) => b.claim).slice(0, 3),
    contradictions: prior.contradictions ?? [],
  };
}
