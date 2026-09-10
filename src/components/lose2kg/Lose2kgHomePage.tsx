"use client";

import { CopyLinkButton } from "@/components/lose2kg/CopyLinkButton";
import { Lose2kgButton, Lose2kgToast } from "@/components/lose2kg/Lose2kgUi";
import { PageShell } from "@/components/ui/PageShell";
import { fetchLose2kgHome } from "@/lib/lose2kg/client";
import {
  createLose2kgPeriodDraft,
  fetchLose2kgSuggestName,
  startLose2kgPeriod,
} from "@/lib/lose2kg/v2-client";
import { computeDefaultMeasurementDates } from "@/lib/lose2kg/milestones";
import type { Lose2kgPeriod } from "@/types/lose2kg";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function Lose2kgHomePage() {
  const router = useRouter();
  const [active, setActive] = useState<Lose2kgPeriod[]>([]);
  const [completed, setCompleted] = useState<Lose2kgPeriod[]>([]);
  const [draft, setDraft] = useState<Lose2kgPeriod[]>([]);
  const [step, setStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [name, setName] = useState("");
  const [firstDate, setFirstDate] = useState("");
  const [dates, setDates] = useState<[string, string, string, string] | null>(null);
  const [password, setPassword] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [staffUrl, setStaffUrl] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await fetchLose2kgHome();
    setActive(data.active);
    setCompleted(data.completed);
    setDraft(data.draft);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

  function beginCreate() {
    startTransition(() => {
      void (async () => {
        try {
          const suggested = await fetchLose2kgSuggestName();
          setName(suggested);
          setStep(1);
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "無法開始");
        }
      })();
    });
  }

  function onFirstDate(value: string) {
    setFirstDate(value);
    if (!value) {
      setDates(null);
      return;
    }
    try {
      setDates(computeDefaultMeasurementDates(value));
    } catch {
      setDates(null);
    }
  }

  function saveDraft() {
    if (!name.trim() || !firstDate || !dates || !password) {
      setError("請完成所有步驟");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const result = await createLose2kgPeriodDraft({
            name: name.trim(),
            firstMeasurementDate: firstDate,
            measurementDates: dates,
            staffPassword: password,
          });
          setCreatedId(result.period.id);
          setStep(4);
          setError(null);
          showToast("草稿已建立");
          await reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : "建立失敗");
        }
      })();
    });
  }

  function startActivity() {
    if (!createdId) return;
    startTransition(() => {
      void (async () => {
        try {
          const result = await startLose2kgPeriod(createdId);
          setStaffUrl(result.staffUrl);
          setLiveUrl(result.liveUrl);
          showToast("活動已開始");
          await reload();
          router.push(`/admin/lose2kg/${createdId}?started=1`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "開始失敗");
        }
      })();
    });
  }

  return (
    <PageShell
      title="再瘦2公斤"
      subtitle="活動設定：建立期數、密碼與兩個現場網址"
      backHref="/admin"
      backLabel="返回管理中心"
    >
      <Lose2kgToast message={toast} />
      {error ? (
        <p className="rounded-2xl bg-[#fff2f2] px-4 py-3 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {step === 0 ? (
        <section className="space-y-4">
          <Lose2kgButton onClick={beginCreate} loading={pending} className="w-full sm:w-auto">
            建立新一期
          </Lose2kgButton>

          <div className="space-y-2">
            <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#86868b]">
              進行中
            </h2>
            <PeriodLinks periods={[...active, ...draft]} empty="目前沒有進行中的期數" />
          </div>
          <div className="space-y-2">
            <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-[#86868b]">
              歷史期數
            </h2>
            <PeriodLinks periods={completed} empty="尚無已結束期數" />
          </div>
        </section>
      ) : null}

      {step > 0 && step < 4 ? (
        <section className="mx-auto w-full max-w-lg space-y-5 rounded-[1.75rem] border border-[#e8e4dc] bg-[#fffcf7] p-5 shadow-[0_20px_50px_rgba(29,29,31,0.06)]">
          <p className="text-[0.75rem] font-semibold tracking-[0.16em] text-[#c4a35a]">
            STEP {step} / 3
          </p>

          {step === 1 ? (
            <div className="space-y-3">
              <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">活動名稱</h2>
              <input
                className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[1.0625rem]"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="flex justify-between gap-2">
                <Lose2kgButton tone="ghost" onClick={() => setStep(0)}>
                  取消
                </Lose2kgButton>
                <Lose2kgButton onClick={() => setStep(2)} disabled={!name.trim()}>
                  下一步
                </Lose2kgButton>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">第一次量測日期</h2>
              <input
                type="date"
                className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[1.0625rem]"
                value={firstDate}
                onChange={(e) => onFirstDate(e.target.value)}
              />
              {dates ? (
                <div className="space-y-2">
                  {dates.map((d, i) => (
                    <label
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#eee8dc] bg-white px-3 py-2.5"
                    >
                      <span className="text-[0.875rem] text-[#86868b]">
                        第 {i + 1} 週量測{i === 0 ? " · 基準" : ""}
                      </span>
                      <input
                        type="date"
                        className="rounded-lg border border-[#ddd6c8] px-2 py-1.5 text-[0.875rem]"
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
              <div className="flex justify-between gap-2">
                <Lose2kgButton tone="secondary" onClick={() => setStep(1)}>
                  上一步
                </Lose2kgButton>
                <Lose2kgButton onClick={() => setStep(3)} disabled={!dates}>
                  下一步
                </Lose2kgButton>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">工作人員密碼</h2>
              <p className="text-[0.875rem] text-[#86868b]">4～8 位英數，現場工作站登入用。</p>
              <input
                className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[1.0625rem] tracking-[0.2em]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="例如 0821"
                maxLength={8}
              />
              <div className="flex justify-between gap-2">
                <Lose2kgButton tone="secondary" onClick={() => setStep(2)}>
                  上一步
                </Lose2kgButton>
                <Lose2kgButton onClick={saveDraft} loading={pending}>
                  儲存並繼續
                </Lose2kgButton>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 4 ? (
        <section className="mx-auto w-full max-w-lg space-y-4 rounded-[1.75rem] border border-[#e8e4dc] bg-[#fffcf7] p-5">
          <h2 className="text-[1.5rem] font-semibold text-[#1d1d1f]">{name}</h2>
          <p className="text-[0.875rem] text-[#86868b]">草稿已就緒。開始後會產生工作站與公開儀表板網址。</p>
          <Lose2kgButton onClick={startActivity} loading={pending} className="w-full" tone="gold">
            開始這一期
          </Lose2kgButton>
          {staffUrl && liveUrl ? (
            <div className="space-y-3 pt-2">
              <UrlBlock label="工作人員操作網址" url={staffUrl} />
              <UrlBlock label="參賽者公開儀表板" url={liveUrl} />
            </div>
          ) : null}
        </section>
      ) : null}
    </PageShell>
  );
}

function PeriodLinks({ periods, empty }: { periods: Lose2kgPeriod[]; empty: string }) {
  if (periods.length === 0) {
    return <p className="px-1 text-[0.875rem] text-[#86868b]">{empty}</p>;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e4dc] bg-white">
      {periods.map((p) => (
        <Link
          key={p.id}
          href={`/admin/lose2kg/${p.id}`}
          className="flex items-center justify-between border-b border-[#f3efe6] px-4 py-3 last:border-b-0 active:bg-[#f7f3ea]"
        >
          <div>
            <p className="font-semibold text-[#1d1d1f]">{p.name}</p>
            <p className="text-[0.75rem] text-[#86868b]">
              {p.status} · {p.measurementDates[0]}
            </p>
          </div>
          <span className="text-[0.8125rem] text-[#c4a35a]">開啟</span>
        </Link>
      ))}
    </div>
  );
}

function UrlBlock({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-2 rounded-2xl border border-[#eee8dc] bg-white p-3">
      <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-[#86868b]">{label}</p>
      <p className="break-all text-[0.8125rem] text-[#1d1d1f]">{url}</p>
      <CopyLinkButton url={url} />
    </div>
  );
}
