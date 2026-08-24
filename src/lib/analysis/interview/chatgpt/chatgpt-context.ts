import type { InterviewSessionState } from "@/lib/analysis/interview/interview-contract";
import { compactTranscript } from "@/lib/analysis/interview/interview-reasoner";
import { detectDirectUserQuestion } from "@/lib/analysis/interview/native/native-validate";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

/** Conversation + unverified prior only. No field agenda, no gap, no coverage. */
export function buildChatgptUserPrompt(input: {
  quiz: {
    animalName: string;
    tagline: string;
    headline: string;
    coreInsight: string;
    primaryGoal: string | null;
    readiness: string | null;
    quizPrior?: unknown;
    quizHistory?: Array<{ question: string; selected: string[] }>;
  };
  state: InterviewSessionState;
  currentAnswer: string;
  userTurnId: string;
  userTurnCount: number;
  contractRepair?: { violations: string[]; note: string };
  event?: "quiz_complete";
}): string {
  const userMove = detectDirectUserQuestion(input.currentAnswer);
  const payload: Record<string, unknown> = {
    you_may_ask_zero_questions: true,
    unverified_background: {
      note: "Useful starting hypothesis only. Latest spoken words win. May be fully overturned.",
      opening: input.quiz.coreInsight || input.quiz.headline || null,
      quiz_prior: input.quiz.quizPrior ?? null,
      quiz_answer_history: input.quiz.quizHistory ?? [],
    },
    recent_conversation: compactTranscript(input.state.turns, {
      currentTurnId: input.userTurnId,
      currentAnswer: input.currentAnswer,
    }),
    latest_user_message: input.currentAnswer,
    if_user_asked_something: userMove
      ? userMove === "challenge"
        ? "Explain why you wanted to understand, then give them the choice. Do not interview them."
        : userMove === "cost"
          ? "Answer first: this stage is understanding, not a quote. No official price is in context. Do not invent gym or product prices."
          : "Answer them first, in a statement. After that you may stop. Do not dodge with a new question."
      : null,
  };
  if (input.contractRepair) payload.boundary_repair = input.contractRepair;
  if (input.event === "quiz_complete") {
    payload.latest_user_message = "";
    payload.note =
      "Multiple-choice just ended. Talk like a person who read those answers as guesses, not a verdict.";
  }
  void (input.quiz.quizPrior as QuizPrior | null);
  return JSON.stringify(payload);
}
