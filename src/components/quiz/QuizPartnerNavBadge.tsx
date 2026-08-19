"use client";

import { useEffect, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

export function QuizPartnerNavBadge({ className = "" }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchWithMemberAuth("/api/quiz/21d/badge")
      .then(async (response) => {
        const payload = (await response.json()) as { count?: number };
        if (!cancelled && response.ok) setCount(payload.count ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!count) return null;
  return (
    <span
      className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#c08a98] px-1.5 text-[0.6875rem] font-semibold text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
