"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { QuizPrimaryButton, QuizWarmShell } from "@/components/quiz/QuizWarmShell";
import {
  getShareParams,
  saveFatLossQuizSession,
} from "@/lib/quiz/fat-loss/session-storage";

export function FatLossQuizStartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart(event: React.FormEvent) {
    event.preventDefault();
    if (!nickname.trim()) {
      setError("請輸入暱稱");
      return;
    }

    setLoading(true);
    setError(null);
    const share = getShareParams(searchParams);

    try {
      const response = await fetch("/api/quiz/responses/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondentName: nickname.trim(),
          shareCode: share.shareCode,
          referrerMemberId: share.referrerMemberId,
        }),
      });
      const payload = (await response.json()) as { responseId?: string; error?: string };
      if (!response.ok || !payload.responseId) {
        throw new Error(payload.error ?? "無法開始測驗");
      }

      saveFatLossQuizSession({
        responseId: payload.responseId,
        respondentName: nickname.trim(),
        shareCode: share.shareCode,
      });
      router.push("/quiz/fat-loss/question/1");
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "無法開始測驗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <QuizWarmShell>
      <form className="flex flex-1 flex-col gap-6 py-6" onSubmit={handleStart}>
        <div>
          <p className="text-sm text-[#c08a98]">開始之前</p>
          <h1 className="mt-2 text-[1.75rem] font-semibold text-[#2f2622]">我們怎麼稱呼你？</h1>
          <p className="mt-3 text-[0.98rem] leading-7 text-[#6f5f57]">
            暱稱會顯示在結果頁。第一版不需要留下聯絡方式。
          </p>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f4f47]">暱稱（必填）</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="例如：小安"
            className="w-full rounded-[1.25rem] border border-[#eadfd6] bg-white px-4 py-4 text-base outline-none focus:border-[#f0a8b8]"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <QuizPrimaryButton type="submit" disabled={loading}>
          {loading ? "準備中…" : "開始 12 題測驗"}
        </QuizPrimaryButton>
      </form>
    </QuizWarmShell>
  );
}
