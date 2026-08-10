"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QuizWarmShell } from "@/components/quiz/QuizWarmShell";
import type { PersonalityProfile } from "@/lib/quiz/fat-loss/types";

type PublicQuizResult = {
  resultId: string;
  respondentName: string;
  primary: PersonalityProfile;
  hasReferrer: boolean;
};

function buildNextStepAdvice(primary: PersonalityProfile): string {
  const firstSuggestion = primary.suggestions[0];
  if (firstSuggestion) {
    return `以你的 ${primary.animalName} 類型來說，建議先從這裡開始：${firstSuggestion}。`;
  }
  return primary.aiDirection;
}

export function FatLossQuizNextStepPage({ resultId }: { resultId: string }) {
  const [result, setResult] = useState<PublicQuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/quiz/results/${resultId}`);
        const payload = (await response.json()) as { ok?: boolean; result?: PublicQuizResult; error?: string };
        if (!response.ok || !payload.result) {
          throw new Error(payload.error ?? "無法載入結果");
        }
        if (!cancelled) {
          setResult(payload.result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "無法載入結果");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  if (error) {
    return (
      <QuizWarmShell footer="Baki GO · 心理測驗">
        <div className="flex flex-1 flex-col justify-center gap-4 py-10 text-center">
          <p className="text-red-600">{error}</p>
          <Link href={`/quiz/fat-loss/result/${resultId}`} className="text-[#c08a98] underline-offset-2 hover:underline">
            返回結果頁
          </Link>
        </div>
      </QuizWarmShell>
    );
  }

  if (!result) {
    return (
      <QuizWarmShell footer="Baki GO · 心理測驗">
        <div className="flex flex-1 items-center justify-center py-20 text-[#8b7d74]">載入中…</div>
      </QuizWarmShell>
    );
  }

  return (
    <QuizWarmShell footer="Baki GO · 心理測驗破冰工具">
      <div className="flex flex-col gap-8 pb-6 pt-2">
        <section className="rounded-[2rem] border border-[#eadfd6] bg-white/85 p-6 shadow-[0_16px_48px_rgba(47,38,34,0.06)]">
          <p className="text-sm text-[#c08a98]">{result.respondentName} 的下一步</p>
          <h1 className="mt-3 text-[1.5rem] font-semibold leading-8 text-[#2f2622]">你的下一步建議</h1>
          <p className="mt-4 text-[0.98rem] leading-8 text-[#5f4f47]">{buildNextStepAdvice(result.primary)}</p>
          <p className="mt-4 rounded-2xl bg-[#fff4f7] px-4 py-4 text-[0.95rem] leading-7 text-[#5f4f47]">
            {result.primary.aiDirection}
          </p>
        </section>

        {result.hasReferrer ? (
          <section className="rounded-[2rem] border border-[#eadfd6] bg-[#fff8f2] p-6">
            <h2 className="text-lg font-semibold text-[#2f2622]">跟分享測驗的人聊聊</h2>
            <p className="mt-3 text-[0.98rem] leading-8 text-[#5f4f47]">
              你是透過朋友的連結完成測驗的。可以主動跟對方分享你的 {result.primary.animalName}{" "}
              結果，一起討論最適合你的下一步。
            </p>
          </section>
        ) : null}

        <div className="space-y-3">
          <Link
            href={`/quiz/fat-loss/result/${resultId}`}
            className="block w-full rounded-[1.25rem] bg-[#2f2622] px-5 py-4 text-center text-base font-semibold text-white transition active:scale-[0.98]"
          >
            返回我的結果
          </Link>
        </div>
      </div>
    </QuizWarmShell>
  );
}
