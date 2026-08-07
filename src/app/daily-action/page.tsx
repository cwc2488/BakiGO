import { Suspense } from "react";
import DailyActionPage from "@/components/daily-action/DailyActionPage";
import { APP_EMOJI } from "@/lib/ui/app-emojis";

export default function DailyActionRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
          {APP_EMOJI.mood.loading} 載入今日行動…
        </div>
      }
    >
      <DailyActionPage />
    </Suspense>
  );
}
