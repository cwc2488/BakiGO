"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { PageShell } from "@/components/ui/PageShell";
import { QuizPartnerLeadCard, type QuizPartnerLeadCardData } from "@/components/quiz/QuizPartnerLeadCard";
import { QuizPartnerSharePanel } from "@/components/quiz/QuizPartnerSharePanel";
import {
  QuizPartnerPerformancePanel,
  type QuizPartnerFunnelView,
} from "@/components/quiz/QuizPartnerPerformancePanel";
import type { QuizPartnerRange } from "@/lib/quiz/partner/quiz-partner-presentation";

type Tab = "leads" | "share" | "performance";

type Summary = {
  waiting: number;
  contacted: number;
  joined: number;
  declined: number;
  monthNew: number;
  badge: number;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "leads", label: "21 天名單" },
  { id: "share", label: "我的分享" },
  { id: "performance", label: "我的成效" },
];

function parseTab(raw: string | null): Tab {
  if (raw === "share" || raw === "performance") return raw;
  return "leads";
}

export function QuizPartnerWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const [items, setItems] = useState<QuizPartnerLeadCardData[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [share, setShare] = useState<{ shareCode: string; href: string; display: string } | null>(null);
  const [funnel, setFunnel] = useState<QuizPartnerFunnelView | null>(null);
  const [range, setRange] = useState<QuizPartnerRange>("month");

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithMemberAuth("/api/quiz/21d");
      const payload = (await response.json()) as {
        ok?: boolean;
        interests?: QuizPartnerLeadCardData[];
        summary?: Summary;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "無法載入");
      setItems(payload.interests ?? []);
      setSummary(payload.summary ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "leads") void loadLeads();
  }, [loadLeads, tab]);

  useEffect(() => {
    if (tab !== "share") return;
    void fetchWithMemberAuth("/api/quiz/21d/share")
      .then(async (response) => {
        const payload = (await response.json()) as {
          shareCode?: string;
          href?: string;
          display?: string;
          error?: string;
        };
        if (!response.ok || !payload.shareCode || !payload.href || !payload.display) {
          throw new Error(payload.error ?? "無法載入分享連結");
        }
        setShare({ shareCode: payload.shareCode, href: payload.href, display: payload.display });
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "無法載入分享連結");
      });
  }, [tab]);

  useEffect(() => {
    if (tab !== "performance") return;
    void fetchWithMemberAuth(`/api/quiz/21d/performance?range=${range}`)
      .then(async (response) => {
        const payload = (await response.json()) as { funnel?: QuizPartnerFunnelView; error?: string };
        if (!response.ok || !payload.funnel) throw new Error(payload.error ?? "無法載入成效");
        setFunnel(payload.funnel);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "無法載入成效");
      });
  }, [range, tab]);

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "leads") params.delete("tab");
      else params.set("tab", next);
      const suffix = params.toString();
      router.replace(suffix ? `/quiz/21d?${suffix}` : "/quiz/21d");
    },
    [router, searchParams],
  );

  async function markContacted(id: string) {
    setBusyId(id);
    try {
      const response = await fetchWithMemberAuth(`/api/quiz/21d/${id}`, {
        method: "POST",
        body: JSON.stringify({ action: "mark_contacted" }),
      });
      if (!response.ok) throw new Error("無法標記");
      await loadLeads();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "無法標記");
    } finally {
      setBusyId(null);
    }
  }

  const metrics = useMemo(
    () => [
      { label: "待聯絡", value: summary?.waiting ?? 0, primary: true },
      { label: "已聯絡", value: summary?.contacted ?? 0, primary: false },
      { label: "已成交", value: summary?.joined ?? 0, primary: false },
    ],
    [summary],
  );

  return (
    <PageShell title="心理測驗" subtitle="有人主動想了解，你現在只要去跟他聊。" backHref="/customers">
      <nav className="flex gap-1 rounded-2xl bg-[#f4e6ea] p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`relative min-h-11 flex-1 rounded-xl px-2 text-[0.8125rem] font-semibold ${
              tab === item.id ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#8a5a66]"
            }`}
          >
            {item.label}
            {item.id === "leads" && summary?.badge ? (
              <span className="absolute -right-0.5 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#c08a98] px-1 text-[0.625rem] text-white">
                {summary.badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === "leads" ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className={`rounded-2xl px-3 py-3 text-center ${
                  metric.primary ? "bg-[#c08a98] text-white" : "bg-[#fffdf9] text-[#1d1d1f] ring-1 ring-[#eadfd6]"
                }`}
              >
                <p className={`text-[0.75rem] ${metric.primary ? "text-white/90" : "text-[#86868b]"}`}>
                  {metric.label}
                </p>
                <p className="mt-1 text-[1.375rem] font-semibold tabular-nums">{metric.value}</p>
              </div>
            ))}
          </div>
          {summary && summary.monthNew > 0 ? (
            <p className="text-[0.8125rem] text-[#86868b]">本月新意向 {summary.monthNew}</p>
          ) : null}
          {loading ? (
            <p className="text-sm text-[#86868b]">載入中…</p>
          ) : items.length === 0 ? (
            <section className="rounded-[1.5rem] border border-[#eadfd6] bg-[#fffdf9] p-5">
              <p className="text-[0.9375rem] leading-7 text-[#86868b]">
                還沒有人想了解 21 天。先把心理測驗分享出去。
              </p>
              <button
                type="button"
                onClick={() => setTab("share")}
                className="mt-4 min-h-11 w-full rounded-2xl bg-[#1d1d1f] text-[0.875rem] font-semibold text-white"
              >
                去複製我的分享連結
              </button>
            </section>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <QuizPartnerLeadCard
                    item={item}
                    busy={busyId === item.id}
                    onMarkContacted={(id) => void markContacted(id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {tab === "share" ? (
        share ? (
          <QuizPartnerSharePanel display={share.display} href={share.href} shareCode={share.shareCode} />
        ) : (
          <p className="text-sm text-[#86868b]">載入中…</p>
        )
      ) : null}

      {tab === "performance" ? (
        funnel ? (
          <QuizPartnerPerformancePanel funnel={funnel} onRange={setRange} range={range} />
        ) : (
          <p className="text-sm text-[#86868b]">載入中…</p>
        )
      ) : null}
    </PageShell>
  );
}
