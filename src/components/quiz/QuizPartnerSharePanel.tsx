"use client";

import { useCallback, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

export function QuizPartnerSharePanel({
  shareCode,
  href,
  display,
}: {
  shareCode: string;
  href: string;
  display: string;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [href]);

  const share = useCallback(async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "你比較像哪一種動物？",
          text: "6 個生活情境，看看你在想改變自己的時候，最容易進入哪一種模式。",
          url: href,
        });
        setShared(true);
        return;
      } catch {
        /* user cancel or unsupported payload */
      }
    }
    await copy();
  }, [copy, href]);

  return (
    <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
      <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">我的心理測驗</h2>
      <p className="mt-2 text-[0.9375rem] leading-7 text-[#636366]">
        把心理測驗分享給朋友。如果對方完成分析並想了解 21 天，會自動出現在你的名單。
      </p>
      <p className="mt-5 break-all rounded-2xl bg-[#faf6f1] px-4 py-3 text-center text-[1.0625rem] font-semibold tracking-wide text-[#1d1d1f]">
        {display}
      </p>
      <p className="mt-2 text-center text-[0.75rem] text-[#86868b]">專屬短連結 · 不會變</p>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-12 rounded-2xl bg-[#1d1d1f] px-4 text-[0.9375rem] font-semibold text-white"
        >
          {copied ? "已複製" : "複製連結"}
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="min-h-12 rounded-2xl border border-[#eadfd6] bg-white px-4 text-[0.9375rem] font-semibold text-[#1d1d1f]"
        >
          {shared ? "已分享" : "分享"}
        </button>
      </div>
      <p className="sr-only">{shareCode}</p>
    </section>
  );
}
