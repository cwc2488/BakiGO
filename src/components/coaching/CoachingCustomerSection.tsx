"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard, CrmField, CrmSectionTitle } from "@/components/members/ui";
import { CoachingPlanConfirmForm } from "@/components/coaching/CoachingPlanConfirmForm";
import {
  ensureCustomerPortalToken,
  fetchCustomerPortalToken,
} from "@/lib/cloud/customer-cloud-service";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import {
  cloneDefaultCoachingPlanSnapshot,
  DEFAULT_COACHING_PLAN_SNAPSHOT,
} from "@/lib/coaching/default-instructions";
import {
  planDraftToSnapshot,
  planSnapshotToDraft,
  type CoachingPlanDraft,
} from "@/lib/coaching/coaching-plan-draft";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  COACHING_STATUS_LABELS,
  type CoachingEnrollment,
} from "@/types/coaching";

export function CoachingCustomerSection({
  customerId,
  customerDisplayName,
}: {
  customerId: string;
  customerDisplayName: string;
}) {
  const [enrollment, setEnrollment] = useState<CoachingEnrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPlanConfirm, setShowPlanConfirm] = useState(false);
  const [planDraft, setPlanDraft] = useState<CoachingPlanDraft>(() =>
    planSnapshotToDraft(cloneDefaultCoachingPlanSnapshot()),
  );

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError("雲端尚未設定，無法使用陪跑功能");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments?customerId=${encodeURIComponent(customerId)}`,
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        enrollment?: CoachingEnrollment | null;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "無法載入陪跑狀態");
      }
      setEnrollment(payload.enrollment ?? null);
      if (payload.enrollment?.goal) {
        setGoal(payload.enrollment.goal);
      }

      const token = await fetchCustomerPortalToken(customerId);
      if (token && !token.revokedAt) {
        setPortalLink(`${window.location.origin}/c/${token.token}/coaching`);
      } else {
        setPortalLink(null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入陪跑狀態");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openPlanConfirm = () => {
    setPlanDraft(planSnapshotToDraft(cloneDefaultCoachingPlanSnapshot()));
    setShowPlanConfirm(true);
    setError(null);
  };

  const confirmStartCoaching = async () => {
    setBusy(true);
    setError(null);
    try {
      const planSnapshot = planDraftToSnapshot(planDraft, DEFAULT_COACHING_PLAN_SNAPSHOT.reportingRules);
      const response = await fetchCoachingWithMemberAuth("/api/coaching/enrollments", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          goal: goal.trim() || null,
          planSnapshot,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "無法開始陪跑");
      }
      await ensureCustomerPortalToken(customerId);
      setShowPlanConfirm(false);
      await reload();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "無法開始陪跑");
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (status: CoachingEnrollment["status"]) => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollment.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "更新失敗");
      }
      await reload();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!portalLink) return;
    await navigator.clipboard.writeText(portalLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <CrmCard className="space-y-4">
      <CrmSectionTitle>AI 陪跑</CrmSectionTitle>
      <p className="text-[0.9375rem] leading-relaxed text-[#636366]">
        為 {customerDisplayName} 建立每日陪跑。客戶使用既有 Portal 連結，不需建立 member 帳號。
      </p>

      {loading ? <p className="text-[0.9375rem] text-[#86868b]">載入中…</p> : null}
      {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

      {enrollment ? (
        <div className="space-y-3">
          <CrmField label="狀態" value={COACHING_STATUS_LABELS[enrollment.status]} />
          <CrmField label="目標" value={enrollment.goal} />
          <CrmField
            label="開跑設定"
            value={enrollment.onboardingCompletedAt ? "已完成" : "尚未完成"}
          />
          {portalLink ? (
            <div className="space-y-2">
              <p className="text-[0.8125rem] font-medium text-[#86868b]">陪跑專屬連結</p>
              <p className="break-all text-[0.875rem] text-[#1d1d1f]">{portalLink}</p>
              <CrmButton disabled={busy} onClick={() => void copyLink()} type="button" variant="secondary">
                {copied ? "已複製" : "複製連結給客戶"}
              </CrmButton>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            {enrollment.status === "active" ? (
              <>
                <CrmButton disabled={busy} onClick={() => void updateStatus("paused")} type="button" variant="secondary">
                  暫停陪跑
                </CrmButton>
                <CrmButton disabled={busy} onClick={() => void updateStatus("completed")} type="button" variant="danger">
                  結束陪跑
                </CrmButton>
              </>
            ) : null}
            {enrollment.status === "paused" ? (
              <CrmButton disabled={busy} onClick={() => void updateStatus("active")} type="button">
                恢復陪跑
              </CrmButton>
            ) : null}
          </div>
        </div>
      ) : showPlanConfirm ? (
        <CoachingPlanConfirmForm
          busy={busy}
          customerDisplayName={customerDisplayName}
          draft={planDraft}
          goal={goal}
          onCancel={() => setShowPlanConfirm(false)}
          onChange={setPlanDraft}
          onConfirm={() => void confirmStartCoaching()}
        />
      ) : (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="text-[0.875rem] font-medium text-[#636366]">陪跑目標（選填）</span>
            <input
              className="w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
              onChange={(event) => setGoal(event.target.value)}
              placeholder="例如：12 週減脂陪跑"
              value={goal}
            />
          </label>
          <CrmButton disabled={busy || loading} onClick={openPlanConfirm} type="button">
            開始陪跑
          </CrmButton>
        </div>
      )}
    </CrmCard>
  );
}
