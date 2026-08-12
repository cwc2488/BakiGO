"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard, CrmField, CrmSectionTitle } from "@/components/members/ui";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";

type CoachView = {
  suitableNow: boolean;
  headline: string;
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
          throw new Error(data.error ?? "無法載入 Growth");
        }
        setPayload(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "無法載入 Growth");
      } finally {
        setLoading(false);
      }
    },
    [enrollmentId, logDate],
  );

  useEffect(() => {
    void load(true);
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

  return (
    <CrmCard className="space-y-4">
      <CrmSectionTitle>Growth（成果分享／轉介紹適配）</CrmSectionTitle>
      {loading ? <p className="text-[0.875rem] text-[#86868b]">載入中…</p> : null}
      {error ? <p className="text-[0.875rem] text-[#c62828]">{error}</p> : null}
      {view ? (
        <>
          <div
            className={`rounded-2xl px-4 py-3 ${
              view.suitableNow ? "bg-[#eef7f0]" : "bg-[#f5f5f7]"
            }`}
          >
            <p className="text-[0.8125rem] font-medium text-[#86868b]">現在適不適合談？</p>
            <p className="mt-1 text-[1.125rem] font-semibold text-[#1d1d1f]">{view.headline}</p>
            {view.repairExperience ? (
              <p className="mt-2 text-[0.875rem] text-[#636366]">
                量測成果不錯，但體驗／感受偏低——請先修復信任與期待，不要當成功故事談介紹。
              </p>
            ) : null}
            {view.inviteCheckin ? (
              <p className="mt-2 text-[0.875rem] text-[#636366]">
                建議先邀請 Customer 做「陪跑小回顧」，再決定是否談分享／轉介紹。
              </p>
            ) : null}
          </div>

          <CrmField label="量測 Outcome" value={view.measuredOutcome} />
          <CrmField
            label="Customer 自覺改變"
            value={view.perceivedOutcome != null ? `${view.perceivedOutcome} / 5` : "尚未回饋"}
          />
          <CrmField
            label="Coach helpfulness"
            value={view.coachHelpfulness != null ? `${view.coachHelpfulness} / 5` : "尚未回饋"}
          />
          <CrmField
            label="整體體驗"
            value={
              view.experienceSatisfaction != null
                ? `${view.experienceSatisfaction} / 5（${view.experienceBand}）`
                : view.experienceBand
            }
          />
          <CrmField
            label="推薦意願"
            value={
              view.recommendationWillingness != null
                ? `${view.recommendationWillingness} / 10`
                : "尚未回饋"
            }
          />
          <CrmField label="最有感的改變" value={view.mostFeltChange ?? "—"} />
          <CrmField label="建議主路徑" value={view.primaryPath} />

          {view.whyEvidence.length > 0 ? (
            <div>
              <p className="text-[0.8125rem] font-medium text-[#86868b]">為什麼（evidence）</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[0.8125rem] text-[#636366]">
                {view.whyEvidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {payload?.opportunity?.id && view.suitableNow ? (
            <div className="flex flex-wrap gap-2">
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
                Customer 婉拒
              </CrmButton>
            </div>
          ) : null}
        </>
      ) : null}
    </CrmCard>
  );
}
