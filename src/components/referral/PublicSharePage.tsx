"use client";

import { useCallback, useEffect, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";

type PublicShare = {
  shareId: string;
  shareType: string;
  headline: string;
  bodyCopy: string;
  introducerDisplayName: string | null;
  dayCount: number | null;
  shareText: string | null;
  measurementDeltaSummary: string | null;
  benefitLabel: string | null;
  acceptsNewReferral: boolean;
};

export default function PublicSharePage({ token }: { token: string }) {
  const [share, setShare] = useState<PublicShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [lineId, setLineId] = useState("");
  const [goalText, setGoalText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(token)}`);
      const data = (await res.json()) as { ok?: boolean; share?: PublicShare; error?: string };
      if (!res.ok || !data.ok || !data.share) {
        throw new Error(data.error ?? "找不到此分享頁");
      }
      setShare(data.share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "找不到此分享頁");
      setShare(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, phone, lineId, goalText }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "送出失敗");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-[var(--brand-bg)] px-4 py-8">
      {loading ? <p className="text-center text-[0.9375rem] text-[#86868b]">載入中…</p> : null}
      {error && !share ? (
        <CrmCard className="space-y-2 text-center">
          <h1 className="text-[1.25rem] font-semibold text-[#1d1d1f]">連結無法使用</h1>
          <p className="text-[0.9375rem] text-[#86868b]">{error}</p>
        </CrmCard>
      ) : null}

      {share ? (
        <div className="space-y-5">
          <header className="space-y-2 text-center">
            <p className="text-[0.8125rem] font-medium text-[var(--brand-primary-dark)]">Baki GO</p>
            <h1 className="text-[1.75rem] font-semibold leading-snug text-[#1d1d1f]">
              {share.headline}
            </h1>
            {share.introducerDisplayName ? (
              <p className="text-[0.9375rem] text-[#636366]">來自 {share.introducerDisplayName}</p>
            ) : null}
            {share.dayCount != null ? (
              <p className="text-[0.875rem] text-[#86868b]">陪跑第 {share.dayCount} 天</p>
            ) : null}
          </header>

          <CrmCard className="space-y-3">
            <p className="text-[1rem] leading-relaxed text-[#636366]">{share.bodyCopy}</p>
            {share.shareText ? (
              <blockquote className="rounded-2xl bg-[#f5f5f7] px-4 py-3 text-[0.9375rem] leading-relaxed text-[#1d1d1f]">
                「{share.shareText}」
              </blockquote>
            ) : null}
            {share.measurementDeltaSummary ? (
              <p className="text-[0.875rem] text-[#636366]">{share.measurementDeltaSummary}</p>
            ) : null}
            {share.benefitLabel ? (
              <p className="rounded-2xl bg-[#eef7f0] px-4 py-3 text-[0.9375rem] font-medium text-[#1d1d1f]">
                {share.benefitLabel}
              </p>
            ) : null}
          </CrmCard>

          {submitted ? (
            <CrmCard className="space-y-2 text-center">
              <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">已收到你的資料</p>
              <p className="text-[0.9375rem] text-[#86868b]">教練會再與你連絡，謝謝你的信任。</p>
            </CrmCard>
          ) : share.acceptsNewReferral ? (
            <div className="space-y-3">
              <a
                href={`/quiz/fat-loss?gs=${encodeURIComponent(token)}`}
                className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white px-4 text-center text-[0.9375rem] font-semibold text-[#1d1d1f]"
              >
                先做減脂心理測驗
              </a>
              {showForm ? (
              <CrmCard className="space-y-4">
                <h2 className="text-[1.125rem] font-semibold text-[#1d1d1f]">我也想了解</h2>
                <label className="block space-y-1">
                  <span className="text-[0.8125rem] text-[#86868b]">名字</span>
                  <input
                    className="min-h-12 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[0.8125rem] text-[#86868b]">電話</span>
                  <input
                    className="min-h-12 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[0.8125rem] text-[#86868b]">LINE（選填）</span>
                  <input
                    className="min-h-12 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4"
                    value={lineId}
                    onChange={(e) => setLineId(e.target.value)}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[0.8125rem] text-[#86868b]">最想改善什麼</span>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-3"
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                  />
                </label>
                {error ? <p className="text-[0.875rem] text-[#c62828]">{error}</p> : null}
                <CrmButton type="button" disabled={busy} onClick={() => void submit()}>
                  {busy ? "送出中…" : "送出"}
                </CrmButton>
              </CrmCard>
            ) : (
              <CrmButton type="button" onClick={() => setShowForm(true)}>
                我也想了解
              </CrmButton>
              )}
            </div>
          ) : (
            <CrmCard>
              <p className="text-center text-[0.9375rem] text-[#86868b]">此分享目前無法接受新朋友資料。</p>
            </CrmCard>
          )}
        </div>
      ) : null}
    </main>
  );
}
