"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { fetchCoachingWithMemberAuth } from "@/lib/coaching/coaching-member-fetch";

type Candidate = {
  customerId: string;
  customerName: string;
  enrollmentId: string | null;
  state: string;
  stateLabel: string;
  reason: string;
  nextActionLabel: string;
  canManualStart: boolean;
  startWarning: string | null;
  opportunityId: string | null;
  pendingShareId: string | null;
  suggestedShareTypes: string[];
  primaryCta: "start_share" | "view_customer" | "handle_friend" | "open_coaching" | "confirm_consent";
};

type NeedsCoachItem = {
  id: string;
  introducerName: string;
  friendName: string;
  introducedCustomerId: string | null;
  statusLabel: string;
  linkedExistingCustomer: boolean;
  goalText: string | null;
};

type Metrics = {
  suitableNowCount: number;
  sharingNowCount: number;
  newFriendsNeedingCoach: number;
};

type Payload = {
  ok?: boolean;
  error?: string;
  metrics?: Metrics;
  candidates?: Candidate[];
  needsCoach?: NeedsCoachItem[];
};

function stateTone(state: string): string {
  if (state === "best_timing" || state === "ask_ready" || state === "outcome_share_ready") {
    return "bg-[#eef7f0] text-[#1d5c34]";
  }
  if (state === "pause_care_first") return "bg-[#fff1f0] text-[#b42318]";
  if (state === "has_referral") return "bg-[#eef4ff] text-[#175cd3]";
  if (state === "sharing_active") return "bg-[#fff7e6] text-[#b54708]";
  return "bg-[#f5f5f7] text-[#636366]";
}

