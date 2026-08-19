"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { getPersonalityProfile, INTERACTION_PRIORITY_LABELS } from "@/lib/quiz/fat-loss/personality-content";
import type { InteractionPriority, PersonalityType } from "@/lib/quiz/fat-loss/types";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";

type QuizLead = {
  resultId: string;
  respondentName: string;
  completedAt: string | null;
  primaryType: PersonalityType;
  interactionPriority: InteractionPriority;
};

export function QuizLeadsPage() {
  const [leads, setLeads] = useState<QuizLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/quiz/leads");
      const payload = (await response.json()) as { ok?: boolean; leads?: QuizLead[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "無法載入名單");
      }
      setLeads(payload.leads ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入名單");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  return (
    <PageShell
      title="測驗名單"
      subtitle="完成你分享連結的受測者，會在這裡顯示情報摘要。"
    >
      <div className="flex justify-end gap-4">
        <Link
          href="/quiz/21d"
          className="text-sm font-medium text-[var(--brand-primary-dark)] underline-offset-2 hover:underline"
        >
          21 天體驗興趣
        </Link>
        <Link
          href="/quiz/manage"
          className="text-sm font-medium text-[var(--brand-primary-dark)] underline-offset-2 hover:underline"
        >
          管理分享連結
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <BrandCard>
          <p className="text-sm text-[#86868b]">載入中…</p>
        </BrandCard>
      ) : leads.length === 0 ? (
        <BrandCard>
          <p className="text-[0.9375rem] leading-7 text-[#86868b]">
            還沒有受測者完成測驗。先到「心理測驗分享」產生連結並分享出去吧。
          </p>
        </BrandCard>
      ) : (
        <ul className="space-y-4">
          {leads.map((lead) => {
            const profile = getPersonalityProfile(lead.primaryType);
            return (
              <li key={lead.resultId}>
                <Link href={`/quiz/results/${lead.resultId}`}>
                  <BrandCard className="transition active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-[#c08a98]">🧠 新情報解鎖</p>
                        <h2 className="mt-1 text-[1rem] font-semibold text-[#1d1d1f]">
                          {lead.respondentName}
                        </h2>
                        <p className="mt-2 text-sm text-[#86868b]">
                          {profile.emoji} {profile.animalName} · 互動優先度{" "}
                          {INTERACTION_PRIORITY_LABELS[lead.interactionPriority]}
                        </p>
                      </div>
                      <span className="text-xs text-[#86868b]">
                        {lead.completedAt ? new Date(lead.completedAt).toLocaleDateString("zh-TW") : ""}
                      </span>
                    </div>
                  </BrandCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
