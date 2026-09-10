"use client";

import { TicketBreakdownPanel } from "@/components/lose2kg/TicketBreakdownPanel";
import { Lose2kgButton, Lose2kgToast } from "@/components/lose2kg/Lose2kgUi";
import type { Lose2kgTicketBreakdown } from "@/lib/lose2kg/ticket-breakdown";
import type {
  Lose2kgMeasurement,
  Lose2kgParticipant,
  Lose2kgPeriod,
} from "@/types/lose2kg";
import { useParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";

type Bootstrap = {
  period: Lose2kgPeriod;
  currentSlot: 1 | 2 | 3 | 4;
  nextMeasurementDate: string | null;
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  participantCount: number;
  totalTickets: number;
};

type ExtraTicketModalState = {
  participant: Lose2kgParticipant;
  mode: "add" | "deduct";
};

async function staffFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/lose2kg/staff/${encodeURIComponent(token)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `失敗 (${res.status})`);
  return body;
}

function weightOf(
  measurements: Lose2kgMeasurement[],
  participantId: string,
  slot: number,
): number | null {
  return (
    measurements.find((m) => m.participantId === participantId && m.slot === slot)?.weightKg ??
    null
  );
}

function shortDate(iso: string) {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function formatPct(pct: number | null) {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function WorkstationSkeleton() {
  return (
    <div className="min-h-dvh bg-[#f4f1ea] p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-20 animate-pulse rounded-xl bg-[#ebe6dc]" />
        <div className="h-10 w-64 animate-pulse rounded-lg bg-[#ebe6dc]" />
        <div className="h-72 animate-pulse rounded-xl bg-[#ebe6dc]" />
      </div>
    </div>
  );
}

export function Lose2kgStaffWorkstationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [gate, setGate] = useState<{ periodName: string; authenticated: boolean } | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error" | "info">("success");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [measureFeedback, setMeasureFeedback] = useState<Record<string, string>>({});
  const [cellStatus, setCellStatus] = useState<Record<string, "idle" | "saving" | "ok" | "err">>(
    {},
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<Lose2kgTicketBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [extraModal, setExtraModal] = useState<ExtraTicketModalState | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function showToast(msg: string, tone: "success" | "error" | "info" = "success") {
    setToast(msg);
    setToastTone(tone);
    window.setTimeout(() => setToast(null), 2400);
  }

  function patchParticipant(updated: Lose2kgParticipant) {
    setData((prev) => {
      if (!prev) return prev;
      const participants = prev.participants.map((p) =>
        p.id === updated.id ? updated : p,
      );
      const active = participants.filter((p) => p.status === "active");
      return {
        ...prev,
        participants,
        participantCount: active.length,
        totalTickets: active.reduce((s, p) => s + p.totalTicketBalance, 0),
      };
    });
  }

  function patchMeasurements(participantId: string, next: Lose2kgMeasurement[]) {
    setData((prev) => {
      if (!prev) return prev;
      const others = prev.measurements.filter((m) => m.participantId !== participantId);
      return { ...prev, measurements: [...others, ...next] };
    });
  }

  async function loadGate() {
    const body = await staffFetch<{
      ok: true;
      periodName: string;
      authenticated: boolean;
    }>(token, "");
    setGate({ periodName: body.periodName, authenticated: body.authenticated });
    if (body.authenticated) await loadBootstrap();
  }

  async function loadBootstrap() {
    const body = await staffFetch<{ ok: true; data: Bootstrap }>(token, "/bootstrap");
    setData(body.data);
  }

  async function loadBreakdown(participantId: string) {
    setBreakdownLoading(true);
    setBreakdownError(null);
    try {
      const body = await staffFetch<{
        ok: true;
        breakdown: Lose2kgTicketBreakdown;
      }>(token, `/participants/${encodeURIComponent(participantId)}/ticket-breakdown`);
      setBreakdown(body.breakdown);
    } catch (err) {
      setBreakdown(null);
      setBreakdownError(err instanceof Error ? err.message : "明細載入失敗");
    } finally {
      setBreakdownLoading(false);
    }
  }

  function openDetail(participantId: string) {
    setDetailId(participantId);
    setBreakdown(null);
    void loadBreakdown(participantId);
  }

  function closeDetail() {
    setDetailId(null);
    setBreakdown(null);
    setBreakdownError(null);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadGate();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staff gate bootstrap
  }, [token]);

  const activeParticipants = useMemo(
    () => (data?.participants ?? []).filter((p) => p.status === "active"),
    [data],
  );

  const detailParticipant = useMemo(
    () => activeParticipants.find((p) => p.id === detailId) ?? null,
    [activeParticipants, detailId],
  );

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          await action();
          setError(null);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "操作失敗";
          setError(msg);
          showToast(msg, "error");
        }
      })();
    });
  }

  async function saveMeasure(
    participantId: string,
    slot: 1 | 2 | 3 | 4,
    weightKg: number,
    nextKey?: string,
  ) {
    const cellKey = `${participantId}:${slot}`;
    setCellStatus((s) => ({ ...s, [cellKey]: "saving" }));
    try {
      const body = await staffFetch<{
        ok: true;
        participant: Lose2kgParticipant;
        measurements: Lose2kgMeasurement[];
        feedback: { message: string; deltaTickets: number; weightChangePct: number | null };
      }>(token, "/measure", {
        method: "POST",
        body: JSON.stringify({ participantId, slot, weightKg }),
      });
      patchParticipant(body.participant);
      patchMeasurements(participantId, body.measurements);
      setCellStatus((s) => ({ ...s, [cellKey]: "ok" }));
      const fb = body.feedback;
      setMeasureFeedback((prev) => ({
        ...prev,
        [participantId]: fb.message,
      }));
      showToast(fb.message);
      if (detailId === participantId) {
        void loadBreakdown(participantId);
      }
      window.setTimeout(() => {
        setCellStatus((s) => ({ ...s, [cellKey]: "idle" }));
      }, 1200);
      if (nextKey) {
        window.setTimeout(() => inputRefs.current[nextKey]?.focus(), 40);
      }
    } catch (err) {
      setCellStatus((s) => ({ ...s, [cellKey]: "err" }));
      throw err;
    }
  }

  async function submitExtraTickets(
    participantId: string,
    delta: number,
    reason: string,
  ) {
    const trimmed = reason.trim();
    if (trimmed.length < 2) throw new Error("請填寫說明（至少 2 個字）");
    if (!Number.isInteger(delta) || delta === 0) throw new Error("張數無效");

    const body = await staffFetch<{ ok: true; participant: Lose2kgParticipant }>(
      token,
      "/tickets",
      {
        method: "POST",
        body: JSON.stringify({ participantId, delta, reason: trimmed }),
      },
    );
    patchParticipant(body.participant);
    setExtraModal(null);
    if (delta > 0) {
      showToast(`🎟 +${delta} 已新增額外抽獎券`);
    } else {
      showToast(`🎟 ${delta} 已扣除額外抽獎券`);
    }
    if (detailId === participantId) {
      void loadBreakdown(participantId);
    }
  }

  if (!gate) return <WorkstationSkeleton />;

  if (!gate.authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f4f1ea_45%,#ffffff_100%)] px-4">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-[#e8e4dc] bg-white p-6 shadow-[0_16px_40px_rgba(29,29,31,0.08)]">
          <div className="space-y-1 text-center">
            <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[#8a7350]">
              再瘦2公斤
            </p>
            <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">{gate.periodName}</h1>
            <p className="text-[0.875rem] text-[#86868b]">活動現場工作站</p>
          </div>
          {error ? <p className="text-center text-[0.875rem] text-[#d70015]">{error}</p> : null}
          <input
            type="password"
            className="w-full rounded-lg border border-[#ddd6c8] bg-white px-4 py-3 text-center text-[1.125rem] tracking-[0.25em]"
            placeholder="工作人員密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                run(async () => {
                  await staffFetch(token, "/login", {
                    method: "POST",
                    body: JSON.stringify({ password }),
                  });
                  setGate({ ...gate, authenticated: true });
                  await loadBootstrap();
                  showToast("✓ 已進入工作站");
                });
              }
            }}
          />
          <Lose2kgButton
            className="w-full"
            loading={pending}
            onClick={() =>
              run(async () => {
                await staffFetch(token, "/login", {
                  method: "POST",
                  body: JSON.stringify({ password }),
                });
                setGate({ ...gate, authenticated: true });
                await loadBootstrap();
                showToast("✓ 已進入工作站");
              })
            }
          >
            進入工作站
          </Lose2kgButton>
        </div>
      </div>
    );
  }

  if (!data) return <WorkstationSkeleton />;

  const slot = data.currentSlot;

  return (
    <div className="min-h-dvh bg-[#f4f1ea] text-[#1d1d1f]">
      <Lose2kgToast message={toast} tone={toastTone} />

      <div className="mx-auto flex min-h-dvh max-w-7xl flex-col md:px-5 md:py-5">
        <header className="border-b border-[#e8e4dc] bg-white px-4 py-3 md:rounded-xl md:border">
          <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#8a7350]">
            再瘦2公斤
          </p>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="text-[1.25rem] font-semibold">{data.period.name}</h1>
              <p className="text-[0.875rem] text-[#86868b]">
                正式進度：第 {slot} 週 · 參賽 {data.participantCount} · 總抽獎券{" "}
                {data.totalTickets}
              </p>
              <p className="text-[0.75rem] text-[#8a7350]">
                四週量測欄位皆可隨時補登或修正
              </p>
            </div>
            <Lose2kgButton onClick={() => setAddOpen(true)}>＋ 新增參賽者</Lose2kgButton>
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {data.period.measurementDates.map((d, i) => (
              <span
                key={i}
                className={`shrink-0 rounded px-2 py-1 text-[0.7rem] tabular-nums ${
                  i + 1 === slot ? "bg-[#1d1d1f] text-white" : "bg-[#f4f1ea] text-[#86868b]"
                }`}
              >
                第{i + 1}週 {shortDate(d)}
                {i === 0 ? " · 基準" : ""}
              </span>
            ))}
          </div>
        </header>

        <main className="flex-1 space-y-4 px-3 py-4 md:px-0">
          {error ? (
            <p className="rounded-lg bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">
              {error}
            </p>
          ) : null}

          <MeasureGrid
            measurementDates={data.period.measurementDates}
            participants={activeParticipants}
            measurements={data.measurements}
            feedback={measureFeedback}
            cellStatus={cellStatus}
            inputRefs={inputRefs}
            onSave={(participantId, slotNum, weightKg, nextKey) =>
              run(async () => {
                await saveMeasure(participantId, slotNum, weightKg, nextKey);
              })
            }
            onOpenDetail={(p) => openDetail(p.id)}
            onExtraTicket={(p) => setExtraModal({ participant: p, mode: "add" })}
            onWithdraw={(p) =>
              run(async () => {
                const ok = window.confirm(`將「${p.name}」移出參賽名單？（不會 hard delete）`);
                if (!ok) return;
                const body = await staffFetch<{ ok: true; participant: Lose2kgParticipant }>(
                  token,
                  `/participants/${encodeURIComponent(p.id)}`,
                  {
                    method: "PATCH",
                    body: JSON.stringify({ status: "withdrawn" }),
                  },
                );
                patchParticipant(body.participant);
                if (detailId === p.id) closeDetail();
                showToast(`✓ 已移出 ${p.name}`);
              })
            }
          />
        </main>
      </div>

      {detailId ? (
        <DetailDrawer
          loading={breakdownLoading}
          error={breakdownError}
          breakdown={breakdown}
          participantName={detailParticipant?.name ?? breakdown?.displayName ?? ""}
          onClose={closeDetail}
          onRetry={() => {
            if (detailId) void loadBreakdown(detailId);
          }}
        />
      ) : null}

      {extraModal ? (
        <ExtraTicketModal
          participant={extraModal.participant}
          mode={extraModal.mode}
          pending={pending}
          onModeChange={(mode) => setExtraModal({ ...extraModal, mode })}
          onClose={() => setExtraModal(null)}
          onConfirm={(delta, reason) =>
            run(async () => {
              await submitExtraTickets(extraModal.participant.id, delta, reason);
            })
          }
        />
      ) : null}

      {addOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5">
            <h2 className="text-[1.125rem] font-semibold">＋ 新增參賽者</h2>
            <input
              className="w-full rounded-lg border border-[#ddd6c8] px-3 py-2.5"
              placeholder="姓名"
              value={addName}
              autoFocus
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                  document.getElementById("lose2kg-add-submit")?.click();
                }
              }}
            />
            <p className="text-[0.75rem] text-[#86868b]">公開名稱將自動同步為姓名</p>
            <div className="flex gap-2">
              <Lose2kgButton tone="secondary" className="flex-1" onClick={() => setAddOpen(false)}>
                取消
              </Lose2kgButton>
              <Lose2kgButton
                id="lose2kg-add-submit"
                className="flex-1"
                loading={pending}
                onClick={() =>
                  run(async () => {
                    if (!addName.trim()) throw new Error("請填寫姓名");
                    const body = await staffFetch<{
                      ok: true;
                      participant: Lose2kgParticipant;
                    }>(token, "/participants", {
                      method: "POST",
                      body: JSON.stringify({
                        name: addName.trim(),
                        publicDisplayName: addName.trim(),
                      }),
                    });
                    setData((prev) => {
                      if (!prev) return prev;
                      const participants = [...prev.participants, body.participant];
                      return {
                        ...prev,
                        participants,
                        participantCount: participants.filter((p) => p.status === "active")
                          .length,
                        totalTickets: participants
                          .filter((p) => p.status === "active")
                          .reduce((s, p) => s + p.totalTicketBalance, 0),
                      };
                    });
                    setAddOpen(false);
                    const name = addName.trim();
                    setAddName("");
                    showToast(`✓ 已新增 ${name}`);
                  })
                }
              >
                新增
              </Lose2kgButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailDrawer({
  loading,
  error,
  breakdown,
  participantName,
  onClose,
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  breakdown: Lose2kgTicketBreakdown | null;
  participantName: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="關閉明細"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-[-8px_0_32px_rgba(29,29,31,0.12)] md:max-w-[26rem]">
        {loading && !breakdown ? (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-[#ebe6dc] px-4 py-3">
              <div>
                <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#8a7350]">
                  抽獎券計算明細
                </p>
                <h2 className="text-[1.25rem] font-semibold text-[#1d1d1f]">{participantName}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-3 py-1.5 text-[0.875rem] text-[#86868b] transition active:scale-[0.97] hover:bg-[#f4f1ea]"
              >
                關閉
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="h-20 animate-pulse rounded-lg bg-[#ebe6dc]" />
              <div className="h-40 animate-pulse rounded-lg bg-[#ebe6dc]" />
              <div className="h-32 animate-pulse rounded-lg bg-[#ebe6dc]" />
            </div>
          </div>
        ) : error && !breakdown ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[0.875rem] text-[#d70015]">{error}</p>
            <div className="flex gap-2">
              <Lose2kgButton tone="secondary" onClick={onClose}>
                關閉
              </Lose2kgButton>
              <Lose2kgButton onClick={onRetry}>重試</Lose2kgButton>
            </div>
          </div>
        ) : breakdown ? (
          <TicketBreakdownPanel breakdown={breakdown} onClose={onClose} />
        ) : null}
      </aside>
    </div>
  );
}

function ExtraTicketModal({
  participant,
  mode,
  pending,
  onModeChange,
  onClose,
  onConfirm,
}: {
  participant: Lose2kgParticipant;
  mode: "add" | "deduct";
  pending: boolean;
  onModeChange: (mode: "add" | "deduct") => void;
  onClose: () => void;
  onConfirm: (delta: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState(1);
  const [custom, setCustom] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [reason, setReason] = useState("");

  const resolvedAmount = useCustom ? Number(custom) : amount;
  const canSubmit =
    Number.isInteger(resolvedAmount) &&
    resolvedAmount > 0 &&
    reason.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
        <div>
          <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#8a7350]">
            額外抽獎券
          </p>
          <h2 className="text-[1.125rem] font-semibold">{participant.name}</h2>
          <p className="text-[0.8125rem] text-[#86868b]">
            目前額外票 {participant.activityTicketBalance} · 總抽獎券{" "}
            {participant.totalTicketBalance}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f4f1ea] p-1">
          <button
            type="button"
            className={`rounded-md py-2 text-[0.875rem] font-semibold transition active:scale-[0.97] ${
              mode === "add" ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#86868b]"
            }`}
            onClick={() => onModeChange("add")}
          >
            新增
          </button>
          <button
            type="button"
            className={`rounded-md py-2 text-[0.875rem] font-semibold transition active:scale-[0.97] ${
              mode === "deduct" ? "bg-white text-[#1d1d1f] shadow-sm" : "text-[#86868b]"
            }`}
            onClick={() => onModeChange("deduct")}
          >
            扣除
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[0.75rem] font-medium text-[#86868b]">張數</p>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className={`min-w-[3.25rem] rounded-lg border px-3 py-2 text-[0.9375rem] font-semibold transition active:scale-[0.97] ${
                  !useCustom && amount === n
                    ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                    : "border-[#ddd6c8] bg-white text-[#1d1d1f]"
                }`}
                onClick={() => {
                  setUseCustom(false);
                  setAmount(n);
                }}
              >
                {mode === "deduct" ? `−${n}` : `+${n}`}
              </button>
            ))}
            <button
              type="button"
              className={`rounded-lg border px-3 py-2 text-[0.875rem] font-semibold transition active:scale-[0.97] ${
                useCustom
                  ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                  : "border-[#ddd6c8] bg-white text-[#1d1d1f]"
              }`}
              onClick={() => setUseCustom(true)}
            >
              自訂
            </button>
          </div>
          {useCustom ? (
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className="w-full rounded-lg border border-[#ddd6c8] px-3 py-2.5 tabular-nums"
              placeholder="自訂張數"
              value={custom}
              autoFocus
              onChange={(e) => setCustom(e.target.value)}
            />
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-[0.75rem] font-medium text-[#86868b]" htmlFor="extra-reason">
            {mode === "deduct" ? "扣除原因（必填）" : "說明（必填）"}
          </label>
          <textarea
            id="extra-reason"
            rows={3}
            className="w-full resize-none rounded-lg border border-[#ddd6c8] px-3 py-2.5 text-[0.9375rem] outline-none focus:border-[#8a7350]"
            placeholder={
              mode === "deduct"
                ? "例如：誤加／更正紀錄"
                : "例如：參加 9/10 營養講座"
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Lose2kgButton tone="secondary" className="flex-1" onClick={onClose}>
            取消
          </Lose2kgButton>
          <Lose2kgButton
            className="flex-1"
            tone={mode === "deduct" ? "danger" : "primary"}
            loading={pending}
            disabled={!canSubmit}
            onClick={() => {
              const delta = mode === "deduct" ? -resolvedAmount : resolvedAmount;
              onConfirm(delta, reason);
            }}
          >
            確認
          </Lose2kgButton>
        </div>
      </div>
    </div>
  );
}

function MeasureGrid({
  measurementDates,
  participants,
  measurements,
  feedback,
  cellStatus,
  inputRefs,
  onSave,
  onOpenDetail,
  onExtraTicket,
  onWithdraw,
}: {
  measurementDates: [string, string, string, string];
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  feedback: Record<string, string>;
  cellStatus: Record<string, "idle" | "saving" | "ok" | "err">;
  inputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onSave: (
    participantId: string,
    slot: 1 | 2 | 3 | 4,
    weightKg: number,
    nextKey?: string,
  ) => void;
  onOpenDetail: (p: Lose2kgParticipant) => void;
  onExtraTicket: (p: Lose2kgParticipant) => void;
  onWithdraw: (p: Lose2kgParticipant) => void;
}) {
  const slots: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

  function cellBorder(key: string) {
    const st = cellStatus[key];
    if (st === "ok") return "border-[#34c759] ring-1 ring-[#34c759]/40";
    if (st === "err") return "border-[#d70015]";
    if (st === "saving") return "border-[#c4a35a]";
    return "border-[#ddd6c8]";
  }

  function trySave(
    participantId: string,
    slot: 1 | 2 | 3 | 4,
    raw: string,
    nextKey?: string,
  ) {
    const value = Number(raw);
    if (!(value > 0) || !Number.isFinite(value)) return;
    const existing = weightOf(measurements, participantId, slot);
    if (existing != null && Math.abs(existing - value) < 1e-9) return;
    onSave(participantId, slot, value, nextKey);
  }

  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto rounded-xl border border-[#e8e4dc] bg-white md:block">
        <table className="min-w-full text-left text-[0.8125rem]">
          <thead className="bg-[#f4f1ea] text-[#86868b]">
            <tr>
              <th className="sticky left-0 bg-[#f4f1ea] px-3 py-2.5">姓名</th>
              {slots.map((s) => (
                <th key={s} className="px-2 py-2.5">
                  <div className="leading-tight">
                    <p>第{s}次</p>
                    <p className="font-normal tabular-nums">{shortDate(measurementDates[s - 1]!)}</p>
                    {s === 1 ? <p className="font-medium text-[#8a7350]">基準</p> : null}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2.5">目前變化%</th>
              <th className="px-2 py-2.5">體重票</th>
              <th className="px-2 py-2.5">額外票</th>
              <th className="px-2 py-2.5">總抽獎券</th>
              <th className="px-2 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, rowIndex) => (
              <tr key={p.id} className="border-t border-[#f3efe6]">
                <td className="sticky left-0 bg-white px-3 py-2">
                  <button
                    type="button"
                    className="text-left font-semibold transition active:scale-[0.97] hover:text-[#8a7350]"
                    onClick={() => onOpenDetail(p)}
                  >
                    {p.name}
                  </button>
                  {feedback[p.id] ? (
                    <p className="text-[0.7rem] font-medium text-[#248a3d]">{feedback[p.id]}</p>
                  ) : null}
                </td>
                {slots.map((s, colIndex) => {
                  const key = `${p.id}:${s}`;
                  const nextSlot = slots[colIndex + 1];
                  const nextKey = nextSlot
                    ? `${p.id}:${nextSlot}`
                    : participants[rowIndex + 1]
                      ? `${participants[rowIndex + 1]!.id}:1`
                      : undefined;
                  return (
                    <td key={s} className="px-1.5 py-1.5">
                      <input
                        ref={(el) => {
                          inputRefs.current[key] = el;
                        }}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        defaultValue={weightOf(measurements, p.id, s) ?? ""}
                        key={`${key}-${weightOf(measurements, p.id, s) ?? "empty"}`}
                        className={`w-[4.5rem] rounded-md border px-1.5 py-1.5 text-[0.875rem] tabular-nums outline-none transition ${cellBorder(key)}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            trySave(p.id, s, (e.target as HTMLInputElement).value, nextKey);
                          }
                        }}
                        onBlur={(e) => {
                          trySave(p.id, s, e.target.value);
                        }}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 tabular-nums">{formatPct(p.currentWeightChangePct)}</td>
                <td className="px-2 py-2 tabular-nums">{p.weightTicketBalance}</td>
                <td className="px-2 py-2 tabular-nums">{p.activityTicketBalance}</td>
                <td className="px-2 py-2 font-semibold tabular-nums text-[#8a7350]">
                  {p.totalTicketBalance}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      className="rounded-md border border-[#ddd6c8] bg-white px-2.5 py-1.5 text-[0.75rem] font-semibold transition active:scale-[0.97] hover:bg-[#f4f1ea]"
                      onClick={() => onOpenDetail(p)}
                    >
                      明細
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-[#1d1d1f] px-2.5 py-1.5 text-[0.75rem] font-semibold text-white transition active:scale-[0.97]"
                      onClick={() => onExtraTicket(p)}
                    >
                      ＋額外票
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1.5 text-[0.7rem] text-[#86868b] transition active:scale-[0.97] hover:bg-[#f4f1ea]"
                      onClick={() => onWithdraw(p)}
                    >
                      移出
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {participants.map((p) => (
          <div key={p.id} className="rounded-xl border border-[#e8e4dc] bg-white px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                className="min-w-0 text-left transition active:scale-[0.97]"
                onClick={() => onOpenDetail(p)}
              >
                <p className="font-semibold">{p.name}</p>
                <p className="text-[0.75rem] text-[#86868b]">
                  目前 {formatPct(p.currentWeightChangePct)}
                </p>
              </button>
              <div className="text-right">
                <p className="font-semibold text-[#8a7350]">🎟 {p.totalTicketBalance}</p>
                <p className="text-[0.65rem] text-[#86868b]">
                  體重 {p.weightTicketBalance} · 額外 {p.activityTicketBalance}
                </p>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {slots.map((s) => {
                const key = `${p.id}:${s}`;
                return (
                  <label key={s} className="space-y-0.5">
                    <span className="text-[0.65rem] text-[#86868b]">
                      第{s}次｜{shortDate(measurementDates[s - 1]!)}
                      {s === 1 ? " · 基準" : ""}
                    </span>
                    <input
                      ref={(el) => {
                        inputRefs.current[`m-${key}`] = el;
                      }}
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      defaultValue={weightOf(measurements, p.id, s) ?? ""}
                      key={`m-${key}-${weightOf(measurements, p.id, s) ?? "empty"}`}
                      className={`w-full rounded-md border px-2 py-2 text-[0.9375rem] tabular-nums ${cellBorder(key)}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          trySave(p.id, s, (e.target as HTMLInputElement).value);
                        }
                      }}
                      onBlur={(e) => {
                        trySave(p.id, s, e.target.value);
                      }}
                    />
                  </label>
                );
              })}
            </div>

            {feedback[p.id] ? (
              <p className="mt-1 text-[0.75rem] font-medium text-[#248a3d]">{feedback[p.id]}</p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2 border-t border-[#f3efe6] pt-2">
              <button
                type="button"
                className="rounded-md border border-[#ddd6c8] px-3 py-1.5 text-[0.8125rem] font-semibold transition active:scale-[0.97]"
                onClick={() => onOpenDetail(p)}
              >
                明細
              </button>
              <button
                type="button"
                className="rounded-md bg-[#1d1d1f] px-3 py-1.5 text-[0.8125rem] font-semibold text-white transition active:scale-[0.97]"
                onClick={() => onExtraTicket(p)}
              >
                ＋額外票
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1.5 text-[0.75rem] text-[#86868b] transition active:scale-[0.97]"
                onClick={() => onWithdraw(p)}
              >
                移出名單
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
