"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  QuizOptionButton,
  QuizPrimaryButton,
  QuizProgressBar,
  QuizWarmShell,
} from "@/components/quiz/QuizWarmShell";
import { FAT_LOSS_QUESTIONS, type QuizQuestion } from "@/lib/quiz/fat-loss/questions";
import type { FatLossQuizAnswers } from "@/lib/quiz/fat-loss/types";
import {
  loadFatLossQuizSession,
  saveFatLossQuizSession,
  type FatLossQuizSession,
} from "@/lib/quiz/fat-loss/session-storage";

const ADVANCE_DELAY_MS = 150;

function persistAnswersInBackground(responseId: string, answers: FatLossQuizAnswers): Promise<void> {
  return fetch(`/api/quiz/responses/${responseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Failed to save answers");
    }
  });
}

function FatLossQuizQuestionContent({
  question,
  questionNumber,
}: {
  question: QuizQuestion;
  questionNumber: number;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<FatLossQuizAnswers>({});
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const session = loadFatLossQuizSession();
    if (!session) {
      router.replace("/quiz/fat-loss/start");
      return;
    }
    if (session.answers) {
      setAnswers(session.answers as FatLossQuizAnswers);
    }
  }, [router]);

  useEffect(() => {
    if (questionNumber < FAT_LOSS_QUESTIONS.length) {
      router.prefetch(`/quiz/fat-loss/question/${questionNumber + 1}`);
    }
  }, [questionNumber, router]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const currentValue = answers[String(questionNumber)];

  const selectedIds = useMemo(() => {
    if (Array.isArray(currentValue)) {
      return currentValue;
    }
    return currentValue ? [currentValue] : [];
  }, [currentValue]);

  const saveLocally = useCallback((mergedAnswers: FatLossQuizAnswers) => {
    const session = loadFatLossQuizSession();
    if (!session) {
      return null;
    }
    saveFatLossQuizSession({ ...session, answers: mergedAnswers });
    return session;
  }, []);

  const completeQuiz = useCallback(
    async (session: FatLossQuizSession, mergedAnswers: FatLossQuizAnswers) => {
      setAdvancing(true);
      setError(null);
      try {
        await persistAnswersInBackground(session.responseId, mergedAnswers);
        const completeResponse = await fetch(`/api/quiz/responses/${session.responseId}/complete`, {
          method: "POST",
        });
        const payload = (await completeResponse.json()) as { resultId?: string; error?: string };
        if (!completeResponse.ok || !payload.resultId) {
          throw new Error(payload.error ?? "無法完成測驗");
        }
        router.push(`/quiz/fat-loss/result/${payload.resultId}`);
      } catch (continueError) {
        setAdvancing(false);
        setError(continueError instanceof Error ? continueError.message : "儲存失敗");
      }
    },
    [router],
  );

  const scheduleAdvance = useCallback(
    (mergedAnswers: FatLossQuizAnswers) => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }

      const session = saveLocally(mergedAnswers);
      if (!session) {
        router.replace("/quiz/fat-loss/start");
        return;
      }

      setAdvancing(true);
      setError(null);

      advanceTimerRef.current = window.setTimeout(() => {
        if (questionNumber >= FAT_LOSS_QUESTIONS.length) {
          void completeQuiz(session, mergedAnswers);
          return;
        }

        void persistAnswersInBackground(session.responseId, mergedAnswers).catch(() => {
          // sessionStorage keeps answers; user can retry on next page if needed
        });
        router.push(`/quiz/fat-loss/question/${questionNumber + 1}`);
      }, ADVANCE_DELAY_MS);
    },
    [completeQuiz, questionNumber, router, saveLocally],
  );

  function toggleOption(optionId: string) {
    if (advancing) {
      return;
    }

    if (question.type === "multi") {
      const current = Array.isArray(currentValue) ? currentValue : [];
      if (optionId === "none") {
        setAnswers((prev) => ({ ...prev, [String(questionNumber)]: ["none"] }));
        return;
      }
      const withoutNone = current.filter((item) => item !== "none");
      const next = withoutNone.includes(optionId)
        ? withoutNone.filter((item) => item !== optionId)
        : [...withoutNone, optionId];
      setAnswers((prev) => ({ ...prev, [String(questionNumber)]: next }));
      return;
    }

    const mergedAnswers = { ...answers, [String(questionNumber)]: optionId };
    setAnswers(mergedAnswers);
    scheduleAdvance(mergedAnswers);
  }

  function persistAndContinue() {
    if (advancing) {
      return;
    }

    const session = loadFatLossQuizSession();
    if (!session) {
      router.replace("/quiz/fat-loss/start");
      return;
    }

    const mergedAnswers = { ...answers, [String(questionNumber)]: currentValue };
    setAnswers(mergedAnswers);
    scheduleAdvance(mergedAnswers);
  }

  const canContinue =
    question.type === "multi"
      ? Array.isArray(currentValue) && currentValue.length > 0
      : Boolean(currentValue);

  return (
    <QuizWarmShell>
      <div className="flex flex-1 flex-col py-4">
        <QuizProgressBar current={questionNumber} total={FAT_LOSS_QUESTIONS.length} />
        <h1 className="text-[1.4rem] font-semibold leading-8 text-[#2f2622]">{question.text}</h1>
        <div className="mt-6 flex flex-1 flex-col gap-3">
          {question.options.map((option) => (
            <QuizOptionButton
              key={option.id}
              selected={selectedIds.includes(option.id)}
              onClick={() => toggleOption(option.id)}
            >
              {option.label}
            </QuizOptionButton>
          ))}
        </div>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {question.type === "multi" ? (
          <div className="mt-6">
            <QuizPrimaryButton disabled={!canContinue || advancing} onClick={persistAndContinue}>
              {advancing
                ? questionNumber >= FAT_LOSS_QUESTIONS.length
                  ? "計算結果中…"
                  : "下一題…"
                : questionNumber >= FAT_LOSS_QUESTIONS.length
                  ? "查看結果"
                  : "下一題"}
            </QuizPrimaryButton>
          </div>
        ) : advancing && questionNumber >= FAT_LOSS_QUESTIONS.length ? (
          <p className="mt-6 text-center text-sm text-[#8b7d74]">計算結果中…</p>
        ) : null}
      </div>
    </QuizWarmShell>
  );
}

export function FatLossQuizQuestionPage({ questionNumber }: { questionNumber: number }) {
  const question = FAT_LOSS_QUESTIONS.find((item) => item.number === questionNumber);
  if (!question) {
    return null;
  }
  return <FatLossQuizQuestionContent question={question} questionNumber={questionNumber} />;
}
