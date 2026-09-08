"use client";

import { PageShell } from "@/components/ui/PageShell";
import { BrandCard, PrimaryButton } from "@/components/ui/brand-ui";
import {
  createLose2kgParticipant,
  createLose2kgPrize,
  executeLose2kgFormalDraw,
  fetchLose2kgPeriod,
  patchLose2kgPeriod,
  regenerateLose2kgPeriodToken,
  voidLose2kgFormalDraw,
} from "@/lib/lose2kg/client";
import { buildPublicShareUrl } from "@/lib/app/public-origin";
import type {
  Lose2kgDraw,
  Lose2kgMeasurement,
  Lose2kgParticipant,
  Lose2kgPeriod,
  Lose2kgPrize,
} from "@/types/lose2kg";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

function pctLabel(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function weightFor(measurements: Lose2kgMeasurement[], participantId: string, slot: number): string {
  const m = measurements.find((row) => row.participantId === participantId && row.slot === slot);
  return m?.weightKg != null ? String(m.weightKg) : "—";
}

export function Lose2kgPeriodPage() {
  const params = useParams<{ periodId: string }>();
  const periodId = params.periodId;
  const [period, setPeriod] = useState<Lose2kgPeriod | null>(null);
  const [participants, setParticipants] = useState<Lose2kgParticipant[]>([]);
  const [measurements, setMeasurements] = useState<Lose2kgMeasurement[]>([]);
  const [prizes, setPrizes] = useState<Lose2kgPrize[]>([]);
  const [draws, setDraws] = useState<Lose2kgDraw[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [drawReveal, setDrawReveal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await fetchLose2kgPeriod(periodId);
    setPeriod(data.period);
    setParticipants(data.participants);
    setMeasurements(data.measurements);
    setPrizes(data.prizes);
    setDraws(data.draws);
    if (data.period.publicToken) {
      setPublicUrl(buildPublicShareUrl(`/lose2kg/${data.period.publicToken}`));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...participants].sort((a, b) => {
      if (b.totalTicketBalance !== a.totalTicketBalance) {
        return b.totalTicketBalance - a.totalTicketBalance;
      }
      return a.name.localeCompare(b.name, "zh-Hant");
    });
    if (!q) return list;
    return list.filter(
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

  if (!period) {
    return (
      <PageShell title="再瘦2公斤" backHref="/admin/lose2kg" backLabel="返回">
        {error ? <p className="text-[#d70015]">{error}</p> : <p className="text-[#86868b]">載入中…</p>}
      </PageShell>
    );
  }

  return (
    <PageShell
      title={period.name}
      subtitle={`${period.status} · ${period.measurementDates[0]} → ${period.measurementDates[3]}`}
      backHref="/admin/lose2kg"
      backLabel="返回期數列表"
    >
      {error ? <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p> : null}
      {hint ? <p className="rounded-xl bg-[#e8f8ee] px-3 py-2 text-[0.875rem] text-[#248a3d]">{hint}</p> : null}
      {drawReveal ? (
        <div className="rounded-2xl border border-[#248a3d] bg-[#e8f8ee] px-4 py-6 text-center">
          <p className="text-[0.8125rem] text-[#248a3d]">抽獎結果</p>
          <p className="mt-2 text-[1.75rem] font-semibold text-[#1d1d1f]">{drawReveal}</p>
        </div>
      ) : null}

      <BrandCard variant="bordered" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const next = period.status === "active" ? "completed" : "active";
                await patchLose2kgPeriod(periodId, { status: next });
                await reload();
              })
            }
          >
            {period.status === "active" ? "結束本期" : "設為進行中"}
          </PrimaryButton>
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const enabled = !period.publicEnabled;
                await patchLose2kgPeriod(periodId, { publicEnabled: enabled });
                await reload();
                setHint(enabled ? "公開票數頁已開啟" : "公開票數頁已關閉");
              })
            }
          >
            {period.publicEnabled ? "關閉公開" : "開啟公開"}
          </PrimaryButton>
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await regenerateLose2kgPeriodToken(periodId);
                setPublicUrl(result.publicUrl);
                setPeriod(result.period);
                setHint("已重新產生公開連結");
              })
            }
          >
            重新產生連結
          </PrimaryButton>
          <PrimaryButton
            disabled={!publicUrl}
            onClick={() =>
              run(async () => {
                if (!publicUrl) return;
                await navigator.clipboard.writeText(publicUrl);
                setHint("已複製票數查詢網址");
              })
            }
          >
            複製公開網址
          </PrimaryButton>
        </div>
        {publicUrl ? (
          <p className="break-all text-[0.75rem] text-[#86868b]">{publicUrl}</p>
        ) : (
          <p className="text-[0.75rem] text-[#86868b]">產生或重新產生 token 後可複製公開網址</p>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          {period.measurementDates.map((d, i) => (
            <label key={`${d}-${i}`} className="block space-y-1">
              <span className="text-[0.7rem] text-[#86868b]">第 {i + 1} 次量測</span>
              <input
                type="date"
                className="w-full rounded-lg border border-[#d2d2d7] px-2 py-1.5 text-[0.875rem]"
                value={d}
                onChange={(e) => {
                  const next = [...period.measurementDates] as [string, string, string, string];
                  next[i] = e.target.value;
                  setPeriod({ ...period, measurementDates: next });
                }}
                onBlur={() =>
                  run(async () => {
                    await patchLose2kgPeriod(periodId, {
                      measurementDates: period.measurementDates,
                    });
                    await reload();
                  })
                }
              />
            </label>
          ))}
        </div>
      </BrandCard>

      <BrandCard variant="bordered" className="space-y-2">
        <h2 className="text-[1rem] font-semibold">新增參賽者</h2>
        <PrimaryButton
          disabled={pending}
          onClick={() =>
            run(async () => {
              const name = window.prompt("參賽者姓名");
              if (!name?.trim()) return;
              await createLose2kgParticipant(periodId, { name: name.trim() });
              await reload();
            })
          }
        >
          新增參賽者
        </PrimaryButton>
      </BrandCard>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
            參賽者（{filtered.length}）
          </h2>
          <input
            className="w-40 rounded-lg border border-[#d2d2d7] px-2 py-1.5 text-[0.875rem]"
            placeholder="搜尋"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-[#d2d2d7] bg-white">
          <table className="min-w-[720px] w-full text-left text-[0.8125rem]">
            <thead className="bg-[#f5f5f7] text-[#86868b]">
              <tr>
                <th className="px-2 py-2 font-medium">姓名</th>
                <th className="px-2 py-2 font-medium">1</th>
                <th className="px-2 py-2 font-medium">2</th>
                <th className="px-2 py-2 font-medium">3</th>
                <th className="px-2 py-2 font-medium">4</th>
                <th className="px-2 py-2 font-medium">%</th>
                <th className="px-2 py-2 font-medium">體重票</th>
                <th className="px-2 py-2 font-medium">活動票</th>
                <th className="px-2 py-2 font-medium">總票</th>
                <th className="px-2 py-2 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-[#f2f2f2]">
                  <td className="px-2 py-2">
                    <Link
                      href={`/admin/lose2kg/${periodId}/participants/${p.id}`}
                      className="font-semibold text-[#248a3d]"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{weightFor(measurements, p.id, 1)}</td>
                  <td className="px-2 py-2">{weightFor(measurements, p.id, 2)}</td>
                  <td className="px-2 py-2">{weightFor(measurements, p.id, 3)}</td>
                  <td className="px-2 py-2">{weightFor(measurements, p.id, 4)}</td>
                  <td className="px-2 py-2">{pctLabel(p.currentWeightChangePct)}</td>
                  <td className="px-2 py-2">{p.weightTicketBalance}</td>
                  <td className="px-2 py-2">{p.activityTicketBalance}</td>
                  <td className="px-2 py-2 font-semibold">{p.totalTicketBalance}</td>
                  <td className="px-2 py-2">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <BrandCard variant="bordered" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[1rem] font-semibold">獎項與正式抽獎</h2>
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const name = window.prompt("獎項名稱", "特別獎");
                if (!name?.trim()) return;
                await createLose2kgPrize(periodId, { name: name.trim() });
                await reload();
              })
            }
          >
            新增獎項
          </PrimaryButton>
        </div>
        <div className="space-y-2">
          {prizes.map((prize) => {
            const eligible = participants.filter(
              (p) => p.status === "active" && p.totalTicketBalance > 0,
            );
            const totalTickets = eligible.reduce((sum, p) => sum + p.totalTicketBalance, 0);
            return (
              <div
                key={prize.id}
                className="flex flex-col gap-2 rounded-xl border border-[#ebebeb] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-[#1d1d1f]">
                    {prize.name} · {prize.winnerCount} 名 · {prize.status}
                  </p>
                  <p className="text-[0.75rem] text-[#86868b]">
                    有效參賽者 {eligible.length} 人 · 有效票數 {totalTickets} 張
                  </p>
                </div>
                <PrimaryButton
                  disabled={pending || prize.status === "drawn"}
                  onClick={() =>
                    run(async () => {
                      const ok = window.confirm(
                        `確認抽獎？\n獎項：${prize.name}\n有效參賽者：${eligible.length} 人\n有效票數：${totalTickets} 張`,
                      );
                      if (!ok) return;
                      const names = eligible.map((p) => p.publicDisplayName || p.name);
                      let tick = 0;
                      const timer = window.setInterval(() => {
                        setDrawReveal(names[tick % names.length] ?? "…");
                        tick += 1;
                      }, 70);
                      const result = await executeLose2kgFormalDraw(periodId, {
                        prizeId: prize.id,
                        idempotencyKey: crypto.randomUUID(),
                      });
                      window.setTimeout(() => {
                        window.clearInterval(timer);
                        const winnerLabel = result.winners.map((w) => w.name).join("、");
                        setDrawReveal(winnerLabel || result.draw.winnerNameSnapshot);
                      }, 900);
                      await reload();
                    })
                  }
                >
                  開始抽獎
                </PrimaryButton>
              </div>
            );
          })}
        </div>
      </BrandCard>

      <section className="space-y-2">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          抽獎紀錄
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[#d2d2d7] bg-white">
          {draws.length === 0 ? (
            <p className="px-3 py-3 text-[0.875rem] text-[#86868b]">尚無紀錄</p>
          ) : (
            draws.map((draw) => (
              <div
                key={draw.id}
                className="flex items-center justify-between gap-2 border-b border-[#f2f2f2] px-3 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-semibold">
                    {draw.winnerNameSnapshot ?? "—"} · {draw.status}
                  </p>
                  <p className="text-[0.7rem] text-[#86868b]">
                    票 {draw.winnerTicketCount}/{draw.totalPoolTicketCount} · {draw.drawnAt ?? draw.createdAt}
                  </p>
                </div>
                {draw.status === "completed" ? (
                  <button
                    type="button"
                    className="text-[0.8125rem] text-[#d70015]"
                    onClick={() =>
                      run(async () => {
                        const reason = window.prompt("作廢原因");
                        if (!reason?.trim()) return;
                        await voidLose2kgFormalDraw(draw.id, reason.trim());
                        await reload();
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

      <Link href={`/admin/lose2kg/temp-draw?periodId=${periodId}`}>
        <PrimaryButton className="w-full">建立臨時抽獎</PrimaryButton>
      </Link>
    </PageShell>
  );
}
