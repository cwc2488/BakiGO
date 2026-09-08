"use client";

import type { Lose2kgPublicTicketPage } from "@/types/lose2kg";
import { useEffect, useState } from "react";

export function Lose2kgPublicTicketPageView({ token }: { token: string }) {
  const [data, setData] = useState<Lose2kgPublicTicketPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/lose2kg/public/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as { ok?: boolean; data?: Lose2kgPublicTicketPage; error?: string };
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
    <div className="min-h-dvh bg-[linear-gradient(180deg,#f7fbf8_0%,#ffffff_45%,#f5f5f7_100%)] px-4 py-8">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6">
        <header className="space-y-2 text-center">
          <p className="text-[0.8125rem] font-semibold tracking-[0.14em] text-[#248a3d]">
            再瘦2公斤
          </p>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-[#1d1d1f]">
            {data?.periodName ?? "票數查詢"}
          </h1>
          {data ? (
            <p className="text-[0.875rem] text-[#86868b]">
              {data.measurementDates[0]} → {data.measurementDates[3]}
            </p>
          ) : null}
        </header>

        {error ? (
          <p className="rounded-2xl bg-[#fff2f2] px-4 py-3 text-center text-[#d70015]">{error}</p>
        ) : null}

        {!data && !error ? (
          <p className="text-center text-[#86868b]">載入中…</p>
        ) : null}

        {data ? (
          <ul className="space-y-2">
            {data.participants.map((row, index) => (
              <li
                key={`${row.publicDisplayName}-${index}`}
                className="flex items-center justify-between rounded-2xl border border-[#d2d2d7] bg-white px-4 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-[1.125rem] font-semibold text-[#1d1d1f]">
                    {index + 1}. {row.publicDisplayName}
                  </p>
                </div>
                <p className="text-[1.375rem] font-semibold text-[#248a3d]">
                  {row.totalTickets} 張
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
