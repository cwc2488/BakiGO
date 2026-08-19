import type { InterviewSessionState } from "@/lib/analysis/interview/interview-contract";
import { compactTranscript } from "@/lib/analysis/interview/interview-reasoner";
import {
  compactActiveHypotheses,
  compactConfirmedFacts,
} from "@/lib/analysis/interview/interview-quality";
import { isFact } from "@/lib/analysis/interview/understanding-state";
import { detectDirectUserQuestion } from "@/lib/analysis/interview/native/native-validate";
import { splitQuizPriorForInterview } from "@/lib/analysis/dynamic-quiz/quiz-prior-lifecycle";
import type { QuizPrior } from "@/lib/analysis/dynamic-quiz/dynamic-quiz-contract";

export function buildNativeUserPrompt(input: {
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
  const facts = compactConfirmedFacts(input.state.understanding);
  const hypotheses = compactActiveHypotheses(input.state.understanding);
  const tensions: string[] = [];
  const u = input.state.understanding;
  if (isFact(u.immediate_trigger) && isFact(u.deeper_motivation) && u.immediate_trigger.value !== u.deeper_motivation.value) {
    tensions.push("trigger_and_motivation_may_differ");
  }
  if (input.state.safety.flagged || isFact(u.safety_context)) {
    tensions.push("medical_or_lab_context_is_safety_not_a_treatment_topic");
  }
  const userMove = detectDirectUserQuestion(input.currentAnswer);

  const payload: Record<string, unknown> = {
    output_contract: {
      visible_field: "assistant_response",
      max_interrogative_intents: 1,
      may_ask_zero_questions: true,
      answer_user_question_first: true,
      challenge_returns_control: true,
    },
    consultant_constraints: {
      max_interrogative_intents: 1,
      questions_are_optional: true,
      newest_information_wins: true,
      do_not_fill_empty_schema: true,
      do_not_write_questionnaire: true,
    },
    unverified_prior: {
      label: "UNVERIFIED PRIOR — useful starting hypothesis, not user-confirmed fact. Latest human evidence wins.",
      icebreaker: {
        animal: input.quiz.animalName,
        tagline: input.quiz.tagline,
        core_insight: input.quiz.coreInsight,
      },
      quiz_prior: input.quiz.quizPrior ?? null,
      quiz_prior_lifecycle: splitQuizPriorForInterview(
        (input.quiz.quizPrior ?? null) as QuizPrior | null,
      ),
      quiz_answer_history: input.quiz.quizHistory ?? [],
      latest_human_correction_wins: true,
    },
    confirmed_facts: facts,
    active_hypotheses: hypotheses,
    tensions,
    recent_conversation: compactTranscript(input.state.turns, {
      currentTurnId: input.userTurnId,
      currentAnswer: input.currentAnswer,
    }),
    latest_user_message: input.currentAnswer,
    latest_user_move: userMove
      ? {
          kind: userMove,
          instruction:
            userMove === "challenge"
              ? "Explain why you were asking, then return control. Do not ask a new content question."
              : "Answer this user question first in a statement. Do not bounce it back.",
        }
      : { kind: "statement", instruction: "Treat this newest message as potentially replacing the previous topic." },
    turn: input.userTurnId,
    n: input.userTurnCount,
  };
  if (input.contractRepair) {
    payload.contract_repair = input.contractRepair;
  }
  if (input.event === "quiz_complete") {
    payload.event = {
      kind: "quiz_complete",
      instruction:
        "選擇題剛結束。用一句自然的顧問開場，把 Quiz Prior 當假設而不是結論。不要說測驗顯示你就是。可以反映假設並邀請對方用自己的話開始。最多一個問題。",
    };
    payload.latest_user_message = "";
  }
  if (input.userTurnCount >= 6) {
    payload.compact_summary = {
      facts,
      hypotheses,
      safety: input.state.safety.flagged || isFact(u.safety_context),
    };
  }
  return JSON.stringify(payload);
}
