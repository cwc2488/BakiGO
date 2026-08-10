"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
} from "@/lib/quiz/fat-loss/session-storage";

function FatLossQuizQuestionContent({
  question,
  questionNumber,
}: {
  question: QuizQuestion;
  questionNumber: number;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<FatLossQuizAnswers>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const currentValue = answers[String(questionNumber)];

  const selectedIds = useMemo(() => {
    if (Array.isArray(currentValue)) {
      return currentValue;
    }
    return currentValue ? [currentValue] : [];
  }, [currentValue]);

  function toggleOption(optionId: string) {
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
    setAnswers((prev) => ({ ...prev, [String(questionNumber)]: optionId }));
  }

  async function persistAndContinue() {
    const session = loadFatLossQuizSession();
    if (!session) {
      router.replace("/quiz/fat-loss/start");
      return;
    }

    setLoading(true);
    setError(null);
    const mergedAnswers = { ...answers, [String(questionNumber)]: currentValue };
    setAnswers(mergedAnswers);

    try {
      await fetch(`/api/quiz/responses/${session.responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: mergedAnswers }),
      });

      saveFatLossQuizSession({ ...session, answers: mergedAnswers });

      if (questionNumber >= FAT_LOSS_QUESTIONS.length) {
        const completeResponse = await fetch(`/api/quiz/responses/${session.responseId}/complete`, {
          method: "POST",
        });
        const payload = (await completeResponse.json()) as { resultId?: string; error?: string };
        if (!completeResponse.ok || !payload.resultId) {
          throw new Error(payload.error ?? "無法完成測驗");
        }
        router.push(`/quiz/fat-loss/result/${payload.resultId}`);
        return;
      }

      router.push(`/quiz/fat-loss/question/${questionNumber + 1}`);
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : "儲存失敗");
    } finally {
      setLoading(false);
    }
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
        <div className="mt-6">
          <QuizPrimaryButton disabled={!canContinue || loading} onClick={() => void persistAndContinue()}>
            {loading ? "處理中…" : questionNumber >= FAT_LOSS_QUESTIONS.length ? "查看結果" : "下一題"}
          </QuizPrimaryButton>
        </div>
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
