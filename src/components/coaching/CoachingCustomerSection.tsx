"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CrmButton, CrmCard, CrmField, CrmSectionTitle } from "@/components/members/ui";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import {
  defaultPlannedEndDate,
  resolveEnrollmentPlannedEndDate,
  resolveEnrollmentStartDate,
} from "@/lib/coaching/enrollment-window";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isExperience21dEnrollment } from "@/lib/coaching/experience-21d";
import { flushCustomerCloudPushAsync } from "@/lib/cloud/customer-cloud-service";
import Link from "next/link";
import {
  COACHING_STATUS_LABELS,
  type CoachingEnrollment,
} from "@/types/coaching";

const LOAD_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(
  path: string,
  init?: RequestInit,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchCoachingWithMemberAuth(path, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Customer detail — Go21 is the default coaching product.
 * Status loads via server API (service-role portal token) so the card cannot
 * hang forever on browser Supabase RLS / getSession.
 */
export function CoachingCustomerSection({
  customerId,
  customerDisplayName,
}: {
  customerId: string;
  customerDisplayName: string;
}) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<CoachingEnrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [go21Link, setGo21Link] = useState<string | null>(null);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedGo21, setCopiedGo21] = useState(false);
  const [editStartDate, setEditStartDate] = useState("");
  const [editPlannedEndAt, setEditPlannedEndAt] = useState("");

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError("雲端尚未設定，無法使用 Baki Go 21");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Best-effort local→cloud flush so activation/status see the customer.
      await flushCustomerCloudPushAsync().catch(() => undefined);

      const response = await fetchWithTimeout(
        `/api/coaching/go21/status?customerId=${encodeURIComponent(customerId)}`,
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        enrollment?: CoachingEnrollment | null;
        isGo21?: boolean;
        portalToken?: string | null;
        go21Path?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "無法載入 Baki Go 21 狀態");
      }

      const next = payload.enrollment ?? null;
      setEnrollment(next);
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

      if (payload.go21Path) {
        setGo21Link(`${window.location.origin}${payload.go21Path}`);
      } else if (payload.portalToken) {
        setGo21Link(`${window.location.origin}/c/${payload.portalToken}/go21`);
      } else {
        setGo21Link(null);
      }

      if (payload.portalToken && next && !isExperience21dEnrollment(next)) {
        setPortalLink(`${window.location.origin}/c/${payload.portalToken}/coaching`);
      } else {
        setPortalLink(null);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error && loadError.name === "AbortError"
          ? "載入逾時，請下拉重試"
          : loadError instanceof Error
            ? loadError.message
            : "無法載入 Baki Go 21 狀態";
      setError(message);
      setEnrollment(null);
      setGo21Link(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openActivation = async () => {
    setBusy(true);
    setError(null);
    try {
      await flushCustomerCloudPushAsync().catch(() => undefined);
      // Ensure cloud row exists before navigating (activation also upserts).
      await fetchWithTimeout("/api/coaching/go21/status", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          displayName: customerDisplayName,
          ensurePortalToken: false,
        }),
      }).catch(() => null);
      router.push(`/customers/${encodeURIComponent(customerId)}/start-21d`);
    } catch (navError) {
      setError(navError instanceof Error ? navError.message : "無法開啟開通頁");
      setBusy(false);
    }
  };

  const saveEnrollmentDates = async () => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(
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
      const response = await fetchWithTimeout(
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
      <CrmSectionTitle>Baki Go 21</CrmSectionTitle>
      <p className="text-[0.9375rem] leading-relaxed text-[#636366]">
        為 {customerDisplayName} 開通 21 天 AI 飲食陪跑。客人使用專屬連結進入，不需建立帳號。
      </p>

      {loading ? <p className="text-[0.9375rem] text-[#86868b]">載入中…</p> : null}
      {error ? (
        <div className="space-y-2">
          <p className="text-[0.9375rem] text-[#cf1322]">{error}</p>
          <CrmButton disabled={busy} onClick={() => void reload()} type="button" variant="secondary">
            重試載入
          </CrmButton>
        </div>
      ) : null}

      {!loading && enrollment ? (
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
          {isGo21 ? <Go21TargetsEditor customerId={customerId} disabled={busy} /> : null}
          {!isGo21 && portalLink ? (
            <div className="space-y-2">
              <p className="text-[0.8125rem] font-medium text-[#86868b]">歷史陪跑連結</p>
              <p className="break-all text-[0.875rem] text-[#1d1d1f]">{portalLink}</p>
              <CrmButton disabled={busy} onClick={() => void copyLink()} type="button" variant="secondary">
                {copied ? "已複製" : "複製連結給客戶"}
              </CrmButton>
            </div>
          ) : null}
          {!isGo21 ? (
            <p className="text-[0.8125rem] leading-5 text-[#86868b]">
              這是較早的陪跑紀錄。新開通請使用 Baki Go 21。
            </p>
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
          {isGo21 ? (
            <Link
              className="flex w-full items-center justify-center rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-center text-[0.9375rem] font-semibold text-[#1d1d1f]"
              href={`/coaching/${encodeURIComponent(enrollment.id)}`}
            >
              查看陪跑中心
            </Link>
          ) : null}
        </div>
      ) : null}

      {!loading && !enrollment ? (
        <div className="space-y-3">
          <CrmButton
            disabled={busy}
            onClick={() => void openActivation()}
            type="button"
            className="w-full"
          >
            {busy ? "準備中…" : "開通 21 天 AI 陪跑"}
          </CrmButton>
        </div>
      ) : null}
    </CrmCard>
  );
}

function Go21TargetsEditor({
  customerId,
  disabled,
}: {
  customerId: string;
  disabled?: boolean;
}) {
  const [waterMl, setWaterMl] = useState(2500);
  const [caloriesKcal, setCaloriesKcal] = useState(1600);
  const [proteinG, setProteinG] = useState(100);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchWithTimeout(
          `/api/coaching/go21/targets?customerId=${encodeURIComponent(customerId)}`,
        );
        const payload = (await res.json()) as {
          targets?: {
            waterMl?: number | null;
            caloriesKcal?: number | null;
            proteinG?: number | null;
            sleepHours?: number | null;
          } | null;
        };
        if (cancelled || !res.ok) return;
        if (payload.targets) {
          if (payload.targets.waterMl != null) setWaterMl(payload.targets.waterMl);
          if (payload.targets.caloriesKcal != null) setCaloriesKcal(payload.targets.caloriesKcal);
          if (payload.targets.proteinG != null) setProteinG(payload.targets.proteinG);
          if (payload.targets.sleepHours != null) setSleepHours(payload.targets.sleepHours);
        }
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout("/api/coaching/go21/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          waterMl,
          caloriesKcal,
          proteinG,
          sleepHours,
          source: "coach_edit",
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "無法儲存");
      setMsg("已更新每日目標");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "無法儲存");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="text-[0.8125rem] text-[#86868b]">載入每日目標…</p>;
  }

  return (
    <div className="space-y-3 rounded-[1rem] border border-[#e4ebe0] bg-white p-3">
      <p className="text-[0.8125rem] font-medium text-[#5a7a3a]">每日陪跑目標</p>
      <p className="text-[0.75rem] leading-5 text-[#86868b]">水／熱量／蛋白質／睡眠 — 可隨時調整，不用重開。</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[0.75rem] text-[#86868b]">水 ml</span>
          <input
            type="number"
            className="w-full rounded-[0.75rem] border border-[#e5e5ea] px-3 py-2 text-[0.9375rem]"
            value={waterMl}
            onChange={(e) => setWaterMl(Number(e.target.value) || 0)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[0.75rem] text-[#86868b]">熱量 kcal</span>
          <input
            type="number"
            className="w-full rounded-[0.75rem] border border-[#e5e5ea] px-3 py-2 text-[0.9375rem]"
            value={caloriesKcal}
            onChange={(e) => setCaloriesKcal(Number(e.target.value) || 0)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[0.75rem] text-[#86868b]">蛋白質 g</span>
          <input
            type="number"
            className="w-full rounded-[0.75rem] border border-[#e5e5ea] px-3 py-2 text-[0.9375rem]"
            value={proteinG}
            onChange={(e) => setProteinG(Number(e.target.value) || 0)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[0.75rem] text-[#86868b]">睡眠 小時</span>
          <input
            type="number"
            step="0.5"
            className="w-full rounded-[0.75rem] border border-[#e5e5ea] px-3 py-2 text-[0.9375rem]"
            value={sleepHours}
            onChange={(e) => setSleepHours(Number(e.target.value) || 0)}
          />
        </label>
      </div>
      <CrmButton disabled={disabled || saving} onClick={() => void save()} type="button" variant="secondary">
        {saving ? "儲存中…" : "儲存每日目標"}
      </CrmButton>
      {msg ? <p className="text-[0.8125rem] text-[#636366]">{msg}</p> : null}
    </div>
  );
}
