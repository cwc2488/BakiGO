"use client";

import { PageShell } from "@/components/ui/PageShell";
import { BrandCard, PrimaryButton } from "@/components/ui/brand-ui";
import {
  createLose2kgPeriod,
  fetchLose2kgHome,
} from "@/lib/lose2kg/client";
import { computeDefaultMeasurementDates } from "@/lib/lose2kg/milestones";
import type { Lose2kgPeriod } from "@/types/lose2kg";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

function PeriodList({
  title,
  periods,
}: {
  title: string;
  periods: Lose2kgPeriod[];
}) {
  if (periods.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          {title}
        </h2>
        <p className="px-1 text-[0.875rem] text-[#86868b]">目前沒有</p>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-[#d2d2d7] bg-white">
        {periods.map((period) => (
          <Link
            key={period.id}
            href={`/admin/lose2kg/${period.id}`}
            className="flex items-center justify-between gap-3 border-b border-[#f2f2f2] px-3 py-3 last:border-b-0 active:bg-[#f5f5f7]"
          >
            <div className="min-w-0">
              <p className="truncate text-[0.9375rem] font-semibold text-[#1d1d1f]">{period.name}</p>
              <p className="text-[0.75rem] text-[#86868b]">
                {period.measurementDates[0]} → {period.measurementDates[3]} · {period.status}
              </p>
            </div>
            <span className="text-[0.8125rem] text-[#248a3d]">開啟</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Lose2kgHomePage() {
  const [active, setActive] = useState<Lose2kgPeriod[]>([]);
  const [completed, setCompleted] = useState<Lose2kgPeriod[]>([]);
  const [draft, setDraft] = useState<Lose2kgPeriod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [firstDate, setFirstDate] = useState("");
  const [dates, setDates] = useState<[string, string, string, string] | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await fetchLose2kgHome();
    setActive(data.active);
    setCompleted(data.completed);
    setDraft(data.draft);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!firstDate) {
      setDates(null);
      return;
    }
    try {
      setDates(computeDefaultMeasurementDates(firstDate));
    } catch {
      setDates(null);
    }
  }, [firstDate]);

  function createPeriod() {
    if (!name.trim() || !firstDate) {
      setError("請填寫期數名稱與第一次量測日期");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          await createLose2kgPeriod({
            name: name.trim(),
            firstMeasurementDate: firstDate,
            measurementDates: dates ?? undefined,
          });
          setName("");
          setFirstDate("");
          await reload();
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "建立失敗");
        }
      })();
    });
  }

  return (
    <PageShell title="再瘦2公斤" subtitle="獨立活動管理：期數、量測、抽獎券與抽獎" backHref="/admin" backLabel="返回管理中心">
      {error ? <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p> : null}
      {loading ? <p className="text-[0.875rem] text-[#86868b]">載入中…</p> : null}

      <BrandCard variant="bordered" className="space-y-3">
        <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">建立新一期</h2>
        <label className="block space-y-1">
          <span className="text-[0.75rem] text-[#86868b]">期數名稱</span>
          <input
            className="w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-[1rem]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="再瘦2公斤 第 1 期"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[0.75rem] text-[#86868b]">第一次量測日期</span>
          <input
            type="date"
            className="w-full rounded-xl border border-[#d2d2d7] px-3 py-2.5 text-[1rem]"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
          />
        </label>
        {dates ? (
          <div className="grid grid-cols-2 gap-2">
            {dates.map((d, i) => (
              <label key={d} className="block space-y-1">
                <span className="text-[0.75rem] text-[#86868b]">第 {i + 1} 次</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-[#d2d2d7] px-2 py-2 text-[0.875rem]"
                  value={d}
                  onChange={(e) => {
                    const next = [...dates] as [string, string, string, string];
                    next[i] = e.target.value;
                    setDates(next);
                  }}
                />
              </label>
            ))}
          </div>
        ) : null}
        <PrimaryButton disabled={pending} onClick={createPeriod}>
          {pending ? "建立中…" : "建立期數"}
        </PrimaryButton>
      </BrandCard>

      <div className="flex gap-2">
        <Link href="/admin/lose2kg/temp-draw" className="flex-1">
          <PrimaryButton className="w-full">臨時抽獎</PrimaryButton>
        </Link>
      </div>

      <PeriodList title="進行中" periods={[...active, ...draft]} />
      <PeriodList title="已結束" periods={completed} />
      <section className="space-y-2">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          歷史紀錄
        </h2>
        <p className="px-1 text-[0.875rem] text-[#86868b]">
          各期抽獎與作廢紀錄保留在期數詳情內，不硬刪除。
        </p>
      </section>
    </PageShell>
  );
}
