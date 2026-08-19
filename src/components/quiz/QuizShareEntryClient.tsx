"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Human clients hop client-side. Crawlers that skip JS still get /q/{code} OG metadata. */
export function QuizShareEntryClient({ dest }: { dest: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(dest);
  }, [dest, router]);
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-[#faf6f1] px-6">
      <p className="text-center text-[0.9375rem] text-[#86868b]">前往心理測驗…</p>
    </main>
  );
}
