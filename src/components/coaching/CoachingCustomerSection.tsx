"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard, CrmField, CrmSectionTitle } from "@/components/members/ui";
import { CoachingPlanConfirmForm } from "@/components/coaching/CoachingPlanConfirmForm";
import {
  ensureCustomerPortalToken,
  fetchCustomerPortalToken,
} from "@/lib/cloud/customer-cloud-service";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  cloneDefaultCoachingPlanSnapshot,
  DEFAULT_COACHING_PLAN_SNAPSHOT,
} from "@/lib/coaching/default-instructions";
import {
  planDraftToSnapshot,
  planSnapshotToDraft,
  type CoachingPlanDraft,
} from "@/lib/coaching/coaching-plan-draft";
import {
  defaultPlannedEndDate,
  resolveEnrollmentPlannedEndDate,
  resolveEnrollmentStartDate,
} from "@/lib/coaching/enrollment-window";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isExperience21dEnrollment } from "@/lib/coaching/experience-21d";
import Link from "next/link";
import {
  COACHING_STATUS_LABELS,
  type CoachingEnrollment,
} from "@/types/coaching";

function defaultEnrollmentDates() {
  const startDate = coachingTodayLogDate();
  return { startDate, plannedEndAt: defaultPlannedEndDate(startDate) };
}

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
  const [go21Link, setGo21Link] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedGo21, setCopiedGo21] = useState(false);
  const [showPlanConfirm, setShowPlanConfirm] = useState(false);
  const [planDraft, setPlanDraft] = useState<CoachingPlanDraft>(() =>
    planSnapshotToDraft(cloneDefaultCoachingPlanSnapshot()),
  );
  const [{ startDate, plannedEndAt }, setEnrollmentDates] = useState(defaultEnrollmentDates);
  const [editStartDate, setEditStartDate] = useState("");
  const [editPlannedEndAt, setEditPlannedEndAt] = useState("");

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
      const next = payload.enrollment ?? null;
      setEnrollment(next);
      if (next?.goal) {
        setGoal(next.goal);
      }
      if (next) {
        const start = resolveEnrollmentStartDate(next.startedAt) ?? coachingTodayLogDate();
        const end =
          resolveEnrollmentPlannedEndDate({
            startedAt: next.startedAt,
            plannedEndAt: next.plannedEndAt,
          }) ?? defaultPlannedEndDate(start);
        setEditStartDate(start);
        setEditPlannedEndAt(end);
      }

      const token = await fetchCustomerPortalToken(customerId);
      if (token && !token.revokedAt) {
        setPortalLink(`${window.location.origin}/c/${token.token}/coaching`);
        setGo21Link(`${window.location.origin}/c/${token.token}/go21`);
      } else {
        setPortalLink(null);
        setGo21Link(null);
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
    setEnrollmentDates(defaultEnrollmentDates());
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
          startDate,
          plannedEndAt,
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

  const saveEnrollmentDates = async () => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetchCoachingWithMemberAuth(
        `/api/coaching/enrollments/${encodeURIComponent(enrollment.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            startDate: editStartDate,
            plannedEndAt: editPlannedEndAt,
          }),
        },
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "更新日期失敗");
      }
      await reload();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新日期失敗");
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

  const copyGo21Link = async () => {
    if (!go21Link) return;
    await navigator.clipboard.writeText(go21Link);
    setCopiedGo21(true);
    window.setTimeout(() => setCopiedGo21(false), 2000);
  };

  const isGo21 = enrollment ? isExperience21dEnrollment(enrollment) : false;

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
          <CrmField
            label={isGo21 ? "21 天目標" : "目標"}
            value={enrollment.goal || "—"}
          />
          <CrmField
            label="開跑設定"
            value={enrollment.onboardingCompletedAt ? "已完成" : "尚未完成"}
          />
          <div className="space-y-3 rounded-[1rem] border border-[#eef2ea] bg-[#fafdf8] p-3">
            <p className="text-[0.8125rem] font-medium text-[#86868b]">陪跑區間</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">開始日</span>
                <input
                  className="w-full rounded-[1rem] border border-[#e5e5ea] bg-white px-4 py-3 text-[1rem]"
                  onChange={(event) => setEditStartDate(event.target.value)}
                  type="date"
                  value={editStartDate}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-[0.875rem] font-medium text-[#636366]">預計結束日</span>
                <input
                  className="w-full rounded-[1rem] border border-[#e5e5ea] bg-white px-4 py-3 text-[1rem]"
                  onChange={(event) => setEditPlannedEndAt(event.target.value)}
                  type="date"
                  value={editPlannedEndAt}
                />
              </label>
            </div>
            <CrmButton disabled={busy} onClick={() => void saveEnrollmentDates()} type="button" variant="secondary">
              儲存日期
            </CrmButton>
          </div>
          {isGo21 && go21Link ? (
            <div className="space-y-2 rounded-[1rem] border border-[#d7e8c8] bg-[#f4f9ef] p-3">
              <p className="text-[0.8125rem] font-medium text-[#3d6b1e]">Baki Go 21 專屬連結</p>
              <p className="break-all text-[0.875rem] text-[#1d1d1f]">{go21Link}</p>
              <CrmButton disabled={busy} onClick={() => void copyGo21Link()} type="button">
                {copiedGo21 ? "已複製" : "複製給客人"}
              </CrmButton>
            </div>
          ) : null}
          {portalLink ? (
            <div className="space-y-2">
              <p className="text-[0.8125rem] font-medium text-[#86868b]">
                {isGo21 ? "一般陪跑連結（舊版表單）" : "陪跑專屬連結"}
              </p>
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
          onPlannedEndAtChange={(value) =>
            setEnrollmentDates((prev) => ({ ...prev, plannedEndAt: value }))
          }
          onStartDateChange={(value) =>
            setEnrollmentDates((prev) => ({ ...prev, startDate: value }))
          }
          plannedEndAt={plannedEndAt}
          startDate={startDate}
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
          <Link
            className="flex w-full items-center justify-center rounded-[1rem] bg-[#77b539] px-4 py-3 text-center text-[1rem] font-semibold text-white"
            href={`/customers/${encodeURIComponent(customerId)}/start-21d`}
          >
            開通 21 天 AI 陪跑
          </Link>
          <CrmButton disabled={busy || loading} onClick={openPlanConfirm} type="button" variant="secondary">
            開始一般陪跑
          </CrmButton>
        </div>
      )}
    </CrmCard>
  );
}
