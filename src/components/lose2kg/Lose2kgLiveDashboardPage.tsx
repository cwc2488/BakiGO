"use client";

import { TicketBreakdownPanel } from "@/components/lose2kg/TicketBreakdownPanel";
import type { Lose2kgTicketBreakdown } from "@/lib/lose2kg/ticket-breakdown";
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
  const [breakdown, setBreakdown] = useState<Lose2kgTicketBreakdown | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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

  async function openBreakdown(participantId: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(
        `/api/lose2kg/live/${encodeURIComponent(token)}/participants/${encodeURIComponent(participantId)}/ticket-breakdown`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        breakdown?: Lose2kgTicketBreakdown;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "明細載入失敗");
      setBreakdown(body.breakdown ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "明細載入失敗");
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f4f1ea_40%,#ffffff_100%)] text-[#1d1d1f]">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="space-y-2 text-center">
          <p className="text-[0.7rem] font-semibold tracking-[0.2em] text-[#8a7350]">再瘦2公斤</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight">
            {data?.periodName ?? "抽獎券追蹤"}
          </h1>
          {data ? (
            <div className="space-y-1 text-[0.9375rem] text-[#86868b]">
              <p>本期進度：第 {data.currentSlot} / 4 次量測</p>
              <p>
                下一次量測：
                {data.nextMeasurementDate ? shortDate(data.nextMeasurementDate) : "—"}
              </p>
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
              參賽者抽獎券
            </h2>
            <ol className="overflow-hidden rounded-xl border border-[#e8e4dc] bg-white">
              {data.leaderboard.map((row) => (
                <li
                  key={row.participantId}
                  className="border-b border-[#f3efe6] px-3 py-3 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-3">
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
                      <div className="min-w-0">
                        <p className="truncate text-[0.9375rem] font-medium">
                          {row.publicDisplayName}
                        </p>
                        <p className="text-[0.75rem] text-[#86868b]">
                          體重票 {row.weightTickets} · 額外票 {row.extraTickets}
                          {row.weightChangePct != null
                            ? ` · ${row.weightChangePct.toFixed(1)}%`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[0.9375rem] font-semibold text-[#8a7350]">
                        🎟 {row.totalTickets}
                      </span>
                      <button
                        type="button"
                        disabled={loadingDetail}
                        onClick={() => void openBreakdown(row.participantId)}
                        className="text-[0.75rem] font-medium text-[#1d1d1f] underline-offset-2 transition active:scale-[0.97] hover:underline disabled:opacity-50"
                      >
                        查看明細
                      </button>
                    </div>
                  </div>
                </li>
              ))}
              {data.leaderboard.length === 0 ? (
                <li className="px-3 py-4 text-center text-[0.875rem] text-[#86868b]">
                  尚無參賽者
                </li>
              ) : null}
            </ol>
          </section>
        ) : null}
      </main>

      {breakdown ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35">
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl sm:max-w-lg">
            <TicketBreakdownPanel breakdown={breakdown} onClose={() => setBreakdown(null)} />
          </div>
        </div>
      ) : null}
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
