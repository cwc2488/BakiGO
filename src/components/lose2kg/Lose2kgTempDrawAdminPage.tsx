"use client";

import { PageShell } from "@/components/ui/PageShell";
import { BrandCard, PrimaryButton } from "@/components/ui/brand-ui";
import {
  createLose2kgTempDraw,
  fetchLose2kgHome,
  fetchLose2kgPeriod,
  voidLose2kgTempDraw,
} from "@/lib/lose2kg/client";
import type { Lose2kgParticipant, Lose2kgPeriod, Lose2kgTempDrawSession } from "@/types/lose2kg";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

export function Lose2kgTempDrawAdminPage() {
  const search = useSearchParams();
  const initialPeriodId = search.get("periodId") ?? "";
  const [periods, setPeriods] = useState<Lose2kgPeriod[]>([]);
  const [periodId, setPeriodId] = useState(initialPeriodId);
  const [participants, setParticipants] = useState<Lose2kgParticipant[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sessions, setSessions] = useState<Lose2kgTempDrawSession[]>([]);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const home = await fetchLose2kgHome();
        if (cancelled) return;
        const all = [...home.active, ...home.draft, ...home.completed];
        setPeriods(all);
        if (!periodId && all[0]) setPeriodId(all[0].id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!periodId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLose2kgPeriod(periodId);
        if (cancelled) return;
        const active = data.participants.filter((p) => p.status === "active");
        setParticipants(active);
        setSelected(new Set(active.map((p) => p.id)));
        setSessions(data.tempSessions);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [periodId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.publicDisplayName.toLowerCase().includes(q),
    );
  }, [participants, query]);

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await action();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "操作失敗");
        }
      })();
    });
  }

  return (
    <PageShell title="臨時抽獎" subtitle="每人機率相等，與正式抽獎券無關" backHref="/admin/lose2kg" backLabel="返回">
      {error ? <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p> : null}
      {hint ? <p className="rounded-xl bg-[#e8f8ee] px-3 py-2 text-[0.875rem] text-[#248a3d]">{hint}</p> : null}

      <BrandCard variant="bordered" className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[0.75rem] text-[#86868b]">選擇期數</span>
          <select
            className="w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-[1rem]"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            onClick={() => setSelected(new Set(participants.map((p) => p.id)))}
          >
            全選出席
          </PrimaryButton>
          <PrimaryButton onClick={() => setSelected(new Set())}>全部取消</PrimaryButton>
          <input
            className="min-w-[8rem] flex-1 rounded-xl border border-[#d2d2d7] px-3 py-2 text-[0.875rem]"
            placeholder="搜尋"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-xl border border-[#ebebeb]">
          {filtered.map((p) => {
            const checked = selected.has(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center justify-between gap-3 border-b border-[#f2f2f2] px-3 py-2.5 last:border-b-0"
              >
                <span className="text-[0.9375rem]">{p.name}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selected);
                    if (checked) next.delete(p.id);
                    else next.add(p.id);
                    setSelected(next);
                  }}
                />
              </label>
            );
          })}
        </div>
        <p className="text-[0.8125rem] text-[#86868b]">出席 {selected.size} 人將進入抽獎池</p>
        <PrimaryButton
          disabled={pending || !periodId}
          onClick={() =>
            run(async () => {
              const result = await createLose2kgTempDraw(periodId, [...selected]);
              setPublicUrl(result.publicUrl);
              setSessions((prev) => [result.session, ...prev]);
              setHint("已建立臨時抽獎場次");
            })
          }
        >
          建立臨時抽獎公開連結
        </PrimaryButton>
        {publicUrl ? (
          <div className="space-y-2">
            <p className="break-all text-[0.75rem] text-[#86868b]">{publicUrl}</p>
            <PrimaryButton
              onClick={() =>
                run(async () => {
                  await navigator.clipboard.writeText(publicUrl);
                  setHint("已複製臨時抽獎網址");
                })
              }
            >
              複製網址
            </PrimaryButton>
          </div>
        ) : null}
      </BrandCard>

      <section className="space-y-2">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          本場歷史
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[#d2d2d7] bg-white">
          {sessions.length === 0 ? (
            <p className="px-3 py-3 text-[0.875rem] text-[#86868b]">尚無場次</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 border-b border-[#f2f2f2] px-3 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-semibold">
                    {s.status}
                    {s.winnerNameSnapshot ? ` · ${s.winnerNameSnapshot}` : ""}
                  </p>
                  <p className="text-[0.7rem] text-[#86868b]">{s.createdAt}</p>
                </div>
                {s.status !== "void" ? (
                  <button
                    type="button"
                    className="text-[0.8125rem] text-[#d70015]"
                    onClick={() =>
                      run(async () => {
                        const reason = window.prompt("作廢原因（可再建立新場次）");
                        if (!reason?.trim()) return;
                        await voidLose2kgTempDraw(s.id, reason.trim());
                        const data = await fetchLose2kgPeriod(periodId);
                        setSessions(data.tempSessions);
                      })
                    }
                  >
                    作廢
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </PageShell>
  );
}
