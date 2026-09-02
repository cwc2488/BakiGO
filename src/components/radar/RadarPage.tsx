"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { PageShell } from "@/components/ui/PageShell";
import type {
  RadarPartnerAction,
} from "@/lib/radar/partner/apply-radar-partner-action";
import {
  formatProtectionDate,
  radarErrorMessage,
  type RadarPartnerCard,
  type RadarPartnerDevelopmentItem,
  type RadarPartnerFeed,
  type RadarPartnerNotice,
} from "@/lib/radar/partner/radar-partner-presentation";
import { RadarRegionPreference } from "@/components/radar/RadarRegionPreference";
import { RadarFeedbackControls } from "@/components/radar/RadarFeedbackControls";

const NOTICE_COPY: Record<RadarPartnerNotice, string> = {
  no_public_posts: "公開貼文很少，資訊有限",
  below_profile_threshold: "目前還看不到足夠的公開貼文",
  stale: "這筆公開資料偏舊",
  source_unavailable: "暫時無法更新 Threads 資料",
  insufficient_evidence: "資訊不足",
};

const FRESHNESS_COPY = {
  fresh: "資料是近期的",
  stale: "公開資料偏舊",
  unknown: "還不能確認資料新舊",
} as const;

function listCopy(feed: RadarPartnerFeed): { title: string; body: string } {
  if (feed.list_size === "empty" && feed.empty_reason === "no_snapshot") {
    return {
      title: "今天還沒有推薦名單",
      body: "名單會依你自己的推薦產生。沒有名單時不會用假資料補滿。",
    };
  }
  if (feed.list_size === "empty") {
    return {
      title: "今天的推薦都已處理完了",
      body: "開始開發、略過或已認識的人，不會再出現在今天的名單。",
    };
  }
  if (feed.list_size === "partial") {
    return {
      title: `今天有 ${feed.recommendation_count} 位推薦`,
      body: `名單不足 ${feed.daily_cap} 人時不會補假資料。先處理眼前這幾位就好。`,
    };
  }
  return {
    title: `今天有 ${feed.recommendation_count} 位推薦`,
    body: "從最上面開始。選一位，決定要不要開發。",
  };
}

