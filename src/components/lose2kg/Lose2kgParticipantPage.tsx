"use client";

import { PageShell } from "@/components/ui/PageShell";
import { BrandCard, PrimaryButton } from "@/components/ui/brand-ui";
import {
  adjustLose2kgActivityTickets,
  fetchLose2kgParticipantDetail,
  patchLose2kgParticipant,
  removeLose2kgParticipant,
  upsertLose2kgMeasurement,
} from "@/lib/lose2kg/client";
import type {
  Lose2kgMeasurement,
  Lose2kgMeasurementSlot,
  Lose2kgParticipant,
  Lose2kgTicketEvent,
  Lose2kgWeightMilestone,
} from "@/types/lose2kg";
import { useParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function Lose2kgParticipantPage() {
  const params = useParams<{ periodId: string; participantId: string }>();
  const [participant, setParticipant] = useState<Lose2kgParticipant | null>(null);
  const [measurements, setMeasurements] = useState<Lose2kgMeasurement[]>([]);
  const [milestones, setMilestones] = useState<Lose2kgWeightMilestone[]>([]);
  const [events, setEvents] = useState<Lose2kgTicketEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reload() {
    const data = await fetchLose2kgParticipantDetail(params.participantId);
    setParticipant(data.participant);
    setMeasurements(data.measurements);
    setMilestones(data.milestones);
    setEvents(data.events);
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
  }, [params.participantId]);

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

  if (!participant) {
    return (
      <PageShell
        title="參賽者"
        backHref={`/admin/lose2kg/${params.periodId}`}
        backLabel="返回期數"
      >
        {error ? <p className="text-[#d70015]">{error}</p> : <p className="text-[#86868b]">載入中…</p>}
      </PageShell>
    );
  }

  const baseline = measurements.find((m) => m.slot === 1)?.weightKg ?? null;

  return (
    <PageShell
      title={participant.name}
      subtitle={`公開：${participant.publicDisplayName}`}
      backHref={`/admin/lose2kg/${params.periodId}`}
      backLabel="返回期數"
    >
      {error ? <p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-[0.875rem] text-[#d70015]">{error}</p> : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-[#d2d2d7] bg-white px-3 py-3 text-center">
          <p className="text-[0.7rem] text-[#86868b]">體重票</p>
          <p className="text-[1.5rem] font-semibold">{participant.weightTicketBalance}</p>
        </div>
        <div className="rounded-2xl border border-[#d2d2d7] bg-white px-3 py-3 text-center">
          <p className="text-[0.7rem] text-[#86868b]">活動票</p>
          <p className="text-[1.5rem] font-semibold">{participant.activityTicketBalance}</p>
        </div>
        <div className="rounded-2xl border border-[#d2d2d7] bg-white px-3 py-3 text-center">
          <p className="text-[0.7rem] text-[#86868b]">總票</p>
          <p className="text-[1.5rem] font-semibold text-[#248a3d]">{participant.totalTicketBalance}</p>
        </div>
      </div>

      <BrandCard variant="bordered" className="space-y-2">
        <p className="text-[0.875rem] text-[#86868b]">
          原始體重：{baseline != null ? `${baseline} kg` : "尚未輸入"}
        </p>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const name = window.prompt("修改姓名", participant.name);
                if (!name?.trim()) return;
                await patchLose2kgParticipant(participant.id, { name: name.trim() });
                await reload();
              })
            }
          >
            編輯姓名
          </PrimaryButton>
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const name = window.prompt("公開顯示名稱", participant.publicDisplayName);
                if (!name?.trim()) return;
                await patchLose2kgParticipant(participant.id, {
                  publicDisplayName: name.trim(),
                });
                await reload();
              })
            }
          >
            編輯公開名稱
          </PrimaryButton>
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const ok = window.confirm("確定移除（標記為 withdrawn）？");
                if (!ok) return;
                await removeLose2kgParticipant(participant.id);
                window.location.href = `/admin/lose2kg/${params.periodId}`;
              })
            }
          >
            移除參賽者
          </PrimaryButton>
        </div>
      </BrandCard>

      <section className="space-y-2">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          四次量測
        </h2>
        <div className="space-y-2">
          {([1, 2, 3, 4] as Lose2kgMeasurementSlot[]).map((slot) => {
            const m = measurements.find((row) => row.slot === slot);
            return (
              <div
                key={slot}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#d2d2d7] bg-white px-3 py-3"
              >
                <div>
                  <p className="font-semibold text-[#1d1d1f]">
                    第 {slot} 次{slot === 1 ? "（基準）" : ""}
                  </p>
                  <p className="text-[0.75rem] text-[#86868b]">
                    {m?.weightKg != null ? `${m.weightKg} kg` : "未輸入"}
                    {m?.weightChangePct != null ? ` · ${m.weightChangePct.toFixed(2)}%` : ""}
                  </p>
                </div>
                <PrimaryButton
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const raw = window.prompt(
                        `輸入第 ${slot} 次體重（kg）`,
                        m?.weightKg != null ? String(m.weightKg) : "",
                      );
                      if (raw == null) return;
                      const trimmed = raw.trim();
                      const weightKg = trimmed === "" ? null : Number(trimmed);
                      if (trimmed !== "" && (!Number.isFinite(weightKg) || (weightKg as number) <= 0)) {
                        throw new Error("體重無效");
                      }
                      let reason: string | undefined;
                      if (m?.weightKg != null && weightKg !== m.weightKg) {
                        reason = window.prompt("修改原因（可空白）") ?? undefined;
                      }
                      await upsertLose2kgMeasurement(participant.id, {
                        slot,
                        weightKg,
                        reason,
                      });
                      await reload();
                    })
                  }
                >
                  輸入 / 修改
                </PrimaryButton>
              </div>
            );
          })}
        </div>
      </section>

      <BrandCard variant="bordered" className="space-y-2">
        <h2 className="text-[1rem] font-semibold">手動活動票</h2>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((n) => (
            <PrimaryButton
              key={n}
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const reason = window.prompt("加票原因");
                  if (!reason?.trim()) return;
                  const eventDate = window.prompt("日期（YYYY-MM-DD，可空白）") ?? undefined;
                  await adjustLose2kgActivityTickets(participant.id, {
                    delta: n,
                    reason: reason.trim(),
                    eventDate: eventDate?.trim() || undefined,
                  });
                  await reload();
                })
              }
            >
              +{n}
            </PrimaryButton>
          ))}
          <PrimaryButton
            disabled={pending}
            onClick={() =>
              run(async () => {
                const raw = window.prompt("自訂張數（正數加票、負數扣票）");
                if (!raw?.trim()) return;
                const delta = Number(raw);
                if (!Number.isInteger(delta) || delta === 0) throw new Error("張數無效");
                const reason = window.prompt("原因");
                if (!reason?.trim()) return;
                await adjustLose2kgActivityTickets(participant.id, {
                  delta,
                  reason: reason.trim(),
                });
                await reload();
              })
            }
          >
            自訂
          </PrimaryButton>
        </div>
      </BrandCard>

      <section className="space-y-2">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          Milestone timeline
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[#d2d2d7] bg-white">
          {milestones.length === 0 ? (
            <p className="px-3 py-3 text-[0.875rem] text-[#86868b]">尚無 milestone</p>
          ) : (
            milestones.map((m) => (
              <div
                key={`${m.milestonePercent}-${m.awardedAt}`}
                className="flex justify-between border-b border-[#f2f2f2] px-3 py-2 text-[0.875rem] last:border-b-0"
              >
                <span>-{m.milestonePercent}%</span>
                <span className={m.ticketState === "active" ? "text-[#248a3d]" : "text-[#86868b]"}>
                  {m.ticketState}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          Ticket history
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[#d2d2d7] bg-white">
          {events.length === 0 ? (
            <p className="px-3 py-3 text-[0.875rem] text-[#86868b]">尚無紀錄</p>
          ) : (
            events.map((e) => (
              <div key={e.id} className="border-b border-[#f2f2f2] px-3 py-2 last:border-b-0">
                <p className="text-[0.875rem] font-medium">
                  {e.eventType} · {e.delta > 0 ? `+${e.delta}` : e.delta}
                </p>
                <p className="text-[0.7rem] text-[#86868b]">
                  {e.reason ?? "—"} · {e.createdAt}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </PageShell>
  );
}
