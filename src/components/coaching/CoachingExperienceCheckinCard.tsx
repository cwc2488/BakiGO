"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { EXPERIENCE_CHECKIN_POLICY } from "@/types/coaching-growth";

type CheckinState = {
  canSubmit: boolean;
  cooldownReason: string | null;
  latestCheckin: {
    respondedAt: string;
    outcomePerception: number | null;
    coachHelpfulness: number | null;
    experienceSatisfaction: number | null;
    recommendationWillingness: number | null;
    mostFeltChangeText: string | null;
    mostFeltChangeConsent: string;
  } | null;
};

function cooldownGapMs(reason: string | null): number {
  if (reason === "decline_cooldown") return EXPERIENCE_CHECKIN_POLICY.afterDeclineMs;
  if (reason === "recheck_cooldown") return EXPERIENCE_CHECKIN_POLICY.afterCompletedRecheckMs;
  if (reason === "coach_invite") return EXPERIENCE_CHECKIN_POLICY.coachInviteSoftCapMs;
  return EXPERIENCE_CHECKIN_POLICY.minGapMs;
}

function cooldownDaysRemaining(respondedAt: string | undefined, reason: string | null): number | null {
  if (!respondedAt || !reason) return null;
  const respondedMs = Date.parse(respondedAt);
  if (Number.isNaN(respondedMs)) return null;
  const remainingMs = cooldownGapMs(reason) - (Date.now() - respondedMs);
  if (remainingMs <= 0) return null;
  return Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

const PERCEPTION_LABELS = ["幾乎沒感覺", "有一點點", "還算有感", "明顯有感", "差很大"];
const HELP_LABELS = ["不太有幫助", "稍微有幫助", "還不錯", "很有幫助", "超有幫助"];
const EXPERIENCE_LABELS = ["不太好", "普通偏低", "還可以", "愉快", "很棒"];

function ScaleRow({
  title,
  hint,
  labels,
  value,
  onChange,
  max = 5,
}: {
  title: string;
  hint: string;
  labels?: string[];
  value: number | null;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[1rem] font-medium text-[#1d1d1f]">{title}</p>
        <p className="text-[0.8125rem] text-[#86868b]">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: max + (max === 10 ? 1 : 0) }, (_, i) => (max === 10 ? i : i + 1)).map((n) => {
          const selected = value === n;
          const label = labels && max === 5 ? labels[n - 1] : String(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`min-h-11 min-w-11 rounded-2xl px-3 text-[0.875rem] transition ${
                selected
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#ebebf0]"
              }`}
              aria-label={label}
            >
              {max === 10 ? n : n}
            </button>
          );
        })}
      </div>
      {value != null && labels && max === 5 ? (
        <p className="text-[0.8125rem] text-[#636366]">{labels[value - 1]}</p>
      ) : null}
    </div>
  );
}

/**
 * Minimal Customer Experience Check-in — feels like a progress reflection, not a survey.
 * Check-in ≠ Growth Ask (no referral ask here).
 */
