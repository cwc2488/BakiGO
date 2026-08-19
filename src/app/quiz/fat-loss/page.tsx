import { Suspense } from "react";
import { ResetLandingPage } from "@/components/reset/ResetLandingPage";

function LandingFallback() {
  return (
    <div className="flex min-h-full items-center justify-center bg-[#fff9f5] text-[#75686d]">
      載入中…
    </div>
  );
}

export default function FatLossQuizLandingRoute() {
  return (
    <Suspense fallback={<LandingFallback />}>
      <ResetLandingPage />
    </Suspense>
  );
}