function MyDevelopmentSection({ items }: { items: RadarPartnerDevelopmentItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="home-section space-y-2">
      <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">我的開發中</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.candidate_id}
            className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3"
          >
            <p className="truncate text-[0.9375rem] font-semibold text-[#1d1d1f]">
              {item.username ? `@${item.username}` : "Threads 帳號"}
            </p>
            <p className="mt-1 text-[0.8125rem] text-[#636366]">
              {item.protection_expired
                ? "開發保護已到期"
                : `Radar 開發保護至 ${formatProtectionDate(item.protected_until)}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RadarCard({
  card,
  busy,
  onAction,
}: {
  card: RadarPartnerCard;
  busy: boolean;
  onAction: (candidateId: string, action: RadarPartnerAction) => void;
}) {
  const who = card.username ? `@${card.username}` : "Threads 帳號";
  const why = card.why_insufficient ? "資訊不足，先不要自行腦補理由。" : card.why.join(" ");
  const notices = card.notices.filter((notice) => notice !== "insufficient_evidence");

  return (
    <article className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[1.125rem] font-semibold text-[#1d1d1f]">{who}</h2>
          <p className="mt-1 text-[0.8125rem] text-[#86868b]">{FRESHNESS_COPY[card.freshness]}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
            推薦分數
          </span>
          <span className="text-[1.25rem] font-semibold tabular-nums text-[#1d1d1f]">{card.score}</span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {card.primary_need ? (
          <span className="rounded-full bg-[var(--brand-primary-muted)] px-2.5 py-1 text-[0.75rem] font-semibold text-[var(--brand-primary-dark)]">
            {card.primary_need}
          </span>
        ) : null}
        {card.change_signal ? (
          <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[0.75rem] font-semibold text-[#1d1d1f]">
            {card.change_signal}
          </span>
        ) : null}
        {notices.map((notice) => (
          <span key={notice} className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[0.75rem] text-[#636366]">
            {NOTICE_COPY[notice]}
          </span>
        ))}
      </div>

      <p className="mt-4 text-[0.75rem] font-semibold tracking-wide text-[#86868b]">為什麼值得現在開發</p>
      <p className="mt-1 text-[0.9375rem] leading-6 text-[#1d1d1f]">{why}</p>

      {card.evidence.length > 0 ? (
        <div className="mt-3 space-y-2">
          {card.evidence.map((item) => (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block min-h-11 rounded-2xl bg-[var(--brand-bg)] px-3 py-2.5 text-[0.8125rem] leading-5 text-[var(--brand-primary-dark)]"
            >
              <span className="font-semibold">{item.kind === "post" ? "看公開貼文" : "看公開主頁"}</span>
              {item.summary ? <span className="mt-0.5 block text-[#636366]">{item.summary}</span> : null}
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[0.8125rem] text-[#86868b]">目前沒有可打開的公開連結。</p>
      )}

      <RadarFeedbackControls
        candidateId={card.candidate_id}
        initial={card.feedback}
        disabled={busy}
      />

      <div className="mt-4 grid grid-cols-1 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(card.candidate_id, "start")}
          className="flex min-h-11 items-center justify-center rounded-2xl bg-[#1d1d1f] px-3 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
        >
          開始開發
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(card.candidate_id, "skip")}
            className="flex min-h-11 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white px-3 text-[0.875rem] font-semibold text-[#1d1d1f] disabled:opacity-50"
          >
            略過
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(card.candidate_id, "already_known")}
            className="flex min-h-11 items-center justify-center rounded-2xl border border-[var(--brand-border)] bg-white px-3 text-[0.875rem] font-semibold text-[#1d1d1f] disabled:opacity-50"
          >
            我認識他
          </button>
        </div>
      </div>
    </article>
  );
}

export function RadarPage() {
  const [feed, setFeed] = useState<RadarPartnerFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; customerLink: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/radar/feed");
      const payload = (await response.json()) as { ok?: boolean; feed?: RadarPartnerFeed; error?: string };
      if (!response.ok || !payload.ok || !payload.feed) {
        throw new Error(
          radarErrorMessage({
            status: response.status,
            error: payload.error,
            fallback: "現在讀不到今日推薦，請稍後再試。",
          }),
        );
      }
      setFeed(payload.feed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法載入今日推薦");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAction = useCallback(
    async (candidateId: string, action: RadarPartnerAction) => {
      setBusyId(candidateId);
      setNotice(null);
      try {
        const response = await fetchWithMemberAuth("/api/radar/actions", {
          method: "POST",
          body: JSON.stringify({ candidate_id: candidateId, action }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
          code?: string;
          protected_until?: string;
        };
        if (!response.ok || !payload.ok) {
          const message = radarErrorMessage({
            status: response.status,
            error: payload.error,
            fallback: "這個動作沒有存成功，請稍後再試。",
          });
          // The candidate is simply gone for this member: neutral copy, refreshed list.
          if (payload.code === "candidate_unavailable") {
            setNotice({ text: message, customerLink: false });
            await load();
            return;
          }
          throw new Error(message);
        }
        if (action === "start") {
          const until = payload.protected_until
            ? `Radar 開發保護至 ${formatProtectionDate(payload.protected_until)}。`
            : "";
          setNotice({
            text: `已開始開發。${until}接下來到顧客名單繼續跟進，不會自動私訊 Threads。`,
            customerLink: true,
          });
        } else if (action === "already_known") {
          setNotice({ text: "已標成我認識的人，今天不會再出現。", customerLink: false });
        } else {
          setNotice({ text: "已略過，今天不會再出現。", customerLink: false });
        }
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "無法更新");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const copy = feed ? listCopy(feed) : { title: "今日推薦", body: "載入你自己的名單。" };

  return (
    <PageShell title="今日推薦" subtitle={copy.body} backHref="/" backLabel="返回首頁" titleIcon="pipeline">
      {loading ? (
        <p className="home-section text-[0.9375rem] text-[#86868b]">載入今日推薦…</p>
      ) : null}
      {error ? (
        <p className="home-section rounded-2xl bg-[#fff2f2] px-4 py-3 text-[0.9375rem] text-[#c41e3a]">{error}</p>
      ) : null}
      {notice ? (
        <div className="home-section rounded-2xl bg-[var(--brand-primary-muted)] px-4 py-3 text-[0.9375rem] text-[var(--brand-primary-dark)]">
          <p>{notice.text}</p>
          {notice.customerLink ? (
            <Link className="mt-2 inline-flex min-h-11 items-center font-semibold" href="/customers">
              到顧客名單 →
            </Link>
          ) : null}
        </div>
      ) : null}
      {feed && !loading ? (
        <section className="home-section space-y-3">
          <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{copy.title}</p>
          {feed.items.length === 0 ? (
            <div className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-8 text-center">
              <p className="text-[0.9375rem] leading-6 text-[#636366]">{copy.body}</p>
            </div>
          ) : (
            feed.items.map((card) => (
              <RadarCard
                key={card.candidate_id}
                busy={busyId === card.candidate_id}
                card={card}
                onAction={onAction}
              />
            ))
          )}
        </section>
      ) : null}
      {feed && !loading ? <MyDevelopmentSection items={feed.my_development} /> : null}
      {feed && !loading ? <RadarRegionPreference /> : null}
    </PageShell>
  );
}