export default function CoachingExperienceCheckinCard({ token }: { token: string }) {
  const [state, setState] = useState<CheckinState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);

  const [perception, setPerception] = useState<number | null>(null);
  const [helpfulness, setHelpfulness] = useState<number | null>(null);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [willingness, setWillingness] = useState<number | null>(null);
  const [feltChange, setFeltChange] = useState("");
  const [shareOk, setShareOk] = useState(false);
  const [struggle, setStruggle] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/experience-checkin`);
      const data = (await res.json()) as CheckinState & { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? "無法載入回顧");
      }
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入回顧");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/experience-checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerReason: "milestone",
          outcomePerception: perception,
          coachHelpfulness: helpfulness,
          experienceSatisfaction: satisfaction,
          recommendationWillingness: willingness,
          mostFeltChangeText: feltChange.trim() || null,
          mostFeltChangeConsent: shareOk ? "share_ok" : "coach_only",
          struggleFlag: struggle,
          declineGrowthAsk: false,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "送出失敗");
      }
      setDone(true);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setSaving(false);
    }
  };

  const daysUntilNext = useMemo(
    () =>
      cooldownDaysRemaining(
        state?.latestCheckin?.respondedAt,
        state?.canSubmit ? null : state?.cooldownReason ?? null,
      ),
    [state?.canSubmit, state?.cooldownReason, state?.latestCheckin?.respondedAt],
  );

  // Entry is always visible — cooldown only blocks submit, never hides the card.
  if (loading) {
    return (
      <CrmCard className="space-y-2">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">陪跑小回顧</p>
        <p className="text-[0.875rem] text-[#86868b]">載入中…</p>
      </CrmCard>
    );
  }

  return (
    <CrmCard className="space-y-4">
      <div className="space-y-1">
        <p className="text-[1.125rem] font-semibold text-[#1d1d1f]">陪跑小回顧</p>
        <p className="text-[0.875rem] text-[#636366]">
          不用寫報告——只要告訴我們，這段時間你真實的感覺。
        </p>
      </div>

      {done ? (
        <p className="text-[0.9375rem] text-[#1d1d1f]">謝謝你願意分享。教練會用這些回饋把陪跑做得更貼近你。</p>
      ) : null}

      {state?.latestCheckin && !open ? (
        <p className="text-[0.8125rem] text-[#86868b]">
          上次回顧：{state.latestCheckin.respondedAt.slice(0, 10)}
          {state.latestCheckin.mostFeltChangeText
            ? ` · 「${state.latestCheckin.mostFeltChangeText.slice(0, 40)}」`
            : ""}
        </p>
      ) : null}

      {error ? <p className="text-[0.875rem] text-[#c62828]">{error}</p> : null}

      {!open ? (
        state?.canSubmit ? (
          <CrmButton type="button" onClick={() => setOpen(true)}>
            花一分鐘回顧看看
          </CrmButton>
        ) : (
          <p className="text-[0.9375rem] leading-relaxed text-[#636366]">
            {daysUntilNext != null
              ? `你已完成最近一次回顧，下次可於 ${daysUntilNext} 日後再次填寫`
              : "你已完成最近一次回顧，稍後即可再次填寫"}
          </p>
        )
      ) : (
        <div className="space-y-6">
          <ScaleRow
            title="身體／狀態的改變，你自己有感嗎？"
            hint="從幾乎沒感覺到差很大"
            labels={PERCEPTION_LABELS}
            value={perception}
            onChange={setPerception}
          />
          <ScaleRow
            title="教練的陪跑，對你有幫助嗎？"
            hint="節奏、提醒、被照顧的感覺"
            labels={HELP_LABELS}
            value={helpfulness}
            onChange={setHelpfulness}
          />
          <ScaleRow
            title="整體體驗感覺如何？"
            hint="這段陪跑好不好走"
            labels={EXPERIENCE_LABELS}
            value={satisfaction}
            onChange={setSatisfaction}
          />
          <ScaleRow
            title="如果朋友也在找改變，你有多願意分享這段經驗？"
            hint="0＝不太想，10＝很願意（不是現在要請你介紹喔）"
            value={willingness}
            onChange={setWillingness}
            max={10}
          />
          <div className="space-y-2">
            <p className="text-[1rem] font-medium text-[#1d1d1f]">這段時間，你最有感的改變是什麼？</p>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-[#e5e5ea] bg-white px-4 py-3 text-[0.9375rem] text-[#1d1d1f]"
              placeholder="例如：精神變好、衣服變鬆、比較睡得著…"
              value={feltChange}
              onChange={(e) => setFeltChange(e.target.value)}
              maxLength={280}
            />
            <label className="flex items-start gap-3 text-[0.875rem] text-[#636366]">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={shareOk}
                onChange={(e) => setShareOk(e.target.checked)}
              />
              <span>如果之後做成果分享，我願意讓這段文字被用在分享內容（可再改）。</span>
            </label>
            <label className="flex items-start gap-3 text-[0.875rem] text-[#636366]">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5"
                checked={struggle}
                onChange={(e) => setStruggle(e.target.checked)}
              />
              <span>我目前覺得卡住／沒有感覺有效果，希望教練先幫我。</span>
            </label>
          </div>
          <div className="flex gap-3">
            <CrmButton type="button" disabled={saving} onClick={() => void submit()}>
              {saving ? "送出中…" : "送出回顧"}
            </CrmButton>
            <CrmButton type="button" variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
              先不要
            </CrmButton>
          </div>
        </div>
      )}
    </CrmCard>
  );
}
