"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/ui/PageShell";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { flushCustomerCloudPushAsync } from "@/lib/cloud/customer-cloud-service";
import {
  deriveExperience21dSchedule,
  formatExperience21dShortDate,
  formatExperience21dZhDate,
  isIsoDate,
} from "@/lib/coaching/experience-21d";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";

type ActiveExperience = {
  enrollmentId: string;
  startDate: string | null;
  plannedEndAt: string | null;
  status: string;
};

type StartMode =
  | { kind: "interest"; interestId: string }
  | { kind: "customer"; customerId: string };

export function Experience21dStartPage({
  mode,
  initialCustomerId,
  initialCustomerName,
}: {
  mode: StartMode;
  initialCustomerId?: string | null;
  /** Prefetched display name (avoids 顧客：— while / after load). */
  initialCustomerName?: string | null;
}) {
  const seededCustomerId =
    mode.kind === "customer"
      ? mode.customerId
      : (initialCustomerId?.trim() || "");
  const [customerId, setCustomerId] = useState(seededCustomerId);
  const [customerName, setCustomerName] = useState(initialCustomerName?.trim() || "");
  const [createHref, setCreateHref] = useState<string | null>(null);
  const [needsCustomer, setNeedsCustomer] = useState(false);
  const [active, setActive] = useState<ActiveExperience | null>(null);
  const [otherCoaching, setOtherCoaching] = useState(false);
  const [productReceivedDate, setProductReceivedDate] = useState(coachingTodayLogDate());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    enrollmentId: string;
    startDate: string;
    plannedEndAt: string;
    alreadyActive: boolean;
    go21Link: string | null;
  } | null>(null);

  const effectiveCustomerId =
    customerId.trim() ||
    (mode.kind === "customer" ? mode.customerId : seededCustomerId);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await flushCustomerCloudPushAsync().catch(() => undefined);

      if (mode.kind === "interest") {
        const response = await fetchWithMemberAuth(`/api/quiz/21d/${mode.interestId}/activation`);
        const payload = (await response.json()) as {
          error?: string;
          interest?: { displayName: string; status: string };
          matchedCustomer?: { id: string; displayName: string } | null;
          createCustomerHref?: string;
          activeExperience?: ActiveExperience | null;
          activeOtherCoaching?: boolean;
        };
        if (!response.ok) throw new Error(payload.error ?? "找不到這筆名單");
        if (payload.interest?.status && payload.interest.status !== "joined") {
          throw new Error("請先確認成交");
        }
        setCustomerName(
          payload.matchedCustomer?.displayName ||
            payload.interest?.displayName ||
            initialCustomerName?.trim() ||
            "",
        );
        setCreateHref(payload.createCustomerHref ?? null);
        setActive(payload.activeExperience ?? null);
        setOtherCoaching(Boolean(payload.activeOtherCoaching));
        if (payload.matchedCustomer?.id) {
          setCustomerId(payload.matchedCustomer.id);
          setNeedsCustomer(false);
        } else if (initialCustomerId) {
          setCustomerId(initialCustomerId);
          setNeedsCustomer(false);
        } else {
          setNeedsCustomer(true);
        }
        return;
      }

      // Customer mode — id is already known from the route; never leave it empty.
      setCustomerId(mode.customerId);
      // Pre-sync local customer into cloud so GET/activate see the same row.
      await fetchWithMemberAuth("/api/coaching/go21/status", {
        method: "POST",
        body: JSON.stringify({
          customerId: mode.customerId,
          displayName: initialCustomerName || null,
          ensurePortalToken: false,
        }),
      }).catch(() => null);

      const response = await fetchWithMemberAuth(
        `/api/coaching/experience-21d?customerId=${encodeURIComponent(mode.customerId)}`,
      );
      const payload = (await response.json()) as {
        error?: string;
        customerSynced?: boolean;
        customer?: { id: string; displayName: string };
        activeExperience?: ActiveExperience | null;
        activeOtherCoaching?: boolean;
        portalToken?: string | null;
      };
      if (!response.ok) throw new Error(payload.error ?? "找不到這位顧客");
      setCustomerId(payload.customer?.id ?? mode.customerId);
      setCustomerName(
        payload.customer?.displayName?.trim() ||
          initialCustomerName?.trim() ||
          "",
      );
      setActive(payload.activeExperience ?? null);
      setOtherCoaching(Boolean(payload.activeOtherCoaching));
      setNeedsCustomer(false);
    } finally {
      setLoading(false);
    }
  }, [initialCustomerId, initialCustomerName, mode]);

  useEffect(() => {
    void load().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "無法載入");
      setLoading(false);
    });
  }, [load]);

  const schedule = useMemo(() => {
    if (!isIsoDate(productReceivedDate)) return null;
    try {
      return deriveExperience21dSchedule(productReceivedDate);
    } catch {
      return null;
    }
  }, [productReceivedDate]);

  async function activate() {
    if (!effectiveCustomerId || !schedule) return;
    setBusy(true);
    setError(null);
    try {
      // Flush local CRM → cloud before server upsert (belt + suspenders).
      const { flushCustomerCloudPushAsync } = await import("@/lib/cloud/customer-cloud-service");
      await flushCustomerCloudPushAsync().catch(() => undefined);

      const path =
        mode.kind === "interest"
          ? `/api/quiz/21d/${mode.interestId}/activation`
          : "/api/coaching/experience-21d";
      const response = await fetchWithMemberAuth(path, {
        method: "POST",
        body: JSON.stringify({
          customerId: effectiveCustomerId,
          productReceivedDate: schedule.productReceivedDate,
          customerProfile: {
            displayName: customerName || initialCustomerName || null,
          },
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        alreadyActive?: boolean;
        enrollment?: { id: string };
        schedule?: { startDate: string; plannedEndAt: string };
        customerDisplayName?: string;
        portalToken?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "無法啟動 21 天體驗");
      if (payload.customerDisplayName?.trim()) {
        setCustomerName(payload.customerDisplayName.trim());
      }
      const tokenFromApi = payload.portalToken?.trim() || null;
      let go21Link: string | null = tokenFromApi
        ? `${window.location.origin}/c/${tokenFromApi}/go21`
        : null;
      if (!go21Link) {
        // Fallback — should rarely run now that activation returns portalToken.
        const { ensureCustomerPortalToken, fetchCustomerPortalToken } = await import(
          "@/lib/cloud/customer-cloud-service"
        );
        await ensureCustomerPortalToken(effectiveCustomerId).catch(() => undefined);
        const token = await fetchCustomerPortalToken(effectiveCustomerId).catch(() => null);
        if (token && !token.revokedAt) {
          go21Link = `${window.location.origin}/c/${token.token}/go21`;
        }
      }
      setDone({
        enrollmentId: payload.enrollment?.id ?? "",
        startDate: payload.schedule?.startDate ?? schedule.startDate,
        plannedEndAt: payload.schedule?.plannedEndAt ?? schedule.plannedEndAt,
        alreadyActive: Boolean(payload.alreadyActive),
        go21Link,
      });
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "無法啟動 21 天體驗");
    } finally {
      setBusy(false);
    }
  }

  const backHref =
    mode.kind === "interest"
      ? `/quiz/21d/${mode.interestId}`
      : `/customers/${mode.customerId}`;

  if (loading && !done) {
    return (
      <PageShell title="啟動 21 天體驗" backHref={backHref}>
        <p className="text-[0.9375rem] text-[#86868b]">載入中…</p>
        {customerName || effectiveCustomerId ? (
          <p className="mt-2 text-[0.875rem] text-[#636366]">
            顧客：{customerName || "載入姓名中…"}
          </p>
        ) : null}
      </PageShell>
    );
  }

  if (error && !customerName && !needsCustomer && !active && !effectiveCustomerId) {
    return (
      <PageShell title="啟動 21 天體驗" backHref={backHref}>
        <p className="text-[0.9375rem] text-[#cf1322]">{error}</p>
      </PageShell>
    );
  }

  if (done) {
    return (
      <PageShell title="21 天體驗" backHref={backHref}>
        <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
          <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">
            {done.alreadyActive ? "這位顧客目前已在 21 天體驗中" : "21 天體驗已啟動"}
          </p>
          {customerName ? (
            <p className="mt-1 text-[0.9375rem] text-[#636366]">顧客：{customerName}</p>
          ) : null}
          <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">
            Day 1：{formatExperience21dShortDate(done.startDate)}
            <br />
            Day 21：{formatExperience21dShortDate(done.plannedEndAt)}
          </p>
          {done.go21Link ? (
            <div className="mt-4 space-y-2 rounded-2xl border border-[#d7e8c8] bg-[#f4f9ef] p-3">
              <p className="text-[0.8125rem] font-medium text-[#3d6b1e]">Baki Go 21 專屬連結（分享給客人）</p>
              <p className="break-all text-[0.875rem] text-[#1d1d1f]">{done.go21Link}</p>
              <button
                type="button"
                className="min-h-11 w-full rounded-xl bg-[#77b539] text-[0.9375rem] font-semibold text-white"
                onClick={() => void navigator.clipboard.writeText(done.go21Link!)}
              >
                複製連結
              </button>
            </div>
          ) : (
            <p className="mt-4 text-[0.875rem] leading-6 text-[#cf1322]">
              體驗已啟動，但專屬連結尚未就緒。請回到客人頁再複製 Baki Go 21 連結。
            </p>
          )}
        </section>
        {done.enrollmentId ? (
          <Link
            href={`/coaching/${done.enrollmentId}`}
            className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
          >
            查看陪跑中心
          </Link>
        ) : null}
        {effectiveCustomerId ? (
          <Link
            href={`/customers/${effectiveCustomerId}`}
            className="mt-2 flex min-h-12 items-center justify-center rounded-2xl border border-[#e5e5ea] text-[0.9375rem] font-semibold text-[#1d1d1f]"
          >
            回到客人頁
          </Link>
        ) : null}
      </PageShell>
    );
  }

  if (active) {
    return (
      <AlreadyActiveGo21Panel
        active={active}
        backHref={backHref}
        customerId={effectiveCustomerId}
        customerName={customerName}
      />
    );
  }

  if (otherCoaching) {
    return (
      <PageShell title="啟動 21 天體驗" backHref={backHref}>
        <p className="text-[0.9375rem] leading-7 text-[#636366]">
          這位顧客目前已有進行中的陪跑紀錄。請先在陪跑中心結束或完成後，再開通 Baki Go 21。
        </p>
        {effectiveCustomerId ? (
          <Link
            href={`/customers/${effectiveCustomerId}`}
            className="mt-4 block text-center text-[0.875rem] text-[#8a5a66]"
          >
            回到客人頁
          </Link>
        ) : null}
      </PageShell>
    );
  }

  if (needsCustomer) {
    return (
      <PageShell title="啟動 21 天體驗" backHref={backHref}>
        <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
          <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">成交後，請建立顧客並啟動 21 天體驗</p>
          <p className="mt-2 text-[0.9375rem] leading-7 text-[#636366]">
            成交只代表這筆名單已確認。要開始 Baki Go 21，請先建立顧客。
          </p>
        </section>
        {createHref ? (
          <Link
            href={createHref}
            className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
          >
            建立顧客
          </Link>
        ) : null}
      </PageShell>
    );
  }

  const canActivate = Boolean(effectiveCustomerId && schedule && !busy);

  return (
    <PageShell title="啟動 21 天體驗" backHref={backHref}>
      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <p className="text-[0.75rem] font-semibold tracking-wide text-[#c08a98]">Baki Go 21</p>
        <h2 className="mt-1 text-[1.25rem] font-semibold text-[#1d1d1f]">
          顧客：{customerName || "—"}
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">21 天從顧客拿到產品的隔天開始。</p>

        <label className="mt-5 block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">顧客拿到產品的日期</span>
          <input
            className="min-h-12 w-full rounded-2xl border border-[#eadfd6] bg-white px-4 text-[1rem]"
            onChange={(event) => setProductReceivedDate(event.target.value)}
            type="date"
            value={productReceivedDate}
          />
        </label>

        {schedule ? (
          <dl className="mt-5 space-y-3 text-[0.9375rem] leading-7">
            <div>
              <dt className="text-[#86868b]">拿到產品</dt>
              <dd className="font-semibold text-[#1d1d1f]">{formatExperience21dZhDate(schedule.productReceivedDate)}</dd>
            </div>
            <div>
              <dt className="text-[#86868b]">開始陪跑</dt>
              <dd className="font-semibold text-[#1d1d1f]">{formatExperience21dZhDate(schedule.startDate)}</dd>
            </div>
            <div>
              <dt className="text-[#86868b]">預計完成</dt>
              <dd className="font-semibold text-[#1d1d1f]">{formatExperience21dZhDate(schedule.plannedEndAt)}</dd>
            </div>
          </dl>
        ) : null}

        {schedule ? (
          <p className="mt-4 text-[0.8125rem] leading-6 text-[#86868b]">
            拿到產品：{formatExperience21dShortDate(schedule.productReceivedDate)}
            <br />
            開始陪跑：{formatExperience21dShortDate(schedule.startDate)}
            <br />
            預計完成：{formatExperience21dShortDate(schedule.plannedEndAt)}
          </p>
        ) : null}
      </section>

      {error ? <p className="mt-3 text-[0.9375rem] text-[#cf1322]">{error}</p> : null}
      {!effectiveCustomerId ? (
        <p className="mt-3 text-[0.9375rem] text-[#cf1322]">找不到顧客，請從客人頁重新進入。</p>
      ) : null}

      <button
        type="button"
        disabled={!canActivate}
        onClick={() => void activate()}
        className="mt-4 min-h-12 w-full rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "啟動中…" : "啟動 21 天體驗"}
      </button>
    </PageShell>
  );
}

function AlreadyActiveGo21Panel({
  active,
  backHref,
  customerId,
  customerName,
}: {
  active: ActiveExperience;
  backHref: string;
  customerId: string;
  customerName: string;
}) {
  const [go21Link, setGo21Link] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithMemberAuth(
          `/api/coaching/go21/status?customerId=${encodeURIComponent(customerId)}`,
        );
        const payload = (await response.json()) as {
          portalToken?: string | null;
          go21Path?: string | null;
        };
        if (cancelled) return;
        if (payload.go21Path) {
          setGo21Link(`${window.location.origin}${payload.go21Path}`);
        } else if (payload.portalToken) {
          setGo21Link(`${window.location.origin}/c/${payload.portalToken}/go21`);
        }
      } catch {
        // Leave link empty — coach can reopen customer page.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <PageShell title="啟動 21 天體驗" backHref={backHref}>
      <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">這位顧客目前已在 21 天體驗中</p>
        {customerName ? (
          <p className="mt-1 text-[0.9375rem] text-[#636366]">顧客：{customerName}</p>
        ) : null}
        {active.startDate && active.plannedEndAt ? (
          <p className="mt-3 text-[0.9375rem] leading-7 text-[#636366]">
            Day 1：{formatExperience21dShortDate(active.startDate)}
            <br />
            Day 21：{formatExperience21dShortDate(active.plannedEndAt)}
          </p>
        ) : null}
        {go21Link ? (
          <div className="mt-4 space-y-2 rounded-2xl border border-[#d7e8c8] bg-[#f4f9ef] p-3">
            <p className="text-[0.8125rem] font-medium text-[#3d6b1e]">Baki Go 21 專屬連結（分享給客人）</p>
            <p className="break-all text-[0.875rem] text-[#1d1d1f]">{go21Link}</p>
            <button
              type="button"
              className="min-h-11 w-full rounded-xl bg-[#77b539] text-[0.9375rem] font-semibold text-white"
              onClick={() => {
                void navigator.clipboard.writeText(go21Link);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "已複製" : "複製連結"}
            </button>
          </div>
        ) : null}
      </section>
      <Link
        href={`/coaching/${active.enrollmentId}`}
        className="mt-4 flex min-h-12 items-center justify-center rounded-2xl bg-[#1d1d1f] text-[0.9375rem] font-semibold text-white"
      >
        查看陪跑中心
      </Link>
    </PageShell>
  );
}
