"use client";

import type { Lose2kgPublicTempDrawPage } from "@/types/lose2kg";
import { useEffect, useState } from "react";

export function Lose2kgPublicTempDrawPageView({ token }: { token: string }) {
  const [data, setData] = useState<Lose2kgPublicTempDrawPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/lose2kg/draw/${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const body = (await res.json()) as {
      ok?: boolean;
      data?: Lose2kgPublicTempDrawPage;
      error?: string;
    };
    if (!res.ok) throw new Error(body.error || "載入失敗");
    setData(body.data ?? null);
    if (body.data?.winnerName) setWinner(body.data.winnerName);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function startDraw() {
    if (drawing || winner || data?.status === "completed") return;
    setDrawing(true);
    setError(null);
    const names = data?.presentNames ?? [];
    let tick = 0;
    const timer = window.setInterval(() => {
      if (names.length === 0) return;
      setDisplayName(names[tick % names.length]!);
      tick += 1;
    }, 60);

    try {
      const res = await fetch(`/api/lose2kg/draw/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        winnerName?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || "抽獎失敗");
      window.setTimeout(() => {
        window.clearInterval(timer);
        setWinner(body.winnerName ?? null);
        setDisplayName(body.winnerName ?? null);
        setDrawing(false);
        void load();
      }, 1200);
    } catch (err) {
      window.clearInterval(timer);
      setDrawing(false);
      setError(err instanceof Error ? err.message : "抽獎失敗");
      try {
        await load();
      } catch {
        // ignore
      }
    }
  }

  const locked = Boolean(winner) || data?.status === "completed";

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#dff5e6_0%,#ffffff_48%,#f5f5f7_100%)] px-4 py-10">
      <main className="mx-auto flex min-h-[80dvh] w-full max-w-lg flex-col items-center justify-center gap-8 text-center">
        <header className="space-y-2">
          <p className="text-[0.8125rem] font-semibold tracking-[0.16em] text-[#248a3d]">
            再瘦2公斤｜臨時抽獎
          </p>
          <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">
            {data?.periodName ?? "現場抽獎"}
          </h1>
          <p className="text-[1rem] text-[#86868b]">
            本次參加抽獎 {data?.entryCount ?? "—"} 人
          </p>
        </header>

        {error ? <p className="text-[#d70015]">{error}</p> : null}

        <div className="flex min-h-28 w-full items-center justify-center rounded-[2rem] border border-[#c9e8d2] bg-white/90 px-4 py-8 shadow-sm">
          <p
            className={`font-semibold text-[#1d1d1f] transition-transform duration-300 ${
              locked ? "scale-110 text-[2.5rem]" : "text-[2rem]"
            }`}
          >
            {displayName ?? winner ?? (locked ? "已抽出" : "準備開始")}
          </p>
        </div>

        {!locked ? (
          <button
            type="button"
            disabled={drawing || !data}
            onClick={() => void startDraw()}
            className="min-h-14 w-full max-w-xs rounded-full bg-[#1d1d1f] px-6 text-[1.125rem] font-semibold text-white disabled:opacity-50"
          >
            {drawing ? "抽獎中…" : "開始抽獎"}
          </button>
        ) : (
          <p className="text-[1rem] font-medium text-[#248a3d]">得獎者已鎖定，重新整理不會重抽</p>
        )}
      </main>
    </div>
  );
}