export default function ReferralCenterPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [consentCustomerId, setConsentCustomerId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCoachingWithMemberAuth("/api/coaching/referrals");
      const data = (await res.json()) as Payload;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "無法載入轉介紹中心");
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入轉介紹中心");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, busyKey: string) => {
    setBusyId(busyKey);
    setError(null);
    setMessage(null);
    try {
      const res = await fetchCoachingWithMemberAuth("/api/coaching/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        warning?: string | null;
        publicPath?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "操作失敗");
      if (data.publicPath && typeof window !== "undefined") {
        setShareUrl(`${window.location.origin}${data.publicPath}`);
      }
      setMessage([data.warning, data.message].filter(Boolean).join(" · ") || "已完成");
      if (body.action === "start" && typeof body.customerId === "string") {
        setConsentCustomerId(body.customerId);
      } else if (body.action !== "start") {
        setConsentCustomerId(null);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setBusyId(null);
    }
  };

  const metrics = payload?.metrics;
  const candidates = payload?.candidates ?? [];

  return (
    <PageShell title="轉介紹中心" subtitle="誰適合分享 · 誰已介紹朋友 · 誰需要你接手" variant="plain">
      <div className="mx-auto max-w-lg space-y-5 px-4 pb-10 pt-2">
        {loading ? <p className="text-[0.875rem] text-[#86868b]">載入中…</p> : null}
        {error ? <p className="text-[0.875rem] text-[#c62828]">{error}</p> : null}
        {message ? <p className="text-[0.875rem] text-[var(--brand-primary-dark)]">{message}</p> : null}
        {shareUrl ? (
          <CrmCard className="space-y-2">
            <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">分享連結（請複製給朋友）</p>
            <p className="break-all text-[0.8125rem] text-[#636366]">{shareUrl}</p>
            <CrmButton
              type="button"
              variant="secondary"
              onClick={() => void navigator.clipboard.writeText(shareUrl)}
            >
              複製連結
            </CrmButton>
          </CrmCard>
        ) : null}

        {metrics ? (
          <div className="grid grid-cols-3 gap-2">
            <Metric label="適合分享" value={metrics.suitableNowCount} />
            <Metric label="分享中" value={metrics.sharingNowCount} />
            <Metric label="新朋友" value={metrics.newFriendsNeedingCoach} />
          </div>
        ) : null}

        {(payload?.needsCoach ?? []).length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">需要你接手</h2>
            {(payload?.needsCoach ?? []).map((item) => (
              <CrmCard key={item.id} className="space-y-3">
                <p className="text-[1rem] font-semibold text-[#1d1d1f]">
                  {item.introducerName} → {item.friendName}
                </p>
                <p className="text-[0.875rem] text-[#636366]">
                  {item.statusLabel}
                  {item.linkedExistingCustomer ? " · 既有顧客再次進入" : ""}
                </p>
                {item.goalText ? (
                  <p className="text-[0.875rem] text-[#86868b]">想改善：{item.goalText}</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {item.introducedCustomerId ? (
                    <Link
                      className="inline-flex min-h-11 items-center rounded-2xl bg-[var(--brand-primary-muted)] px-4 text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
                      href={`/customers/${item.introducedCustomerId}`}
                    >
                      打開顧客
                    </Link>
                  ) : null}
                  <CrmButton
                    type="button"
                    variant="secondary"
                    disabled={busyId === item.id}
                    onClick={() => void post({ action: "mark_handled", attributionId: item.id }, item.id)}
                  >
                    標記已接手
                  </CrmButton>
                </div>
              </CrmCard>
            ))}
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">我的顧客</h2>
          {candidates.length === 0 && !loading ? (
            <p className="text-[0.875rem] text-[#86868b]">目前還沒有顧客。先到顧客列表新增吧。</p>
          ) : null}
          {candidates.map((item) => (
            <CrmCard key={item.customerId} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{item.customerName}</p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-[#636366]">{item.reason}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${stateTone(item.state)}`}
                >
                  {item.stateLabel}
                </span>
              </div>
              {item.startWarning ? (
                <p className="rounded-2xl bg-[#fff1f0] px-3 py-2 text-[0.8125rem] text-[#b42318]">
                  {item.startWarning}
                </p>
              ) : null}

              {consentCustomerId === item.customerId && item.pendingShareId ? (
                <div className="space-y-3 rounded-2xl bg-[#f7faf5] px-3 py-3">
                  <p className="text-[0.875rem] font-semibold text-[#1d1d1f]">請顧客確認隱私後取得連結</p>
                  <p className="text-[0.8125rem] text-[#636366]">
                    預設不公開姓名與量測數字。確認後即可複製朋友連結。
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <CrmButton
                      type="button"
                      disabled={busyId === `consent-${item.customerId}`}
                      onClick={() =>
                        void post(
                          {
                            action: "activate_consent",
                            customerId: item.customerId,
                            shareId: item.pendingShareId,
                            showIntroducerName: false,
                            showDayCount: true,
                            showMeasurementDelta: false,
                          },
                          `consent-${item.customerId}`,
                        )
                      }
                    >
                      顧客已確認，取得連結
                    </CrmButton>
                    <CrmButton
                      type="button"
                      variant="secondary"
                      onClick={() => setConsentCustomerId(null)}
                    >
                      取消
                    </CrmButton>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {item.primaryCta === "confirm_consent" && item.pendingShareId ? (
                  <CrmButton
                    type="button"
                    onClick={() => setConsentCustomerId(item.customerId)}
                  >
                    請顧客確認
                  </CrmButton>
                ) : null}
                {item.canManualStart ? (
                  <CrmButton
                    type="button"
                    disabled={busyId === `start-${item.customerId}`}
                    onClick={() =>
                      void post(
                        {
                          action: "start",
                          customerId: item.customerId,
                          opportunityId: item.opportunityId,
                          shareType: item.suggestedShareTypes[0] ?? "coach_referral",
                        },
                        `start-${item.customerId}`,
                      )
                    }
                  >
                    啟動分享
                  </CrmButton>
                ) : null}
                {item.enrollmentId ? (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-2xl bg-[#f5f5f7] px-4 text-[0.875rem] font-semibold text-[#1d1d1f]"
                    href={`/coaching/${item.enrollmentId}`}
                  >
                    前往陪跑
                  </Link>
                ) : (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-2xl bg-[#f5f5f7] px-4 text-[0.875rem] font-semibold text-[#1d1d1f]"
                    href={`/customers/${item.customerId}`}
                  >
                    查看顧客
                  </Link>
                )}
              </div>
            </CrmCard>
          ))}
        </section>
      </div>
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-3 py-3 text-center shadow-sm ring-1 ring-[#eceee9]">
      <p className="text-[1.25rem] font-semibold text-[#1d1d1f]">{value}</p>
      <p className="text-[0.75rem] text-[#86868b]">{label}</p>
    </div>
  );
}
