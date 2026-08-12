"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard, CrmField, CrmSectionTitle } from "@/components/members/ui";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { GROWTH_UI_LABELS } from "@/lib/coaching/presentation/coaching-ui-copy";

type CoachView = {
  suitableNow: boolean;
  headline: string;
  summaryTone?: string;
  sectionTitle?: string;
  measuredOutcome: string;
  perceivedOutcome: number | null;
  coachHelpfulness: number | null;
  experienceSatisfaction: number | null;
  recommendationWillingness: number | null;
  mostFeltChange: string | null;
  experienceBand: string;
  primaryPath: string;
  primaryPathCode: string | null;
  whyEvidence: string[];
  repairExperience: boolean;
  inviteCheckin: boolean;
  celebrationClass: string;
};

type GrowthPayload = {
  ok?: boolean;
  error?: string;
  coachView?: CoachView;
  opportunity?: { id: string; status: string } | null;
};

/**
 * Coach Growth section — answers: 適不適合談成果分享／轉介紹？為什麼？
 * Default: collapsed summary for 5–10s decision.
 */
export default function CoachingGrowthPanel({
  enrollmentId,
  logDate,
}: {
  enrollmentId: string;
  logDate: string;
}) {
  const [payload, setPayload] = useState<GrowthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(
    async (reconcile = false) => {
      setLoading(true);
      setError(null);
      try {
        const q = new URLSearchParams({ logDate });
        if (reconcile) q.set("reconcile", "1");
        const res = await fetchCoachingWithMemberAuth(
          `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/growth?${q.toString()}`,
        );
        const data = (await res.json()) as GrowthPayload;
        if (!res.ok || !data.ok || !data.coachView) {
          throw new Error(data.error ?? "無法載入成果與分享機會");
        }
        setPayload(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "無法載入成果與分享機會");
      } finally {
        setLoading(false);
      }
    },
    [enrollmentId, logDate],
  );

  useEffect(() => {
    // UX-1.2: read-only load by default — avoid reconcile=1 DB write on every Detail mount.
    void load(false);
  }, [load]);

  const patchStatus = async (status: "acted" | "snoozed" | "declined") => {
    if (!payload?.opportunity?.id) return;
    setBusy(true);
    try {
      const res = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollmentId)}/growth`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId: payload.opportunity.id, status }),
        },
      );
      const data = (await res.json()) as GrowthPayload;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "更新失敗");
      }
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const view = payload?.coachView;
  const summaryTone = view?.summaryTone ?? GROWTH_UI_LABELS.summaryNotSuitable;

  return (
    <CrmCard className="min-w-0 space-y-4 overflow-hidden">
      <CrmSectionTitle>{view?.sectionTitle ?? GROWTH_UI_LABELS.sectionTitle}</CrmSectionTitle>
      {loading ? <p className="text-[0.875rem] text-[#86868b]">載入中…</p> : null}
      {error ? <p className="min-w-0 break-words text-[0.875rem] text-[#c62828] [overflow-wrap:anywhere]">{error}</p> : null}
      {view ? (
        <>
          <div
            className={`min-w-0 rounded-2xl px-4 py-3 ${
              view.suitableNow ? "bg-[#eef7f0]" : "bg-[#f5f5f7]"
            }`}
          >
            <p className="text-[0.8125rem] font-medium text-[#86868b]">{GROWTH_UI_LABELS.suitableQuestion}</p>
            <p className="mt-1 min-w-0 text-[1.125rem] font-semibold break-words text-[#1d1d1f] [overflow-wrap:anywhere]">
              {summaryTone}
            </p>
            {view.headline && view.headline !== summaryTone ? (
              <p className="mt-1 min-w-0 text-[0.875rem] break-words text-[#636366] [overflow-wrap:anywhere]">
                {view.headline}
              </p>
            ) : null}
            {view.repairExperience ? (
              <p className="mt-2 min-w-0 text-[0.875rem] break-words text-[#636366] [overflow-wrap:anywhere]">
                量測成果不錯，但體驗／感受偏低——請先修復信任與期待，不要當成功故事談介紹。
              </p>
            ) : null}
            {view.inviteCheckin ? (
              <p className="mt-2 min-w-0 text-[0.875rem] break-words text-[#636366] [overflow-wrap:anywhere]">
                {GROWTH_UI_LABELS.inviteCheckinHint}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="min-h-12 flex-1 rounded-2xl bg-[var(--brand-bg)] px-4 py-3 text-left text-[0.9375rem] font-semibold text-[var(--brand-primary-dark)]"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded ? GROWTH_UI_LABELS.collapseDetails : GROWTH_UI_LABELS.expandDetails}
            </button>
            <CrmButton
              type="button"
              variant="secondary"
              disabled={loading || busy}
              onClick={() => void load(true)}
            >
              重新評估
            </CrmButton>
          </div>

          {expanded ? (
            <div className="min-w-0 space-y-1">
              <CrmField label={GROWTH_UI_LABELS.measuredOutcome} value={view.measuredOutcome} />
              <CrmField
                label={GROWTH_UI_LABELS.perceivedOutcome}
                value={view.perceivedOutcome != null ? `${view.perceivedOutcome} / 5` : "尚未回饋"}
              />
              <CrmField
                label={GROWTH_UI_LABELS.coachHelpfulness}
                value={view.coachHelpfulness != null ? `${view.coachHelpfulness} / 5` : "尚未回饋"}
              />
              <CrmField
                label={GROWTH_UI_LABELS.experienceSatisfaction}
                value={
                  view.experienceSatisfaction != null
                    ? `${view.experienceSatisfaction} / 5（${view.experienceBand}）`
                    : view.experienceBand
                }
              />
              <CrmField
                label={GROWTH_UI_LABELS.recommendationWillingness}
                value={
                  view.recommendationWillingness != null
                    ? `${view.recommendationWillingness} / 10`
                    : "尚未回饋"
                }
              />
              <CrmField label={GROWTH_UI_LABELS.mostFeltChange} value={view.mostFeltChange ?? "—"} />
              <CrmField label={GROWTH_UI_LABELS.primaryPath} value={view.primaryPath} />

              {view.whyEvidence.length > 0 ? (
                <div className="min-w-0 pt-2">
                  <p className="text-[0.8125rem] font-medium text-[#86868b]">{GROWTH_UI_LABELS.whyTitle}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.8125rem] text-[#636366]">
                    {view.whyEvidence.map((line) => (
                      <li key={line} className="min-w-0 break-words [overflow-wrap:anywhere]">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {payload?.opportunity?.id && view.suitableNow ? (
                <div className="flex flex-wrap gap-2 pt-3">
                  <CrmButton
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      window.location.href = "/customers/referrals";
                    }}
                  >
                    去轉介紹中心開始
                  </CrmButton>
                  <CrmButton type="button" disabled={busy} onClick={() => void patchStatus("acted")}>
                    已談過
                  </CrmButton>
                  <CrmButton
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void patchStatus("snoozed")}
                  >
                    稍後再說
                  </CrmButton>
                  <CrmButton
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void patchStatus("declined")}
                  >
                    {GROWTH_UI_LABELS.decline}
                  </CrmButton>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </CrmCard>
  );
}
