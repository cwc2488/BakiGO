"use client";

import { CopyLinkButton } from "@/components/lose2kg/CopyLinkButton";
import { Lose2kgButton, Lose2kgToast } from "@/components/lose2kg/Lose2kgUi";
import { PageShell } from "@/components/ui/PageShell";
import { createLose2kgPrize, fetchLose2kgPeriod } from "@/lib/lose2kg/client";
import {
  patchLose2kgPeriodV2,
  regenerateLose2kgLiveToken,
  regenerateLose2kgStaffToken,
  revokeLose2kgStaffSessions,
  startLose2kgPeriod,
  updateLose2kgStaffPassword,
} from "@/lib/lose2kg/v2-client";
import type { Lose2kgPeriod, Lose2kgPrize } from "@/types/lose2kg";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";

function ControlCenterInner() {
  const params = useParams<{ periodId: string }>();
  const search = useSearchParams();
  const periodId = params.periodId;
  const [period, setPeriod] = useState<Lose2kgPeriod | null>(null);
  const [prizes, setPrizes] = useState<Lose2kgPrize[]>([]);
  const [staffUrl, setStaffUrl] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await fetchLose2kgPeriod(periodId);
    setPeriod(data.period);
    setPrizes(data.prizes);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- period bootstrap
  }, [periodId]);

  useEffect(() => {
    if (search.get("started") === "1" && period?.status === "draft") {
      // noop — start already happened on home
    }
  }, [search, period]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }

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
      <PageShell title="活動控制中心" backHref="/admin/lose2kg" backLabel="返回">
        {error ? <p className="text-[#d70015]">{error}</p> : <p className="text-[#86868b]">載入中…</p>}
      </PageShell>
    );
  }

  return (
    <PageShell
      title={period.name}
      subtitle={`狀態：${period.status === "active" ? "進行中" : period.status}`}
      backHref="/admin/lose2kg"
      backLabel="返回期數列表"
    >
      <Lose2kgToast message={toast} />
      {error ? (
        <p className="rounded-2xl bg-[#fff2f2] px-4 py-3 text-[0.875rem] text-[#d70015]">{error}</p>
      ) : null}

      {period.status === "draft" ? (
        <Lose2kgButton
          tone="gold"
          loading={pending}
          className="w-full"
          onClick={() =>
            run(async () => {
              const result = await startLose2kgPeriod(periodId);
              setPeriod(result.period);
              setStaffUrl(result.staffUrl);
              setLiveUrl(result.liveUrl);
              showToast("活動已開始");
            })
          }
        >
          開始這一期
        </Lose2kgButton>
      ) : null}

      <section className="space-y-3 rounded-[1.5rem] border border-[#e8e4dc] bg-[#fffcf7] p-4">
        <h2 className="text-[1.0625rem] font-semibold">工作人員工作站</h2>
        <p className="break-all text-[0.8125rem] text-[#1d1d1f]">
          {staffUrl ?? "請按「重設網址」產生完整工作站連結（只顯示一次）"}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyLinkButton url={staffUrl ?? ""} />
          <Lose2kgButton
            tone="secondary"
            loading={pending}
            onClick={() =>
              run(async () => {
                const result = await regenerateLose2kgStaffToken(periodId);
                setStaffUrl(result.staffUrl);
                setPeriod(result.period);
                showToast("已重設工作站網址，舊 session 已撤銷");
              })
            }
          >
            重設網址
          </Lose2kgButton>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[0.875rem] text-[#86868b]">密碼：••••</span>
          <Lose2kgButton
            tone="secondary"
            loading={pending}
            onClick={() =>
              run(async () => {
                const pw = window.prompt("新工作人員密碼（4～8 英數）");
                if (!pw) return;
                const result = await updateLose2kgStaffPassword(periodId, pw);
                setPeriod(result.period);
                showToast("密碼已更新，所有工作站 session 已撤銷");
              })
            }
          >
            修改密碼
          </Lose2kgButton>
          <Lose2kgButton
            tone="danger"
            loading={pending}
            onClick={() =>
              run(async () => {
                await revokeLose2kgStaffSessions(periodId);
                showToast("已撤銷所有工作站登入");
              })
            }
          >
            撤銷 sessions
          </Lose2kgButton>
        </div>
      </section>

      <section className="space-y-3 rounded-[1.5rem] border border-[#e8e4dc] bg-[#fffcf7] p-4">
        <h2 className="text-[1.0625rem] font-semibold">參賽者儀表板</h2>
        <p className="break-all text-[0.8125rem] text-[#1d1d1f]">
          {liveUrl ?? "請按「重設網址」產生完整公開連結（只顯示一次）"}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyLinkButton url={liveUrl ?? ""} />
          <Lose2kgButton
            tone="secondary"
            loading={pending}
            onClick={() =>
              run(async () => {
                const result = await regenerateLose2kgLiveToken(periodId);
                setLiveUrl(result.liveUrl);
                setPeriod(result.period);
                showToast("已重設公開儀表板網址");
              })
            }
          >
            重設網址
          </Lose2kgButton>
        </div>
        <label className="flex items-center gap-2 text-[0.875rem] text-[#1d1d1f]">
          <input
            type="checkbox"
            checked={Boolean(period.publicShowWeights)}
            onChange={(e) =>
              run(async () => {
                const result = await patchLose2kgPeriodV2(periodId, {
                  publicShowWeights: e.target.checked,
                });
                setPeriod(result.period);
              })
            }
          />
          公開個人體重資料（預設關閉）
        </label>
      </section>

      <section className="space-y-3 rounded-[1.5rem] border border-[#e8e4dc] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[1.0625rem] font-semibold">管理獎項</h2>
          <Lose2kgButton
            tone="secondary"
            loading={pending}
            onClick={() =>
              run(async () => {
                const name = window.prompt("獎項名稱", "特別獎");
                if (!name?.trim()) return;
                await createLose2kgPrize(periodId, { name: name.trim() });
                await reload();
                showToast("已新增獎項");
              })
            }
          >
            新增獎項
          </Lose2kgButton>
        </div>
        <ul className="space-y-2">
          {prizes.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-[#f0ebe1] px-3 py-2 text-[0.875rem]"
            >
              <span>
                {p.name} · {p.winnerCount} 名
              </span>
              <span className="text-[#86868b]">{p.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-[1.5rem] border border-[#e8e4dc] bg-white p-4">
        <h2 className="text-[1.0625rem] font-semibold">量測日期</h2>
        <div className="grid grid-cols-2 gap-2">
          {period.measurementDates.map((d, i) => (
            <label key={i} className="block space-y-1">
              <span className="text-[0.7rem] text-[#86868b]">第 {i + 1} 次</span>
              <input
                type="date"
                className="w-full rounded-xl border border-[#ddd6c8] px-2 py-2 text-[0.875rem]"
                value={d}
                onChange={(e) => {
                  const next = [...period.measurementDates] as [string, string, string, string];
                  next[i] = e.target.value;
                  setPeriod({ ...period, measurementDates: next });
                }}
                onBlur={() =>
                  run(async () => {
                    const result = await patchLose2kgPeriodV2(periodId, {
                      measurementDates: period.measurementDates,
                    });
                    setPeriod(result.period);
                    showToast("日期已更新");
                  })
                }
              />
            </label>
          ))}
        </div>
      </section>

      {period.status !== "completed" ? (
        <Lose2kgButton
          tone="danger"
          loading={pending}
          className="w-full"
          onClick={() =>
            run(async () => {
              const ok = window.confirm("確定結束本期？");
              if (!ok) return;
              const result = await patchLose2kgPeriodV2(periodId, { status: "completed" });
              setPeriod(result.period);
              showToast("本期已結束");
            })
          }
        >
          結束本期
        </Lose2kgButton>
      ) : null}

      <p className="text-center text-[0.8125rem] text-[#86868b]">
        現場輸入、量測與抽獎請使用工作人員工作站。
      </p>
    </PageShell>
  );
}

export function Lose2kgPeriodPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[#86868b]">載入中…</div>}>
      <ControlCenterInner />
    </Suspense>
  );
}
