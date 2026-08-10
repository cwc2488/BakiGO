import { Suspense } from "react";
import { FatLossQuizLandingPage } from "@/components/quiz/FatLossQuizLandingPage";

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
