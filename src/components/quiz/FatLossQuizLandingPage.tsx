"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { QuizPrimaryButton, QuizWarmShell } from "@/components/quiz/QuizWarmShell";

export function FatLossQuizLandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleStart() {
    const query = searchParams.toString();
    router.push(query ? `/quiz/fat-loss/start?${query}` : "/quiz/fat-loss/start");
  }

  return (
    <QuizWarmShell footer="Baki GO · 心理測驗破冰工具">
      <div className="flex flex-1 flex-col justify-center gap-8 py-8">
        <div className="rounded-[2rem] border border-[#eadfd6] bg-white/80 p-6 shadow-[0_16px_48px_rgba(47,38,34,0.06)]">
          <p className="text-sm font-medium text-[#c08a98]">Baki GO 心理測驗</p>
          <h1 className="mt-3 text-[2rem] font-semibold leading-tight text-[#2f2622]">
            你是哪一種
            <br />
            瘦不下來的人？
          </h1>
          <p className="mt-4 text-[1rem] leading-8 text-[#6f5f57]">12 題，找出真正讓你卡住的原因</p>
          <div className="mt-6 grid grid-cols-3 gap-2 text-center text-2xl">
            {["🐘", "🦥", "🐰", "🐹", "🐼", "🐆"].map((emoji) => (
              <div
                key={emoji}
                className="rounded-2xl bg-[#fff7f2] py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
              >
                {emoji}
              </div>
            ))}
          </div>
        </div>
        <QuizPrimaryButton onClick={handleStart}>開始測驗</QuizPrimaryButton>
        <p className="text-center text-sm leading-7 text-[#8b7d74]">
          有趣、準、可分享 — 找出你的減脂卡關動物人格
        </p>
      </div>
    </QuizWarmShell>
  );
}
