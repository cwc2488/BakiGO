"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  QuizCharacterCard,
  QuizPrimaryButton,
  QuizWarmShell,
} from "@/components/quiz/QuizWarmShell";
import type { PersonalityProfile } from "@/lib/quiz/fat-loss/types";
import { clearFatLossQuizSession } from "@/lib/quiz/fat-loss/session-storage";

type PublicQuizResult = {
  resultId: string;
  respondentName: string;
  primary: PersonalityProfile;
  secondary: PersonalityProfile;
  primaryGoalLabel: string;
  readinessLabel: string;
  actionHistoryLabels: string[];
  hasReferrer: boolean;
};

export function FatLossQuizResultPage({ resultId }: { resultId: string }) {
  const [result, setResult] = useState<PublicQuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    clearFatLossQuizSession();
  }, []);

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

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}/quiz/fat-loss`;
  }, []);

  async function handleShare() {
    const title = `我是${result?.primary.animalName}！`;
    const text = result?.primary.headline ?? "你是哪一種瘦不下來的人？";
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch {
        // fall through to copy
      }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (error) {
    return (
      <QuizWarmShell footer="Baki GO · 心理測驗">
        <div className="flex flex-1 flex-col justify-center gap-4 py-10 text-center">
          <p className="text-red-600">{error}</p>
          <Link href="/quiz/fat-loss" className="text-[#c08a98] underline-offset-2 hover:underline">
            重新測驗
          </Link>
        </div>
      </QuizWarmShell>
    );
  }

  if (!result) {
    return (
      <QuizWarmShell footer="Baki GO · 心理測驗">
        <div className="flex flex-1 items-center justify-center py-20 text-[#8b7d74]">載入結果中…</div>
      </QuizWarmShell>
    );
  }

  return (
    <QuizWarmShell footer="Baki GO · 心理測驗破冰工具">
      <div className="flex flex-col gap-8 pb-6 pt-2">
        <section className="rounded-[2rem] border border-[#eadfd6] bg-white/85 p-6 text-center shadow-[0_16px_48px_rgba(47,38,34,0.06)]">
          <p className="text-sm text-[#c08a98]">{result.respondentName} 的減脂卡關人格</p>
          <div className="mt-6">
            <QuizCharacterCard
              emoji={result.primary.emoji}
              animalName={result.primary.animalName}
              tagline={result.primary.tagline}
              accent={result.primary.accent}
              headline={result.primary.headline}
            />
          </div>
          <p className="mt-6 rounded-full bg-[#fff4f7] px-4 py-2 text-sm text-[#6f5f57]">
            你還有 {result.secondary.emoji} {result.secondary.animalName} 傾向
          </p>
        </section>

        <section id="share-card" className="rounded-[2rem] border border-[#eadfd6] bg-[#fff8f2] p-6">
          <div className="flex flex-col items-center text-center">
            <div
              className="mb-4 flex h-36 w-36 items-center justify-center rounded-[2rem] text-6xl shadow-[0_16px_40px_rgba(47,38,34,0.12)]"
              style={{
                background: `linear-gradient(180deg, ${result.primary.accent} 0%, #fff8f2 100%)`,
              }}
            >
              {result.primary.emoji}
            </div>
            <p className="text-xl font-semibold text-[#2f2622]">{result.primary.animalName}</p>
            <p className="mt-2 max-w-sm text-[0.98rem] leading-7 text-[#5f4f47]">{result.primary.headline}</p>
            <p className="mt-4 text-xs text-[#a0897d]">Baki GO · 你是哪一種瘦不下來的人？</p>
          </div>
        </section>

        <section className="space-y-6 rounded-[2rem] border border-[#eadfd6] bg-white/85 p-6">
          <div>
            <h2 className="text-lg font-semibold text-[#2f2622]">你的卡關原因</h2>
            <p className="mt-2 leading-8 text-[#5f4f47]">{result.primary.coreInsight}</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#2f2622]">最容易發生的情境</h2>
            <ul className="mt-2 space-y-2">
              {result.primary.scenarios.map((item) => (
                <li key={item} className="rounded-2xl bg-[#faf6f1] px-4 py-3 text-[0.95rem] leading-7 text-[#5f4f47]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#2f2622]">三個建議</h2>
            <ol className="mt-2 space-y-2">
              {result.primary.suggestions.map((item, index) => (
                <li key={item} className="rounded-2xl bg-[#fff4f7] px-4 py-3 text-[0.95rem] leading-7 text-[#5f4f47]">
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#faf6f1] px-4 py-4">
              <p className="text-xs text-[#a0897d]">核心目標</p>
              <p className="mt-1 font-medium text-[#2f2622]">{result.primaryGoalLabel}</p>
            </div>
            <div className="rounded-2xl bg-[#faf6f1] px-4 py-4">
              <p className="text-xs text-[#a0897d]">改變意願</p>
              <p className="mt-1 font-medium text-[#2f2622]">{result.readinessLabel}</p>
            </div>
          </div>
          {result.actionHistoryLabels.length > 0 ? (
            <div>
              <p className="text-xs text-[#a0897d]">過往嘗試</p>
              <p className="mt-1 text-[0.95rem] leading-7 text-[#5f4f47]">
                {result.actionHistoryLabels.join("、")}
              </p>
            </div>
          ) : null}
        </section>

        <div className="space-y-3">
          <QuizPrimaryButton onClick={() => void handleShare()}>
            {copied ? "已複製連結" : "分享給朋友測測看"}
          </QuizPrimaryButton>
          {result.hasReferrer ? (
            <Link
              href="/customers"
              className="block w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-5 py-4 text-center text-base font-semibold text-[#2f2622]"
            >
              解鎖我的下一步
            </Link>
          ) : (
            <Link
              href="/quiz/fat-loss"
              className="block w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-5 py-4 text-center text-base font-semibold text-[#2f2622]"
            >
              解鎖我的下一步
            </Link>
          )}
        </div>
      </div>
    </QuizWarmShell>
  );
}
