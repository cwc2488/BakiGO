import { Suspense } from "react";
import CalendarOAuthCompletePage from "./CalendarOAuthCompleteClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-[#86868b]">
          載入中…
        </div>
      }
    >
      <CalendarOAuthCompletePage />
    </Suspense>
  );
}
