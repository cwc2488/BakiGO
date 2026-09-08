"use client";

import { Lose2kgButton, Lose2kgToast } from "@/components/lose2kg/Lose2kgUi";
import type {
  Lose2kgDraw,
  Lose2kgMeasurement,
  Lose2kgParticipant,
  Lose2kgPeriod,
  Lose2kgPrize,
  Lose2kgTicketEvent,
} from "@/types/lose2kg";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";

const DrawRevealOverlay = dynamic(
  () =>
    import("@/components/lose2kg/DrawRevealOverlay").then((m) => m.DrawRevealOverlay),
  { ssr: false },
);

type Tab = "measure" | "tickets" | "draw";

type Bootstrap = {
  period: Lose2kgPeriod;
  currentSlot: 1 | 2 | 3 | 4;
  nextMeasurementDate: string | null;
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  participantCount: number;
  totalTickets: number;
};

type DrawBootstrap = {
  prizes: Lose2kgPrize[];
  draws: Lose2kgDraw[];
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
  const [drawData, setDrawData] = useState<DrawBootstrap | null>(null);
  const [tab, setTab] = useState<Tab>("measure");
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
  const [history, setHistory] = useState<Lose2kgTicketEvent[] | null>(null);
  const [historyName, setHistoryName] = useState("");
  const [drawOpen, setDrawOpen] = useState(false);
  const [drawNames, setDrawNames] = useState<string[]>([]);
  const [drawWinner, setDrawWinner] = useState<string | null>(null);
  const [tempMode, setTempMode] = useState(false);
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set());
  const [tempQuery, setTempQuery] = useState("");
  const [ticketMenuId, setTicketMenuId] = useState<string | null>(null);
  const [expandedMobile, setExpandedMobile] = useState<Set<string>>(new Set());
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
    setTempSelected(
      new Set(body.data.participants.filter((p) => p.status === "active").map((p) => p.id)),
    );
  }

  async function ensureDrawBootstrap() {
    if (drawData) return drawData;
    const body = await staffFetch<{ ok: true; data: DrawBootstrap }>(
      token,
      "/draw-bootstrap",
    );
    setDrawData(body.data);
    return body.data;
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
      const pct =
        fb.weightChangePct != null ? ` ${fb.weightChangePct.toFixed(2)}%` : "";
      const ticketHint =
        fb.deltaTickets > 0
          ? ` 🎟 +${fb.deltaTickets}`
          : fb.deltaTickets < 0
            ? ` 🎟 ${fb.deltaTickets}`
            : "";
      setMeasureFeedback((prev) => ({
        ...prev,
        [participantId]: `✓ 已儲存${pct}${ticketHint}`,
      }));
      showToast(fb.message);
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

  async function addTickets(
    participantId: string,
    delta: number,
    reason: string,
  ) {
    const body = await staffFetch<{ ok: true; participant: Lose2kgParticipant }>(
      token,
      "/tickets",
      {
        method: "POST",
        body: JSON.stringify({ participantId, delta, reason }),
      },
    );
    patchParticipant(body.participant);
    setTicketMenuId(null);
    showToast(`🎟 ${delta > 0 ? `+${delta}` : delta} 已新增活動票`);
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
  const navItems: { id: Tab; label: string }[] = [
    { id: "measure", label: "量測" },
    { id: "tickets", label: "票數" },
    { id: "draw", label: "抽獎" },
  ];

  return (
    <div className="min-h-dvh bg-[#f4f1ea] text-[#1d1d1f]">
      <Lose2kgToast message={toast} tone={toastTone} />
      <DrawRevealOverlay
        open={drawOpen}
        names={drawNames}
        winnerName={drawWinner}
        onDone={() => setDrawOpen(false)}
      />

      <div className="mx-auto flex min-h-dvh max-w-7xl gap-0 md:gap-5 md:px-5 md:py-5">
        <aside className="hidden w-52 shrink-0 flex-col gap-2 rounded-xl border border-[#e8e4dc] bg-white p-4 md:flex">
          <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#8a7350]">
            再瘦2公斤
          </p>
          <h1 className="text-[1.0625rem] font-semibold leading-snug">{data.period.name}</h1>
          <p className="text-[0.8125rem] text-[#86868b]">目前：第 {slot} / 4 次量測</p>
          <div className="flex flex-wrap gap-1 py-1">
            {data.period.measurementDates.map((d, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-[0.7rem] tabular-nums ${
                  i + 1 === slot ? "bg-[#1d1d1f] text-white" : "bg-[#f4f1ea] text-[#86868b]"
                }`}
              >
                {shortDate(d)}
              </span>
            ))}
          </div>
          <p className="text-[0.8125rem]">
            參賽者 <strong>{data.participantCount}</strong> · 總票{" "}
            <strong className="text-[#8a7350]">{data.totalTickets}</strong>
          </p>
          <nav className="mt-3 flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  if (item.id === "draw") {
                    void ensureDrawBootstrap().catch((err) => {
                      showToast(
                        err instanceof Error ? err.message : "抽獎資料載入失敗",
                        "error",
                      );
                    });
                  }
                }}
                className={`rounded-lg px-3 py-2.5 text-left text-[0.9375rem] font-medium transition duration-[140ms] active:scale-[0.97] ${
                  tab === item.id ? "bg-[#1d1d1f] text-white" : "hover:bg-[#f4f1ea]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">
          <header className="border-b border-[#e8e4dc] bg-white px-4 py-3 md:rounded-xl md:border">
            <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-[#8a7350] md:hidden">
              再瘦2公斤
            </p>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h1 className="text-[1.25rem] font-semibold md:hidden">{data.period.name}</h1>
                <p className="text-[0.875rem] text-[#86868b]">
                  第 {slot} / 4 次 · 參賽 {data.participantCount} · 總票 {data.totalTickets}
                </p>
              </div>
              {tab === "measure" ? (
                <Lose2kgButton onClick={() => setAddOpen(true)}>＋ 新增參賽者</Lose2kgButton>
              ) : null}
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto md:hidden">
              {data.period.measurementDates.map((d, i) => (
                <span
                  key={i}
                  className={`shrink-0 rounded px-2 py-1 text-[0.7rem] tabular-nums ${
                    i + 1 === slot ? "bg-[#1d1d1f] text-white" : "bg-[#f4f1ea] text-[#86868b]"
                  }`}
                >
                  第{i + 1}次 {shortDate(d)}
                </span>
              ))}
            </div>
          </header>

          <div className="flex-1 space-y-4 px-3 py-4 md:px-0 md:pt-4">
            {error ? (
              <p className="rounded-lg bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">
                {error}
              </p>
            ) : null}

            {tab === "measure" ? (
              <MeasureGrid
                participants={activeParticipants}
                measurements={data.measurements}
                feedback={measureFeedback}
                cellStatus={cellStatus}
                inputRefs={inputRefs}
                ticketMenuId={ticketMenuId}
                setTicketMenuId={setTicketMenuId}
                expandedMobile={expandedMobile}
                setExpandedMobile={setExpandedMobile}
                onSave={(participantId, slotNum, weightKg, nextKey) =>
                  run(async () => {
                    await saveMeasure(participantId, slotNum, weightKg, nextKey);
                  })
                }
                onAddTicket={(id, delta, reason) =>
                  run(async () => {
                    await addTickets(id, delta, reason);
                  })
                }
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
                    showToast(`✓ 已移出 ${p.name}`);
                  })
                }
                onCustomTicket={(p) =>
                  run(async () => {
                    const deltaRaw = window.prompt("加票張數", "1");
                    if (!deltaRaw) return;
                    const delta = Number(deltaRaw);
                    if (!Number.isInteger(delta) || delta === 0) throw new Error("張數無效");
                    const reason =
                      window.prompt(
                        "原因（參加指定活動 / 完成任務 / 帶朋友 / 其他）",
                        "參加指定活動",
                      ) ?? "活動票";
                    await addTickets(p.id, delta, reason);
                  })
                }
              />
            ) : null}

            {tab === "tickets" ? (
              <div className="space-y-2">
                {activeParticipants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-[#e8e4dc] bg-white px-3 py-3"
                  >
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-[0.75rem] text-[#86868b]">
                        體重票 {p.weightTicketBalance} · 活動票 {p.activityTicketBalance}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#8a7350]">🎟 {p.totalTicketBalance}</span>
                      <Lose2kgButton
                        tone="secondary"
                        onClick={() =>
                          run(async () => {
                            const body = await staffFetch<{
                              ok: true;
                              events: Lose2kgTicketEvent[];
                            }>(
                              token,
                              `/tickets?participantId=${encodeURIComponent(p.id)}`,
                            );
                            setHistory(body.events);
                            setHistoryName(p.name);
                          })
                        }
                      >
                        紀錄
                      </Lose2kgButton>
                      <Lose2kgButton
                        onClick={() =>
                          run(async () => {
                            await addTickets(p.id, 1, "參加指定活動");
                          })
                        }
                      >
                        ＋加票
                      </Lose2kgButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "draw" ? (
              drawData ? (
                <DrawPanel
                  prizes={drawData.prizes}
                  participants={activeParticipants}
                  pending={pending}
                  tempMode={tempMode}
                  setTempMode={setTempMode}
                  tempSelected={tempSelected}
                  setTempSelected={setTempSelected}
                  tempQuery={tempQuery}
                  setTempQuery={setTempQuery}
                  onFormal={(prize) =>
                    run(async () => {
                      const eligible = activeParticipants.filter(
                        (p) => p.totalTicketBalance > 0,
                      );
                      const total = eligible.reduce((s, p) => s + p.totalTicketBalance, 0);
                      const ok = window.confirm(
                        `確認抽獎？\n獎項：${prize.name}\n有效參賽者：${eligible.length} 人\n總票數：${total} 張`,
                      );
                      if (!ok) return;
                      const result = await staffFetch<{
                        ok: true;
                        winners: { name: string }[];
                      }>(token, "/draws", {
                        method: "POST",
                        body: JSON.stringify({
                          prizeId: prize.id,
                          idempotencyKey: crypto.randomUUID(),
                        }),
                      });
                      setDrawNames(eligible.map((p) => p.publicDisplayName || p.name));
                      setDrawWinner(result.winners[0]?.name ?? null);
                      window.setTimeout(() => setDrawOpen(true), 120);
                      const refreshed = await staffFetch<{ ok: true; data: DrawBootstrap }>(
                        token,
                        "/draw-bootstrap",
                      );
                      setDrawData(refreshed.data);
                    })
                  }
                  onTempDraw={() =>
                    run(async () => {
                      const present = [...tempSelected];
                      if (present.length === 0) throw new Error("請至少選擇一位");
                      const created = await staffFetch<{
                        ok: true;
                        session: { publicToken: string };
                      }>(token, "/temp-draws", {
                        method: "POST",
                        body: JSON.stringify({ presentParticipantIds: present }),
                      });
                      const names = activeParticipants
                        .filter((p) => tempSelected.has(p.id))
                        .map((p) => p.publicDisplayName || p.name);
                      const executed = await staffFetch<{
                        ok: true;
                        winnerName: string;
                      }>(token, "/temp-draws", {
                        method: "POST",
                        body: JSON.stringify({
                          action: "execute",
                          tempToken: created.session.publicToken,
                        }),
                      });
                      setDrawNames(names);
                      setDrawWinner(executed.winnerName);
                      window.setTimeout(() => setDrawOpen(true), 120);
                    })
                  }
                />
              ) : (
                <div className="h-40 animate-pulse rounded-xl bg-[#ebe6dc]" />
              )
            ) : null}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8e4dc] bg-white/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-3 gap-1 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                if (item.id === "draw") {
                  void ensureDrawBootstrap().catch((err) => {
                    showToast(
                      err instanceof Error ? err.message : "抽獎資料載入失敗",
                      "error",
                    );
                  });
                }
              }}
              className={`rounded-lg py-2.5 text-[0.8125rem] font-semibold transition duration-[140ms] active:scale-[0.97] ${
                tab === item.id ? "bg-[#1d1d1f] text-white" : "text-[#86868b]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

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
                    setTempSelected((prev) => new Set([...prev, body.participant.id]));
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

      {history ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{historyName} · 票券紀錄</h2>
              <button type="button" onClick={() => setHistory(null)}>
                關閉
              </button>
            </div>
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-[0.875rem] text-[#86868b]">尚無紀錄</p>
              ) : (
                history.map((e) => (
                  <div key={e.id} className="rounded-lg border border-[#f0ebe1] px-3 py-2">
                    <p className="text-[0.875rem] font-medium">
                      {e.reason ?? e.eventType} · {e.delta > 0 ? `+${e.delta}` : e.delta}
                    </p>
                    <p className="text-[0.7rem] text-[#86868b]">{e.createdAt}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MeasureGrid({
  participants,
  measurements,
  feedback,
  cellStatus,
  inputRefs,
  ticketMenuId,
  setTicketMenuId,
  expandedMobile,
  setExpandedMobile,
  onSave,
  onAddTicket,
  onWithdraw,
  onCustomTicket,
}: {
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  feedback: Record<string, string>;
  cellStatus: Record<string, "idle" | "saving" | "ok" | "err">;
  inputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  ticketMenuId: string | null;
  setTicketMenuId: (id: string | null) => void;
  expandedMobile: Set<string>;
  setExpandedMobile: (s: Set<string>) => void;
  onSave: (
    participantId: string,
    slot: 1 | 2 | 3 | 4,
    weightKg: number,
    nextKey?: string,
  ) => void;
  onAddTicket: (id: string, delta: number, reason: string) => void;
  onWithdraw: (p: Lose2kgParticipant) => void;
  onCustomTicket: (p: Lose2kgParticipant) => void;
}) {
  const slots: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

  function cellBorder(key: string) {
    const st = cellStatus[key];
    if (st === "ok") return "border-[#34c759] ring-1 ring-[#34c759]/40";
    if (st === "err") return "border-[#d70015]";
    if (st === "saving") return "border-[#c4a35a]";
    return "border-[#ddd6c8]";
  }

  return (
    <div className="space-y-3">
      {/* Desktop 4-week grid */}
      <div className="hidden overflow-x-auto rounded-xl border border-[#e8e4dc] bg-white md:block">
        <table className="min-w-full text-left text-[0.8125rem]">
          <thead className="bg-[#f4f1ea] text-[#86868b]">
            <tr>
              <th className="sticky left-0 bg-[#f4f1ea] px-3 py-2.5">姓名</th>
              {slots.map((s) => (
                <th key={s} className="px-2 py-2.5">
                  第{s}次
                </th>
              ))}
              <th className="px-2 py-2.5">變化%</th>
              <th className="px-2 py-2.5">體重票</th>
              <th className="px-2 py-2.5">活動票</th>
              <th className="px-2 py-2.5">總票</th>
              <th className="px-2 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, rowIndex) => (
              <tr key={p.id} className="border-t border-[#f3efe6]">
                <td className="sticky left-0 bg-white px-3 py-2 font-semibold">
                  {p.name}
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
                            const value = Number((e.target as HTMLInputElement).value);
                            if (value > 0) onSave(p.id, s, value, nextKey);
                          }
                        }}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 tabular-nums">
                  {p.currentWeightChangePct != null
                    ? `${p.currentWeightChangePct.toFixed(2)}%`
                    : "—"}
                </td>
                <td className="px-2 py-2">{p.weightTicketBalance}</td>
                <td className="px-2 py-2">{p.activityTicketBalance}</td>
                <td className="px-2 py-2 font-semibold text-[#8a7350]">
                  {p.totalTicketBalance}
                </td>
                <td className="relative px-2 py-2">
                  <button
                    type="button"
                    className="rounded-md bg-[#1d1d1f] px-2.5 py-1.5 text-[0.75rem] font-semibold text-white transition active:scale-[0.97]"
                    onClick={() => setTicketMenuId(ticketMenuId === p.id ? null : p.id)}
                  >
                    ＋加票
                  </button>
                  {ticketMenuId === p.id ? (
                    <div className="absolute right-2 z-20 mt-1 w-36 rounded-lg border border-[#e8e4dc] bg-white p-1 shadow-lg">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-[0.8125rem] hover:bg-[#f4f1ea] active:scale-[0.98]"
                          onClick={() => onAddTicket(p.id, n, "參加指定活動")}
                        >
                          +{n}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-[0.8125rem] hover:bg-[#f4f1ea]"
                        onClick={() => onCustomTicket(p)}
                      >
                        自訂
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-md px-2 py-1.5 text-left text-[0.75rem] text-[#86868b] hover:bg-[#f4f1ea]"
                        onClick={() => onWithdraw(p)}
                      >
                        移出名單
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile compact rows */}
      <div className="space-y-2 md:hidden">
        {participants.map((p) => {
          const open = expandedMobile.has(p.id);
          return (
            <div key={p.id} className="rounded-xl border border-[#e8e4dc] bg-white px-3 py-3">
              <button
                type="button"
                className="flex w-full items-start justify-between text-left active:scale-[0.99]"
                onClick={() => {
                  const next = new Set(expandedMobile);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  setExpandedMobile(next);
                }}
              >
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-[0.75rem] text-[#86868b]">
                    目前{" "}
                    {p.currentWeightChangePct != null
                      ? `${p.currentWeightChangePct.toFixed(1)}%`
                      : "—"}
                  </p>
                </div>
                <p className="font-semibold text-[#8a7350]">🎟 {p.totalTicketBalance}</p>
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {slots.map((s) => {
                  const key = `${p.id}:${s}`;
                  return (
                    <label key={s} className="space-y-0.5">
                      <span className="text-[0.65rem] text-[#86868b]">第{s}次</span>
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
                            const value = Number((e.target as HTMLInputElement).value);
                            if (value > 0) onSave(p.id, s, value);
                          }
                        }}
                        onBlur={(e) => {
                          const value = Number(e.target.value);
                          const prev = weightOf(measurements, p.id, s);
                          if (value > 0 && value !== prev) onSave(p.id, s, value);
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              {feedback[p.id] ? (
                <p className="mt-1 text-[0.75rem] font-medium text-[#248a3d]">{feedback[p.id]}</p>
              ) : null}
              {open ? (
                <div className="mt-2 space-y-2 border-t border-[#f3efe6] pt-2 text-[0.8125rem]">
                  <p>
                    體重票 {p.weightTicketBalance} · 活動票 {p.activityTicketBalance} · 總票{" "}
                    {p.totalTicketBalance}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="rounded-md border border-[#ddd6c8] px-3 py-1.5 font-semibold active:scale-[0.97]"
                        onClick={() => onAddTicket(p.id, n, "參加指定活動")}
                      >
                        +{n}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="rounded-md bg-[#1d1d1f] px-3 py-1.5 font-semibold text-white active:scale-[0.97]"
                      onClick={() => onCustomTicket(p)}
                    >
                      ＋活動票
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2 py-1.5 text-[#86868b]"
                      onClick={() => onWithdraw(p)}
                    >
                      移出名單
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DrawPanel({
  prizes,
  participants,
  pending,
  tempMode,
  setTempMode,
  tempSelected,
  setTempSelected,
  tempQuery,
  setTempQuery,
  onFormal,
  onTempDraw,
}: {
  prizes: Lose2kgPrize[];
  participants: Lose2kgParticipant[];
  pending: boolean;
  tempMode: boolean;
  setTempMode: (v: boolean) => void;
  tempSelected: Set<string>;
  setTempSelected: (v: Set<string>) => void;
  tempQuery: string;
  setTempQuery: (v: string) => void;
  onFormal: (prize: Lose2kgPrize) => void;
  onTempDraw: () => void;
}) {
  const eligible = participants.filter((p) => p.totalTicketBalance > 0);
  const totalTickets = eligible.reduce((s, p) => s + p.totalTicketBalance, 0);
  const filtered = participants.filter((p) => {
    const q = tempQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) || p.publicDisplayName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {prizes.map((prize) => (
        <div key={prize.id} className="space-y-3 rounded-xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1.125rem] font-semibold">{prize.name}</h2>
          <p className="text-[0.875rem] text-[#86868b]">
            有效參賽者 {eligible.length} 人 · 總票數 {totalTickets} 張
          </p>
          <Lose2kgButton
            loading={pending}
            disabled={prize.status === "drawn"}
            onClick={() => onFormal(prize)}
          >
            開始抽獎
          </Lose2kgButton>
        </div>
      ))}

      <div className="space-y-3 rounded-xl border border-[#e8e4dc] bg-white p-4">
        <h2 className="text-[1.125rem] font-semibold">臨時抽獎</h2>
        <p className="text-[0.875rem] text-[#86868b]">每人等機率，不看票數。</p>
        {!tempMode ? (
          <Lose2kgButton
            tone="secondary"
            onClick={() => {
              setTempSelected(new Set(participants.map((p) => p.id)));
              setTempMode(true);
            }}
          >
            臨時抽獎
          </Lose2kgButton>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Lose2kgButton
                tone="secondary"
                onClick={() => setTempSelected(new Set(participants.map((p) => p.id)))}
              >
                全選
              </Lose2kgButton>
              <Lose2kgButton tone="secondary" onClick={() => setTempSelected(new Set())}>
                全部取消
              </Lose2kgButton>
              <input
                className="min-w-[8rem] flex-1 rounded-lg border border-[#ddd6c8] px-3 py-2 text-[0.875rem]"
                placeholder="搜尋"
                value={tempQuery}
                onChange={(e) => setTempQuery(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[#eee8dc]">
              {filtered.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center justify-between border-b border-[#f3efe6] px-3 py-2.5 last:border-b-0"
                >
                  <span>{p.name}</span>
                  <input
                    type="checkbox"
                    checked={tempSelected.has(p.id)}
                    onChange={() => {
                      const next = new Set(tempSelected);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      setTempSelected(next);
                    }}
                  />
                </label>
              ))}
            </div>
            <p className="text-[0.875rem] text-[#86868b]">本次抽獎 {tempSelected.size} 人</p>
            <Lose2kgButton loading={pending} onClick={onTempDraw}>
              開始抽獎
            </Lose2kgButton>
          </>
        )}
      </div>
    </div>
  );
}
