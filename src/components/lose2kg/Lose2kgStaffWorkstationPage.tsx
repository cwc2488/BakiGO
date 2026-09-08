"use client";

import { DrawRevealOverlay } from "@/components/lose2kg/DrawRevealOverlay";
import { Lose2kgButton, Lose2kgToast } from "@/components/lose2kg/Lose2kgUi";
import type {
  Lose2kgDraw,
  Lose2kgMeasurement,
  Lose2kgParticipant,
  Lose2kgPeriod,
  Lose2kgPrize,
  Lose2kgTicketEvent,
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

type Tab = "participants" | "measure" | "tickets" | "draw";

type Bootstrap = {
  period: Lose2kgPeriod;
  currentSlot: 1 | 2 | 3 | 4;
  nextMeasurementDate: string | null;
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
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
    measurements.find((m) => m.participantId === participantId && m.slot === slot)?.weightKg ?? null
  );
}

function lastWeight(
  measurements: Lose2kgMeasurement[],
  participantId: string,
  beforeSlot: number,
): number | null {
  for (let s = beforeSlot - 1; s >= 1; s -= 1) {
    const w = weightOf(measurements, participantId, s);
    if (w != null) return w;
  }
  return null;
}

export function Lose2kgStaffWorkstationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [gate, setGate] = useState<{
    periodName: string;
    authenticated: boolean;
  } | null>(null);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [tab, setTab] = useState<Tab>("measure");
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error" | "info">("success");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addPublic, setAddPublic] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addAdvanced, setAddAdvanced] = useState(false);
  const [measureFeedback, setMeasureFeedback] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<Lose2kgTicketEvent[] | null>(null);
  const [historyName, setHistoryName] = useState("");
  const [drawOpen, setDrawOpen] = useState(false);
  const [drawNames, setDrawNames] = useState<string[]>([]);
  const [drawWinner, setDrawWinner] = useState<string | null>(null);
  const [tempMode, setTempMode] = useState(false);
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set());
  const [tempQuery, setTempQuery] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function showToast(msg: string, tone: "success" | "error" | "info" = "success") {
    setToast(msg);
    setToastTone(tone);
    window.setTimeout(() => setToast(null), 2400);
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

  if (!gate) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f7f3ea] text-[#86868b]">
        載入中…
      </div>
    );
  }

  if (!gate.authenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f7f3ea_45%,#ffffff_100%)] px-4">
        <div className="w-full max-w-md space-y-5 rounded-[1.75rem] border border-[#e8e4dc] bg-[#fffcf7] p-6 shadow-[0_24px_60px_rgba(29,29,31,0.08)]">
          <div className="space-y-1 text-center">
            <p className="text-[0.75rem] font-semibold tracking-[0.18em] text-[#c4a35a]">
              再瘦2公斤
            </p>
            <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">{gate.periodName}</h1>
            <p className="text-[0.875rem] text-[#86868b]">活動現場工作站</p>
          </div>
          {error ? <p className="text-center text-[0.875rem] text-[#d70015]">{error}</p> : null}
          <input
            type="password"
            className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-center text-[1.125rem] tracking-[0.25em]"
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
                  showToast("已進入工作站");
                });
              }
            }}
          />
          <Lose2kgButton
            className="w-full"
            tone="gold"
            loading={pending}
            onClick={() =>
              run(async () => {
                await staffFetch(token, "/login", {
                  method: "POST",
                  body: JSON.stringify({ password }),
                });
                setGate({ ...gate, authenticated: true });
                await loadBootstrap();
                showToast("已進入工作站");
              })
            }
          >
            進入工作站
          </Lose2kgButton>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f7f3ea] text-[#86868b]">
        載入工作站…
      </div>
    );
  }

  const slot = data.currentSlot;
  const navItems: { id: Tab; label: string }[] = [
    { id: "participants", label: "參賽者" },
    { id: "measure", label: "今日量測" },
    { id: "tickets", label: "抽獎券" },
    { id: "draw", label: "抽獎" },
  ];

  return (
    <div className="min-h-dvh bg-[#f7f3ea] text-[#1d1d1f]">
      <Lose2kgToast message={toast} tone={toastTone} />
      <DrawRevealOverlay
        open={drawOpen}
        names={drawNames}
        winnerName={drawWinner}
        onDone={() => setDrawOpen(false)}
      />

      <div className="mx-auto flex min-h-dvh max-w-6xl gap-0 md:gap-6 md:px-6 md:py-6">
        <aside className="hidden w-56 shrink-0 flex-col gap-2 rounded-[1.5rem] border border-[#e8e4dc] bg-[#fffcf7] p-4 md:flex">
          <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-[#c4a35a]">再瘦2公斤</p>
          <h1 className="text-[1.125rem] font-semibold leading-snug">{data.period.name}</h1>
          <p className="text-[0.8125rem] text-[#86868b]">目前：第 {slot} 次量測</p>
          <p className="text-[0.8125rem] text-[#86868b]">
            下一次：{data.nextMeasurementDate ?? "—"}
          </p>
          <nav className="mt-4 flex flex-col gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-xl px-3 py-2.5 text-left text-[0.9375rem] font-medium transition active:scale-[0.98] ${
                  tab === item.id ? "bg-[#1d1d1f] text-white" : "hover:bg-[#f3eee4]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col pb-24 md:pb-0">
          <header className="border-b border-[#e8e4dc] bg-[#fffcf7] px-4 py-4 md:rounded-[1.5rem] md:border">
            <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-[#c4a35a] md:hidden">
              再瘦2公斤
            </p>
            <h1 className="text-[1.25rem] font-semibold md:hidden">{data.period.name}</h1>
            <p className="text-[0.875rem] text-[#86868b]">
              目前第 {slot} 次量測
              {data.nextMeasurementDate ? ` · 下一次 ${data.nextMeasurementDate}` : ""}
            </p>
          </header>

          <div className="flex-1 space-y-4 px-4 py-4">
            {error ? (
              <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">
                {error}
              </p>
            ) : null}

            {tab === "participants" ? (
              <ParticipantsPanel
                participants={activeParticipants}
                measurements={data.measurements}
                onAdd={() => setAddOpen(true)}
                onAddTicket={(p) =>
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
                    await staffFetch(token, "/tickets", {
                      method: "POST",
                      body: JSON.stringify({
                        participantId: p.id,
                        delta,
                        reason,
                      }),
                    });
                    await loadBootstrap();
                    showToast(`🎟 ${delta > 0 ? `+${delta}` : delta} 已新增活動票`);
                  })
                }
                onHistory={(p) =>
                  run(async () => {
                    const body = await staffFetch<{ ok: true; events: Lose2kgTicketEvent[] }>(
                      token,
                      `/tickets?participantId=${encodeURIComponent(p.id)}`,
                    );
                    setHistory(body.events);
                    setHistoryName(p.name);
                  })
                }
              />
            ) : null}

            {tab === "measure" ? (
              <MeasurePanel
                slot={slot}
                participants={activeParticipants}
                measurements={data.measurements}
                feedback={measureFeedback}
                inputRefs={inputRefs}
                pending={pending}
                onSave={(participantId, weightKg, nextId) =>
                  run(async () => {
                    const body = await staffFetch<{
                      ok: true;
                      feedback: { message: string; deltaTickets: number; weightChangePct: number | null };
                    }>(token, "/measure", {
                      method: "POST",
                      body: JSON.stringify({ participantId, slot, weightKg }),
                    });
                    const fb = body.feedback;
                    const pct =
                      fb.weightChangePct != null ? ` ${fb.weightChangePct.toFixed(1)}%` : "";
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
                    await loadBootstrap();
                    if (nextId) {
                      window.setTimeout(() => inputRefs.current[nextId]?.focus(), 50);
                    }
                  })
                }
              />
            ) : null}

            {tab === "tickets" ? (
              <div className="space-y-3">
                <p className="text-[0.875rem] text-[#86868b]">點參賽者查看票券紀錄，或從參賽者頁加票。</p>
                {activeParticipants.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-[#e8e4dc] bg-white px-4 py-3 text-left active:scale-[0.99]"
                    onClick={() =>
                      run(async () => {
                        const body = await staffFetch<{ ok: true; events: Lose2kgTicketEvent[] }>(
                          token,
                          `/tickets?participantId=${encodeURIComponent(p.id)}`,
                        );
                        setHistory(body.events);
                        setHistoryName(p.name);
                      })
                    }
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="text-[#c4a35a]">🎟 {p.totalTicketBalance}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {tab === "draw" ? (
              <DrawPanel
                prizes={data.prizes}
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
                    const eligible = activeParticipants.filter((p) => p.totalTicketBalance > 0);
                    const total = eligible.reduce((s, p) => s + p.totalTicketBalance, 0);
                    const ok = window.confirm(
                      `確認抽獎？\n獎項：${prize.name}\n有效參賽者：${eligible.length} 人\n有效抽獎券：${total} 張`,
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
                    window.setTimeout(() => setDrawOpen(true), 200);
                    await loadBootstrap();
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
                    window.setTimeout(() => setDrawOpen(true), 200);
                    await loadBootstrap();
                  })
                }
              />
            ) : null}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8e4dc] bg-[#fffcf7]/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-xl py-2 text-[0.75rem] font-semibold active:scale-[0.97] ${
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
          <div className="w-full max-w-md space-y-3 rounded-[1.5rem] bg-white p-5">
            <h2 className="text-[1.125rem] font-semibold">＋ 新增參賽者</h2>
            <input
              className="w-full rounded-xl border border-[#ddd6c8] px-3 py-2.5"
              placeholder="姓名"
              value={addName}
              onChange={(e) => {
                setAddName(e.target.value);
                if (!addAdvanced) setAddPublic(e.target.value);
              }}
            />
            <button
              type="button"
              className="text-[0.8125rem] text-[#86868b]"
              onClick={() => setAddAdvanced((v) => !v)}
            >
              {addAdvanced ? "收合進階" : "進階"}
            </button>
            {addAdvanced ? (
              <>
                <input
                  className="w-full rounded-xl border border-[#ddd6c8] px-3 py-2.5"
                  placeholder="公開顯示名稱"
                  value={addPublic}
                  onChange={(e) => setAddPublic(e.target.value)}
                />
                <input
                  className="w-full rounded-xl border border-[#ddd6c8] px-3 py-2.5"
                  placeholder="備註"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                />
              </>
            ) : null}
            <div className="flex gap-2">
              <Lose2kgButton tone="secondary" className="flex-1" onClick={() => setAddOpen(false)}>
                取消
              </Lose2kgButton>
              <Lose2kgButton
                className="flex-1"
                loading={pending}
                onClick={() =>
                  run(async () => {
                    if (!addName.trim()) throw new Error("請填寫姓名");
                    await staffFetch(token, "/participants", {
                      method: "POST",
                      body: JSON.stringify({
                        name: addName.trim(),
                        publicDisplayName: addPublic.trim() || addName.trim(),
                        note: addNote.trim() || undefined,
                      }),
                    });
                    setAddOpen(false);
                    setAddName("");
                    setAddPublic("");
                    setAddNote("");
                    await loadBootstrap();
                    showToast(`已新增 ${addName.trim()}`);
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
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[1.5rem] bg-white p-5">
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
                  <div key={e.id} className="rounded-xl border border-[#f0ebe1] px-3 py-2">
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

function ParticipantsPanel({
  participants,
  measurements,
  onAdd,
  onAddTicket,
  onHistory,
}: {
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  onAdd: () => void;
  onAddTicket: (p: Lose2kgParticipant) => void;
  onHistory: (p: Lose2kgParticipant) => void;
}) {
  return (
    <div className="space-y-3">
      <Lose2kgButton onClick={onAdd}>＋ 新增參賽者</Lose2kgButton>
      <div className="hidden overflow-x-auto rounded-2xl border border-[#e8e4dc] bg-white md:block">
        <table className="min-w-full text-left text-[0.8125rem]">
          <thead className="bg-[#f7f3ea] text-[#86868b]">
            <tr>
              <th className="px-3 py-2">姓名</th>
              <th className="px-3 py-2">目前體重</th>
              <th className="px-3 py-2">變化 %</th>
              <th className="px-3 py-2">體重票</th>
              <th className="px-3 py-2">活動票</th>
              <th className="px-3 py-2">總票</th>
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const current =
                weightOf(measurements, p.id, 4) ??
                weightOf(measurements, p.id, 3) ??
                weightOf(measurements, p.id, 2) ??
                weightOf(measurements, p.id, 1);
              return (
                <tr key={p.id} className="border-t border-[#f3efe6]">
                  <td className="px-3 py-2 font-semibold">{p.name}</td>
                  <td className="px-3 py-2">{current ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.currentWeightChangePct != null
                      ? `${p.currentWeightChangePct.toFixed(1)}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2">{p.weightTicketBalance}</td>
                  <td className="px-3 py-2">{p.activityTicketBalance}</td>
                  <td className="px-3 py-2 font-semibold text-[#c4a35a]">{p.totalTicketBalance}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="mr-2 text-[#248a3d]" onClick={() => onAddTicket(p)}>
                      ＋ 加票
                    </button>
                    <button type="button" className="text-[#86868b]" onClick={() => onHistory(p)}>
                      紀錄
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 md:hidden">
        {participants.map((p) => (
          <div key={p.id} className="rounded-2xl border border-[#e8e4dc] bg-white px-3 py-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{p.name}</p>
              <p className="text-[#c4a35a]">🎟 {p.totalTicketBalance}</p>
            </div>
            <p className="text-[0.75rem] text-[#86868b]">
              體重票 {p.weightTicketBalance} · 活動票 {p.activityTicketBalance}
              {p.currentWeightChangePct != null
                ? ` · ${p.currentWeightChangePct.toFixed(1)}%`
                : ""}
            </p>
            <div className="mt-2 flex gap-3 text-[0.8125rem]">
              <button type="button" className="text-[#248a3d]" onClick={() => onAddTicket(p)}>
                ＋ 加票
              </button>
              <button type="button" className="text-[#86868b]" onClick={() => onHistory(p)}>
                紀錄
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeasurePanel({
  slot,
  participants,
  measurements,
  feedback,
  inputRefs,
  pending,
  onSave,
}: {
  slot: number;
  participants: Lose2kgParticipant[];
  measurements: Lose2kgMeasurement[];
  feedback: Record<string, string>;
  inputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  pending: boolean;
  onSave: (participantId: string, weightKg: number, nextId?: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-[1.125rem] font-semibold">第 {slot} 次量測</h2>
      {participants.map((p, index) => {
        const prev = lastWeight(measurements, p.id, slot);
        const next = participants[index + 1]?.id;
        return (
          <div
            key={p.id}
            className="flex flex-col gap-2 rounded-2xl border border-[#e8e4dc] bg-white px-3 py-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.name}</p>
              <p className="text-[0.75rem] text-[#86868b]">
                上次 {prev != null ? `${prev} kg` : "—"}
              </p>
              {feedback[p.id] ? (
                <p className="text-[0.8125rem] font-medium text-[#248a3d]">{feedback[p.id]}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={(el) => {
                  inputRefs.current[p.id] = el;
                }}
                type="number"
                inputMode="decimal"
                step="0.1"
                className="w-24 rounded-xl border border-[#ddd6c8] px-2 py-2 text-[1rem]"
                placeholder="kg"
                defaultValue={weightOf(measurements, p.id, slot) ?? ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const value = Number((e.target as HTMLInputElement).value);
                    if (value > 0) onSave(p.id, value, next);
                  }
                }}
              />
              <Lose2kgButton
                tone="secondary"
                loading={pending}
                onClick={() => {
                  const el = inputRefs.current[p.id];
                  const value = Number(el?.value);
                  if (!(value > 0)) return;
                  onSave(p.id, value, next);
                }}
              >
                儲存
              </Lose2kgButton>
            </div>
          </div>
        );
      })}
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
        <div key={prize.id} className="space-y-3 rounded-[1.5rem] border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1.125rem] font-semibold">{prize.name}</h2>
          <p className="text-[0.875rem] text-[#86868b]">
            目前有效參賽者 {eligible.length} 人 · 有效抽獎券 {totalTickets} 張
          </p>
          <Lose2kgButton
            tone="gold"
            loading={pending}
            disabled={prize.status === "drawn"}
            onClick={() => onFormal(prize)}
          >
            開始抽獎
          </Lose2kgButton>
        </div>
      ))}

      <div className="space-y-3 rounded-[1.5rem] border border-[#e8e4dc] bg-[#fffcf7] p-4">
        <h2 className="text-[1.125rem] font-semibold">臨時抽獎</h2>
        <p className="text-[0.875rem] text-[#86868b]">每人機率相等，不看票數。</p>
        {!tempMode ? (
          <Lose2kgButton tone="secondary" onClick={() => setTempMode(true)}>
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
                className="min-w-[8rem] flex-1 rounded-xl border border-[#ddd6c8] px-3 py-2 text-[0.875rem]"
                placeholder="搜尋"
                value={tempQuery}
                onChange={(e) => setTempQuery(e.target.value)}
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-[#eee8dc] bg-white">
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
            <p className="text-[0.875rem] text-[#86868b]">本次抽獎：{tempSelected.size} 人</p>
            <Lose2kgButton tone="gold" loading={pending} onClick={onTempDraw}>
              開始抽獎
            </Lose2kgButton>
          </>
        )}
      </div>
    </div>
  );
}
