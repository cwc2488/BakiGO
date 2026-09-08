"use client";

import type { Lose2kgLiveDashboard } from "@/types/lose2kg";
import { useEffect, useState } from "react";

function shortDate(iso: string) {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export function Lose2kgLiveDashboardPage({ token }: { token: string }) {
  const [data, setData] = useState<Lose2kgLiveDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/lose2kg/live/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: Lose2kgLiveDashboard;
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || "載入失敗");
        if (!cancelled) {
          setData(body.data ?? null);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f4f1ea_40%,#ffffff_100%)] text-[#1d1d1f]">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="space-y-2 text-center">
          <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-[#8a7350]">再瘦2公斤</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight">
            {data?.periodName ?? "活動儀表板"}
          </h1>
          {data ? (
            <div className="space-y-1 text-[0.9375rem] text-[#86868b]">
              <p>
                本期進度：第 {data.currentSlot} / 4 次量測
              </p>
              <p>下一次：{data.nextMeasurementDate ? shortDate(data.nextMeasurementDate) : "—"}</p>
            </div>
          ) : null}
        </header>

        {error ? (
          <p className="rounded-lg bg-[#fff2f2] px-4 py-3 text-center text-[#d70015]">{error}</p>
        ) : null}

        {!data && !error ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-[#ebe6dc]" />
            <div className="h-24 animate-pulse rounded-xl bg-[#ebe6dc]" />
            <div className="h-48 animate-pulse rounded-xl bg-[#ebe6dc]" />
          </div>
        ) : null}

        {data?.liveDrawStatus === "drawing" ? (
          <div className="rounded-xl border border-[#8a7350]/35 bg-[#1d1d1f] px-4 py-5 text-center text-[#f5f0e8]">
            <p className="text-[1.125rem] font-semibold">抽獎進行中</p>
          </div>
        ) : null}

        {data && data.winners.length > 0 ? (
          <section className="rounded-xl border border-[#e8e4dc] bg-white px-4 py-4 text-center">
            <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-[#8a7350]">
              本期得獎者
            </p>
            <div className="mt-2 space-y-2">
              {data.winners.map((w, i) => (
                <div key={`${w.winnerName}-${i}`}>
                  <p className="text-[0.75rem] text-[#86868b]">{w.prizeName}</p>
                  <p className="text-[1.375rem] font-semibold">{w.winnerName}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {data ? (
          <section className="grid grid-cols-3 gap-2 text-center">
            <Stat label="參賽人數" value={String(data.participantCount)} />
            <Stat label="總抽獎券" value={String(data.totalTickets)} />
            <Stat label="目前最高票" value={String(data.maxTickets)} />
          </section>
        ) : null}

        {data ? (
          <section className="space-y-2">
            <h2 className="px-1 text-[0.7rem] font-semibold tracking-[0.12em] text-[#86868b]">
              票數排行
            </h2>
            <ol className="overflow-hidden rounded-xl border border-[#e8e4dc] bg-white">
              {data.leaderboard.map((row) => (
                <li
                  key={`${row.rank}-${row.publicDisplayName}`}
                  className="flex items-center justify-between border-b border-[#f3efe6] px-3 py-2.5 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`w-6 text-[0.9375rem] font-semibold tabular-nums ${
                        row.rank === 1
                          ? "text-[#8a7350]"
                          : row.rank <= 3
                            ? "text-[#1d1d1f]"
                            : "text-[#86868b]"
                      }`}
                    >
                      {row.rank}
                    </span>
                    <span className="truncate text-[0.9375rem] font-medium">
                      {row.publicDisplayName}
                    </span>
                  </div>
                  <span className="text-[0.9375rem] font-semibold text-[#8a7350]">
                    🎟 {row.totalTickets}
                  </span>
                </li>
              ))}
              {data.leaderboard.length === 0 ? (
                <li className="px-3 py-4 text-center text-[0.875rem] text-[#86868b]">尚無參賽者</li>
              ) : null}
            </ol>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e8e4dc] bg-white px-2 py-3">
      <p className="text-[0.65rem] text-[#86868b]">{label}</p>
      <p className="mt-0.5 text-[1.125rem] font-semibold tabular-nums">{value}</p>
    </div>
  );
}
