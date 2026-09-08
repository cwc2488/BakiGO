"use client";

import type { Lose2kgLiveDashboard } from "@/types/lose2kg";
import { useEffect, useState } from "react";

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
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f7f3ea_40%,#ffffff_100%)] text-[#1d1d1f]">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
        <header className="space-y-3 text-center">
          <p className="text-[0.75rem] font-semibold tracking-[0.2em] text-[#c4a35a]">再瘦2公斤</p>
          <h1 className="text-[2rem] font-semibold leading-tight">
            {data?.periodName ?? "活動儀表板"}
          </h1>
          {data ? (
            <p className="text-[1rem] text-[#86868b]">
              第 {data.currentSlot} 週 / 4
              {data.nextMeasurementDate ? ` · 下一次量測 ${data.nextMeasurementDate}` : ""}
            </p>
          ) : null}
        </header>

        {error ? (
          <p className="rounded-2xl bg-[#fff2f2] px-4 py-3 text-center text-[#d70015]">{error}</p>
        ) : null}

        {data?.liveDrawStatus === "drawing" ? (
          <div className="rounded-[1.5rem] border border-[#c4a35a]/40 bg-[#1d1d1f] px-4 py-6 text-center text-[#f5f0e8]">
            <p className="text-[1.25rem] font-semibold">🎉 抽獎進行中</p>
          </div>
        ) : null}

        {data && data.winners.length > 0 ? (
          <section className="rounded-[1.5rem] border border-[#e8e4dc] bg-[#fffcf7] px-4 py-5 text-center">
            <p className="text-[0.75rem] font-semibold tracking-[0.14em] text-[#c4a35a]">
              本期得獎者
            </p>
            <div className="mt-3 space-y-2">
              {data.winners.map((w, i) => (
                <div key={`${w.winnerName}-${i}`}>
                  <p className="text-[0.8125rem] text-[#86868b]">{w.prizeName}</p>
                  <p className="text-[1.5rem] font-semibold">{w.winnerName}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {data ? (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="參賽人數" value={String(data.participantCount)} />
            <Stat label="目前總抽獎券" value={String(data.totalTickets)} />
            <Stat label="目前最高票數" value={String(data.maxTickets)} />
            <Stat label="下一次量測" value={data.nextMeasurementDate ?? "—"} />
          </section>
        ) : null}

        {data ? (
          <section className="space-y-3">
            <h2 className="px-1 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#86868b]">
              排行榜
            </h2>
            <ol className="overflow-hidden rounded-[1.5rem] border border-[#e8e4dc] bg-white">
              {data.leaderboard.map((row) => (
                <li
                  key={`${row.rank}-${row.publicDisplayName}`}
                  className={`flex items-center justify-between border-b border-[#f3efe6] px-4 py-3 last:border-b-0 ${
                    row.rank <= 3 ? "bg-[#fffcf7]" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`w-7 text-[1rem] font-semibold ${
                        row.rank === 1
                          ? "text-[#c4a35a]"
                          : row.rank <= 3
                            ? "text-[#1d1d1f]"
                            : "text-[#86868b]"
                      }`}
                    >
                      {row.rank}
                    </span>
                    <span className="truncate text-[1.0625rem] font-semibold">
                      {row.publicDisplayName}
                    </span>
                  </div>
                  <span className="text-[1.125rem] font-semibold text-[#c4a35a]">
                    🎟 {row.totalTickets}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {!data && !error ? <p className="text-center text-[#86868b]">載入中…</p> : null}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e8e4dc] bg-white px-3 py-4 text-center">
      <p className="text-[0.7rem] text-[#86868b]">{label}</p>
      <p className="mt-1 text-[1.25rem] font-semibold">{value}</p>
    </div>
  );
}
