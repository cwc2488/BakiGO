"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { InteractionPriority, PersonalityType, UrgencyLevel, ReadinessLevel } from "@/lib/quiz/fat-loss/types";
import type { PersonalityProfile } from "@/lib/quiz/fat-loss/types";
import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import {
  INTERACTION_PRIORITY_LABELS,
  READINESS_LABELS,
  URGENCY_LABELS,
} from "@/lib/quiz/fat-loss/personality-content";

type PartnerIntelligence = {
  resultId: string;
  responseId: string;
  respondentName: string;
  primary: PersonalityProfile;
  secondary: PersonalityProfile;
  primaryGoalLabel: string;
  urgencyLabel: string;
  readinessLabel: string;
  actionHistoryLabels: string[];
  interactionPriorityLabel: string;
  followupMessage: string | null;
  urgency: UrgencyLevel;
  readiness: ReadinessLevel;
  interactionPriority: InteractionPriority;
  primaryGoal: string;
};

export function QuizIntelligencePage({ resultId }: { resultId: string }) {
  const [intel, setIntel] = useState<PartnerIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadIntelligence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth(`/api/quiz/partner/results/${resultId}`);
      const payload = (await response.json()) as {
        ok?: boolean;
        intelligence?: PartnerIntelligence;
        error?: string;
      };
      if (!response.ok || !payload.intelligence) {
        throw new Error(payload.error ?? "無法載入情報卡");
      }
      setIntel(payload.intelligence);
    } catch (loadError) {
      setIntel(null);
      setError(loadError instanceof Error ? loadError.message : "無法載入情報卡");
    } finally {
      setLoading(false);
    }
  }, [resultId]);

  useEffect(() => {
    void loadIntelligence();
  }, [loadIntelligence]);

  async function copyFollowup() {
    if (!intel?.followupMessage) {
      return;
    }
    await navigator.clipboard.writeText(intel.followupMessage);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <PageShell title="測驗情報卡" subtitle="載入中…">
        <BrandCard>
          <p className="text-sm text-[#86868b]">載入情報中…</p>
        </BrandCard>
      </PageShell>
    );
  }

  if (error || !intel) {
    return (
      <PageShell title="測驗情報卡" subtitle="無法載入">
        <BrandCard>
          <p className="text-sm text-red-600">{error ?? "找不到這筆結果"}</p>
          <Link href="/quiz/leads" className="mt-4 inline-block text-sm text-[var(--brand-primary-dark)]">
            返回名單
          </Link>
        </BrandCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="測驗情報卡"
      subtitle={`${intel.respondentName} · 減脂破冰測驗`}
    >
      <BrandCard>
        <p className="text-xs font-medium text-[#c08a98]">🧠 新情報解鎖</p>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-[1.5rem] text-4xl"
            style={{ background: `linear-gradient(180deg, ${intel.primary.accent} 0%, #fff8f2 100%)` }}
          >
            {intel.primary.emoji}
          </div>
          <div>
            <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">{intel.respondentName}</h2>
            <p className="mt-1 text-sm text-[#86868b]">主要需求：減脂</p>
          </div>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3">
            <dt className="text-xs text-[#86868b]">人格</dt>
            <dd className="mt-1 font-medium text-[#1d1d1f]">
              {intel.primary.emoji} {intel.primary.animalName}
            </dd>
          </div>
          <div className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3">
            <dt className="text-xs text-[#86868b]">次要傾向</dt>
            <dd className="mt-1 font-medium text-[#1d1d1f]">
              {intel.secondary.emoji} {intel.secondary.animalName}
            </dd>
          </div>
          <div className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3">
            <dt className="text-xs text-[#86868b]">核心目標</dt>
            <dd className="mt-1 font-medium text-[#1d1d1f]">{intel.primaryGoalLabel}</dd>
          </div>
          <div className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3">
            <dt className="text-xs text-[#86868b]">急迫度</dt>
            <dd className="mt-1 font-medium text-[#1d1d1f]">{URGENCY_LABELS[intel.urgency]}</dd>
          </div>
          <div className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3">
            <dt className="text-xs text-[#86868b]">改變意願</dt>
            <dd className="mt-1 font-medium text-[#1d1d1f]">{READINESS_LABELS[intel.readiness]}</dd>
          </div>
          <div className="rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3">
            <dt className="text-xs text-[#86868b]">互動優先度</dt>
            <dd className="mt-1 font-medium text-[#1d1d1f]">
              {INTERACTION_PRIORITY_LABELS[intel.interactionPriority]}
            </dd>
          </div>
        </dl>

        {intel.actionHistoryLabels.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--brand-border)] px-4 py-3">
            <p className="text-xs text-[#86868b]">過往行動</p>
            <p className="mt-1 text-sm text-[#1d1d1f]">{intel.actionHistoryLabels.join("、")}</p>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-[var(--brand-border)] px-4 py-4">
          <p className="text-xs text-[#86868b]">AI 建議下一句</p>
          <p className="mt-2 text-[0.9375rem] leading-7 text-[#1d1d1f]">
            {intel.followupMessage ?? "尚無建議訊息"}
          </p>
          {intel.followupMessage ? (
            <button
              type="button"
              className="mt-3 text-sm font-medium text-[var(--brand-primary-dark)]"
              onClick={() => void copyFollowup()}
            >
              {copied ? "已複製" : "複製訊息"}
            </button>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/quiz/fat-loss/result/${intel.resultId}`}
            className="inline-flex items-center rounded-full bg-[var(--brand-bg)] px-4 py-2 text-sm font-medium text-[#636366]"
          >
            查看完整結果
          </Link>
          <Link
            href="/customers"
            className="inline-flex items-center rounded-full bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
          >
            進入諮詢
          </Link>
        </div>
      </BrandCard>
    </PageShell>
  );
}
