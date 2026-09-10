"use client";

import { PersistentShareUrl } from "@/components/lose2kg/CopyLinkButton";
import { Lose2kgButton, Lose2kgToast } from "@/components/lose2kg/Lose2kgUi";
import { PageShell } from "@/components/ui/PageShell";
import {
  deleteLose2kgPeriod,
  fetchLose2kgControlCenter,
  patchLose2kgPeriodV2,
  regenerateLose2kgLiveToken,
  regenerateLose2kgStaffToken,
  revokeLose2kgStaffSessions,
  startLose2kgPeriod,
  updateLose2kgStaffPassword,
} from "@/lib/lose2kg/v2-client";
import type { Lose2kgPeriod } from "@/types/lose2kg";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useTransition } from "react";

function statusLabel(status: Lose2kgPeriod["status"]) {
  if (status === "active") return "進行中";
  if (status === "completed") return "已結束";
  return "草稿";
}

function shortDate(iso: string) {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function ControlCenterInner() {
  const params = useParams<{ periodId: string }>();
  const router = useRouter();
  const periodId = params.periodId;
  const [period, setPeriod] = useState<Lose2kgPeriod | null>(null);
  const [staffUrl, setStaffUrl] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function reload() {
    const data = await fetchLose2kgControlCenter(periodId);
    setPeriod(data.period);
    setStaffUrl(data.staffUrl);
    setLiveUrl(data.liveUrl);
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
      <PageShell title="再瘦2公斤" backHref="/admin/lose2kg" backLabel="返回">
        <div className="space-y-3">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-[#ebe6dc]" />
          <div className="h-24 animate-pulse rounded-xl bg-[#ebe6dc]" />
          <div className="h-40 animate-pulse rounded-xl bg-[#ebe6dc]" />
          {error ? <p className="text-[#d70015]">{error}</p> : null}
        </div>
      </PageShell>
    );
  }

  const confirmOk =
    deleteConfirm.trim() === "DELETE" || deleteConfirm.trim() === period.name;

  return (
    <PageShell
      title="再瘦2公斤"
      subtitle={`${period.name} · ${statusLabel(period.status)}`}
      backHref="/admin/lose2kg"
      backLabel="返回期數列表"
    >
      <Lose2kgToast message={toast} />
      <header className="mb-4 space-y-3 border-b border-[#e8e4dc] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[#8a7350]">
              活動控制中心
            </p>
            <h2 className="text-[1.375rem] font-semibold leading-tight text-[#1d1d1f]">
              {period.name}
            </h2>
            <p className="mt-1 text-[0.875rem] text-[#86868b]">
              狀態：
              <span
                className={
                  period.status === "active"
                    ? "font-semibold text-[#248a3d]"
                    : period.status === "completed"
                      ? "font-semibold text-[#86868b]"
                      : "font-semibold text-[#c4a35a]"
                }
              >
                {statusLabel(period.status)}
              </span>
            </p>
          </div>
          {period.status === "draft" ? (
            <Lose2kgButton
              loading={pending}
              onClick={() =>
                run(async () => {
                  const result = await startLose2kgPeriod(periodId);
                  setPeriod(result.period);
                  setStaffUrl(result.staffUrl);
                  setLiveUrl(result.liveUrl);
                  showToast("✓ 活動已開始");
                })
              }
            >
              開始這一期
            </Lose2kgButton>
          ) : null}
        </div>

        <div className="flex gap-2 overflow-x-auto pt-1">
          {period.measurementDates.map((d, i) => (
            <div
              key={i}
              className="min-w-[4.5rem] shrink-0 rounded-lg border border-[#e8e4dc] bg-white px-3 py-2 text-center"
            >
              <p className="text-[0.65rem] font-medium text-[#86868b]">第 {i + 1} 次</p>
              <p className="text-[0.9375rem] font-semibold tabular-nums">{shortDate(d)}</p>
            </div>
          ))}
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded-lg bg-[#fff2f2] px-4 py-3 text-[0.875rem] text-[#d70015]">
          {error}
        </p>
      ) : null}

      <div className="space-y-6">
        <section className="space-y-4 border-b border-[#e8e4dc] pb-6">
          <PersistentShareUrl title="工作人員工作站" url={staffUrl} />
          <div className="flex flex-wrap gap-2">
            <Lose2kgButton
              tone="secondary"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const result = await regenerateLose2kgStaffToken(periodId);
                  setStaffUrl(result.staffUrl);
                  setPeriod(result.period);
                  showToast("✓ 已重設工作站網址");
                })
              }
            >
              重設網址
            </Lose2kgButton>
            <Lose2kgButton
              tone="secondary"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const pw = window.prompt("新工作人員密碼（4～8 英數）");
                  if (!pw) return;
                  const result = await updateLose2kgStaffPassword(periodId, pw);
                  setPeriod(result.period);
                  showToast("✓ 密碼已更新");
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
                  showToast("✓ 已撤銷工作站登入");
                })
              }
            >
              撤銷 sessions
            </Lose2kgButton>
          </div>
        </section>

        <section className="space-y-4 border-b border-[#e8e4dc] pb-6">
          <PersistentShareUrl title="參賽者儀表板" url={liveUrl} />
          <div className="flex flex-wrap items-center gap-3">
            <Lose2kgButton
              tone="secondary"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const result = await regenerateLose2kgLiveToken(periodId);
                  setLiveUrl(result.liveUrl);
                  setPeriod(result.period);
                  showToast("✓ 已重設公開網址");
                })
              }
            >
              重設網址
            </Lose2kgButton>
            <label className="flex items-center gap-2 text-[0.875rem]">
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
              公開個人體重資料
            </label>
          </div>
        </section>

        <section className="space-y-3 border-b border-[#e8e4dc] pb-6">
          <h2 className="text-[1rem] font-semibold">量測日期</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {period.measurementDates.map((d, i) => (
              <label key={i} className="block space-y-1">
                <span className="text-[0.7rem] text-[#86868b]">第 {i + 1} 次</span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-[#ddd6c8] px-2 py-2 text-[0.875rem]"
                  value={d}
                  onChange={(e) => {
                    const next = [...period.measurementDates] as [
                      string,
                      string,
                      string,
                      string,
                    ];
                    next[i] = e.target.value;
                    setPeriod({ ...period, measurementDates: next });
                  }}
                  onBlur={() =>
                    run(async () => {
                      const result = await patchLose2kgPeriodV2(periodId, {
                        measurementDates: period.measurementDates,
                      });
                      setPeriod(result.period);
                      showToast("✓ 日期已更新");
                    })
                  }
                />
              </label>
            ))}
          </div>
        </section>

        {period.status !== "completed" ? (
          <Lose2kgButton
            tone="secondary"
            loading={pending}
            className="w-full"
            onClick={() =>
              run(async () => {
                const ok = window.confirm("確定結束本期？");
                if (!ok) return;
                const result = await patchLose2kgPeriodV2(periodId, { status: "completed" });
                setPeriod(result.period);
                showToast("✓ 本期已結束");
              })
            }
          >
            結束本期
          </Lose2kgButton>
        ) : null}

        <section className="space-y-3 rounded-xl border border-[#f0c4c4] bg-[#fffafa] p-4">
          <h2 className="text-[1rem] font-semibold text-[#c41e1e]">危險操作</h2>
          <p className="text-[0.8125rem] text-[#86868b]">
            僅 Super Admin / Owner 可刪除整期活動。工作人員無法執行。
          </p>
          {deleteStep === 0 ? (
            <Lose2kgButton tone="danger" onClick={() => setDeleteStep(1)}>
              刪除活動
            </Lose2kgButton>
          ) : null}
          {deleteStep === 1 ? (
            <div className="space-y-3 text-[0.8125rem]">
              <p className="font-semibold text-[#1d1d1f]">
                確定要刪除「{period.name}」嗎？
              </p>
              <p className="text-[#86868b]">此操作會刪除：</p>
              <ul className="list-inside list-disc space-y-0.5 text-[#6e6e73]">
                <li>此期參賽者</li>
                <li>四次量測</li>
                <li>milestone 紀錄</li>
                <li>抽獎券紀錄</li>
                <li>獎項</li>
                <li>正式抽獎紀錄</li>
                <li>臨時抽獎紀錄</li>
                <li>staff session</li>
                <li>工作人員網址</li>
                <li>參賽者網址</li>
              </ul>
              <div className="flex gap-2">
                <Lose2kgButton tone="secondary" onClick={() => setDeleteStep(0)}>
                  取消
                </Lose2kgButton>
                <Lose2kgButton tone="danger" onClick={() => setDeleteStep(2)}>
                  繼續刪除
                </Lose2kgButton>
              </div>
            </div>
          ) : null}
          {deleteStep === 2 ? (
            <div className="space-y-3">
              <p className="text-[0.8125rem]">
                請輸入 <strong>DELETE</strong> 或活動名稱「{period.name}」確認：
              </p>
              <input
                className="w-full rounded-lg border border-[#f0c4c4] px-3 py-2 text-[0.875rem]"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
              />
              <div className="flex gap-2">
                <Lose2kgButton
                  tone="secondary"
                  onClick={() => {
                    setDeleteStep(0);
                    setDeleteConfirm("");
                  }}
                >
                  取消
                </Lose2kgButton>
                <Lose2kgButton
                  tone="danger"
                  loading={pending}
                  disabled={!confirmOk}
                  onClick={() =>
                    run(async () => {
                      await deleteLose2kgPeriod(periodId);
                      showToast("✓ 活動已刪除");
                      router.replace("/admin/lose2kg");
                    })
                  }
                >
                  確認刪除
                </Lose2kgButton>
              </div>
            </div>
          ) : null}
        </section>

        <p className="text-center text-[0.8125rem] text-[#86868b]">
          現場量測與票數請使用工作人員工作站。抽獎功能已停用，改為抽獎券追蹤。
        </p>
      </div>
    </PageShell>
  );
}

export function Lose2kgPeriodPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-3 p-6">
          <div className="h-8 w-40 animate-pulse rounded-lg bg-[#ebe6dc]" />
          <div className="h-32 animate-pulse rounded-xl bg-[#ebe6dc]" />
        </div>
      }
    >
      <ControlCenterInner />
    </Suspense>
  );
}
