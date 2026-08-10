import { Suspense } from "react";
import { FatLossQuizStartPage } from "@/components/quiz/FatLossQuizStartPage";

function StartFallback() {
  return (
    <div className="flex min-h-full items-center justify-center bg-[#faf6f1] text-[#8b7d74]">
      載入中…
    </div>
  );
}

export default function FatLossQuizStartRoute() {
  return (
    <Suspense fallback={<StartFallback />}>
      <FatLossQuizStartPage />
    </Suspense>
  );
}
