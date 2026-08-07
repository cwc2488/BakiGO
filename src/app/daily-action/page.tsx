import { Suspense } from "react";
import DailyActionPage from "@/components/daily-action/DailyActionPage";
import { IconLabel } from "@/components/ui/AppIcon";
import { APP_ICON } from "@/lib/ui/app-icons";

export default function DailyActionRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-[var(--brand-bg)] text-[#86868b]">
          <IconLabel icon={APP_ICON.mood.loading}>載入今日行動…</IconLabel>
        </div>
      }
    >
      <DailyActionPage />
    </Suspense>
  );
}
