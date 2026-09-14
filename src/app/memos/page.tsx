import { Suspense } from "react";
import MemosPage from "@/components/memos/MemosPage";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="home-container pb-24 pt-10">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-[var(--brand-border)]/60" />
          <div className="mt-6 space-y-2">
            <div className="h-14 animate-pulse rounded-xl bg-[var(--brand-border)]/50" />
            <div className="h-14 animate-pulse rounded-xl bg-[var(--brand-border)]/40" />
          </div>
        </div>
      }
    >
      <MemosPage />
    </Suspense>
  );
}
