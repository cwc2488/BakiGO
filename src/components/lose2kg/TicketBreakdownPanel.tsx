"use client";

import type { Lose2kgTicketBreakdown } from "@/lib/lose2kg/ticket-breakdown";

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Delta({ value }: { value: number }) {
  if (value > 0) return <span className="font-semibold text-[#2f7d4a]">+{value}</span>;
  if (value < 0) return <span className="font-semibold text-[#b42318]">{value}</span>;
  return <span className="text-[#86868b]">0</span>;
}

export function TicketBreakdownPanel({
  breakdown,
  onClose,
}: {
  breakdown: Lose2kgTicketBreakdown;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[#ebe6dc] px-4 py-3">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#8a7350]">
            抽獎券計算明細
          </p>
          <h2 className="text-[1.25rem] font-semibold text-[#1d1d1f]">{breakdown.displayName}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-[0.875rem] text-[#86868b] transition active:scale-[0.97] hover:bg-[#f4f1ea]"
          >
            關閉
          </button>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-[#ebe6dc] bg-[#faf8f4] px-2 py-3">
            <p className="text-[0.65rem] text-[#86868b]">體重票</p>
            <p className="text-[1.125rem] font-semibold tabular-nums">
              {breakdown.summary.weightTickets}
            </p>
          </div>
          <div className="rounded-lg border border-[#ebe6dc] bg-[#faf8f4] px-2 py-3">
            <p className="text-[0.65rem] text-[#86868b]">額外票</p>
            <p className="text-[1.125rem] font-semibold tabular-nums">
              {breakdown.summary.extraTickets}
            </p>
          </div>
          <div className="rounded-lg border border-[#1d1d1f] bg-[#1d1d1f] px-2 py-3 text-white">
            <p className="text-[0.65rem] text-white/70">總抽獎券</p>
            <p className="text-[1.125rem] font-semibold tabular-nums">
              {breakdown.summary.totalTickets}
            </p>
          </div>
        </section>

        <section className="space-y-1 text-[0.875rem] text-[#424245]">
          {breakdown.baselineKg != null ? (
            <p>
              原始體重：<strong>{breakdown.baselineKg.toFixed(1)} kg</strong>
            </p>
          ) : null}
          {breakdown.currentKg != null ? (
            <p>
              目前體重：<strong>{breakdown.currentKg.toFixed(1)} kg</strong>
            </p>
          ) : null}
          {breakdown.currentChangePct != null ? (
            <p>
              目前變化：
              <strong>
                {breakdown.currentChangePct > 0 ? "+" : ""}
                {breakdown.currentChangePct.toFixed(1)}%
              </strong>
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <h3 className="text-[0.75rem] font-semibold tracking-[0.12em] text-[#86868b]">
            量測與體重票
          </h3>
          <ol className="space-y-0">
            {breakdown.measurements.map((m, i) => (
              <li key={m.slot} className="relative flex gap-3 pb-4 last:pb-0">
                {i < breakdown.measurements.length - 1 ? (
                  <span className="absolute left-[0.4rem] top-3 h-[calc(100%-0.5rem)] w-px bg-[#e8e4dc]" />
                ) : null}
                <span
                  className={`relative z-[1] mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    m.ticketDelta > 0
                      ? "bg-[#2f7d4a]"
                      : m.ticketDelta < 0
                        ? "bg-[#b42318]"
                        : "bg-[#c7c2b8]"
                  }`}
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[#1d1d1f]">
                      第 {m.slot} 次量測
                      {m.date
                        ? `｜${(() => {
                            const parts = m.date.split("-");
                            return parts.length >= 3
                              ? `${Number(parts[1])}/${Number(parts[2])}`
                              : m.date;
                          })()}`
                        : ""}
                      {m.slot === 1 ? " · 基準" : ""}
                    </p>
                    <Delta value={m.ticketDelta} />
                  </div>
                  {m.weightKg != null ? (
                    <p className="text-[0.875rem] tabular-nums text-[#424245]">
                      {m.weightKg.toFixed(1)} kg
                      {m.changePct != null
                        ? ` · ${m.changePct > 0 ? "+" : ""}${m.changePct.toFixed(1)}%`
                        : ""}
                    </p>
                  ) : m.changePct != null ? (
                    <p className="text-[0.875rem] text-[#424245]">
                      {m.changePct > 0 ? "+" : ""}
                      {m.changePct.toFixed(1)}%
                    </p>
                  ) : null}
                  <p className="text-[0.8125rem] text-[#6e6e73]">{m.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {breakdown.milestones.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-[0.75rem] font-semibold tracking-[0.12em] text-[#86868b]">
              里程碑狀態
            </h3>
            <ul className="space-y-1.5">
              {breakdown.milestones.map((m) => (
                <li
                  key={m.percent}
                  className="flex items-center justify-between rounded-lg border border-[#ebe6dc] px-3 py-2 text-[0.8125rem]"
                >
                  <span>
                    -{m.percent}% · ✓ 曾達成
                    {m.firstAchievedSlot != null ? `（第 ${m.firstAchievedSlot} 次）` : ""}
                  </span>
                  <span
                    className={
                      m.currentlyActive ? "font-medium text-[#2f7d4a]" : "text-[#86868b]"
                    }
                  >
                    {m.currentlyActive ? "目前有效" : "目前失效"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-[0.75rem] font-semibold tracking-[0.12em] text-[#86868b]">
            額外票
          </h3>
          {breakdown.extraTickets.length === 0 ? (
            <p className="text-[0.8125rem] text-[#86868b]">尚無額外票紀錄</p>
          ) : (
            <ul className="space-y-2">
              {breakdown.extraTickets.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-[#ebe6dc] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-[0.75rem] text-[#86868b]">{formatWhen(e.at)}</p>
                    <p className="text-[0.875rem] text-[#1d1d1f]">{e.description}</p>
                  </div>
                  <Delta value={e.delta} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="rounded-lg bg-[#f4f1ea] px-3 py-2 text-center text-[0.875rem] font-medium text-[#1d1d1f]">
          合計：體重票 {breakdown.summary.weightTickets} + 額外票{" "}
          {breakdown.summary.extraTickets} ={" "}
          <strong>{breakdown.summary.totalTickets}</strong> 張
        </p>
      </div>
    </div>
  );
}
