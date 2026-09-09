"use client";

import { useEffect, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";

/** Compact badge for Customer Hub / nav — today + overdue only. */
export function LeadTrackingHubBadge() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchWithMemberAuth("/api/lead-tracking?filter=all&limit=1");
        if (!res.ok) return;
        const data = (await res.json()) as { badges?: { today: number; overdue: number } };
        if (cancelled || !data.badges) return;
        const parts: string[] = [];
        if (data.badges.overdue > 0) parts.push(`逾期 ${data.badges.overdue}`);
        if (data.badges.today > 0) parts.push(`今天 ${data.badges.today}`);
        setLabel(parts.length > 0 ? parts.join(" · ") : null);
      } catch {
        // silent — hub should never break on badge failure
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!label) return null;

  return (
    <span className="shrink-0 rounded-full bg-[var(--brand-primary-muted)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--brand-primary-dark)]">
      {label}
    </span>
  );
}
