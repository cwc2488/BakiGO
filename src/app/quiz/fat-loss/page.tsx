import type { Metadata } from "next";
import { Suspense } from "react";
import { FatLossQuizLandingPage } from "@/components/quiz/FatLossQuizLandingPage";

export const metadata: Metadata = {
  title: "你是哪一種瘦不下來的人？ | Baki GO",
  description: "12 題，找出真正讓你卡住的原因。",
};

function LandingFallback() {
  return (
    <div className="flex min-h-full items-center justify-center bg-[#faf6f1] text-[#8b7d74]">
      載入中…
    </div>
  );
}

export default function FatLossQuizLandingRoute() {
  return (
    <Suspense fallback={<LandingFallback />}>
      <FatLossQuizLandingPage />
    </Suspense>
  );
}
