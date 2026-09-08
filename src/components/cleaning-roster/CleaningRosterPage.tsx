"use client";

import { PageShell } from "@/components/ui/PageShell";
import { PrimaryButton } from "@/components/ui/brand-ui";
import {
  confirmCleaningPreview,
  createCleaningArea,
  createCleaningMember,
  deleteCleaningArea,
  deleteCleaningMember,
  drawCleaningPreview,
  fetchCleaningRosterBootstrap,
  resetCleaningFairness,
  updateCleaningArea,
  updateCleaningMember,
} from "@/lib/cleaning-roster/client";
import type {
  CleaningRosterArea,
  CleaningRosterBootstrap,
  CleaningRosterHistoryRound,
  CleaningRosterMember,
  CleaningRosterPreview,
} from "@/types/cleaning-roster";
import { useEffect, useState, useTransition } from "react";

function formatWeight(value: number): string {
  return Number.isInteger(value) ? value.toFixed(1) : value.toFixed(1);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function promptName(title: string, initial = ""): string | null {
  const value = window.prompt(title, initial);
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function CleaningRosterPage() {
  const [data, setData] = useState<CleaningRosterBootstrap | null>(null);
  const [preview, setPreview] = useState<CleaningRosterPreview | null>(null);
  const [revealTick, setRevealTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmedKey, setConfirmedKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bootstrap = await fetchCleaningRosterBootstrap();
        if (!cancelled) {
          setData(bootstrap);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "載入失敗");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!preview) return;
    const total = preview.assignments.length + (preview.resting.length > 0 ? 1 : 0);
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setRevealTick(step);
      if (step >= total) window.clearInterval(timer);
    }, 90);
    return () => window.clearInterval(timer);
  }, [preview]);

  function applyBootstrap(next: CleaningRosterBootstrap) {
    setData(next);
  }

  function run(action: () => Promise<void>) {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          await action();
        } catch (err) {
          setError(err instanceof Error ? err.message : "操作失敗");
        }
      })();
    });
  }

  async function handleDraw() {
    const next = await drawCleaningPreview();
    setRevealTick(0);
    setPreview(next);
    setConfirmedKey(null);
  }

  async function handleConfirm() {
    if (!preview || confirming || confirmedKey === preview.idempotencyKey) return;
    setConfirming(true);
    try {
      const result = await confirmCleaningPreview(preview);
      applyBootstrap(result.data);
      setConfirmedKey(preview.idempotencyKey);
      setPreview(null);
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <PageShell title="打掃輪值表" subtitle="公平加權抽籤" backHref="/admin" backLabel="返回管理中心">
        <p className="text-[0.9375rem] text-[var(--brand-text-muted)]">載入中…</p>
      </PageShell>
    );
  }

  const areas = data?.areas ?? [];
  const members = data?.members ?? [];
  const history = data?.history ?? [];
  const canDraw = areas.length > 0 && members.length > 0;
  const busy = pending || confirming;

  return (
    <PageShell title="打掃輪值表" subtitle="公平加權抽籤" backHref="/admin" backLabel="返回管理中心">
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.875rem] text-red-700">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-muted)]">
            區域
          </h2>
          <button
            type="button"
            disabled={busy}
            className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)] disabled:opacity-50"
            onClick={() =>
              run(async () => {
                const name = promptName("新增打掃區域名稱");
                if (!name) return;
                const area = await createCleaningArea(name);
                setData((prev) =>
                  prev ? { ...prev, areas: [...prev.areas, area] } : prev,
                );
                setPreview(null);
              })
            }
          >
            ＋新增區域
          </button>
        </div>
        {areas.length === 0 ? (
          <p className="text-[0.9375rem] text-[var(--brand-text-muted)]">先新增至少一個打掃區域</p>
        ) : (
          <ul className="divide-y divide-[var(--brand-border)]/70">
            {areas.map((area) => (
              <AreaRow
                key={area.id}
                area={area}
                disabled={busy}
                onEdit={() =>
                  run(async () => {
                    const name = promptName("修改區域名稱", area.name);
                    if (!name || name === area.name) return;
                    const updated = await updateCleaningArea(area.id, name);
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            areas: prev.areas.map((item) =>
                              item.id === updated.id ? updated : item,
                            ),
                          }
                        : prev,
                    );
                    setPreview(null);
                  })
                }
                onDelete={() =>
                  run(async () => {
                    if (!window.confirm(`刪除區域「${area.name}」？`)) return;
                    await deleteCleaningArea(area.id);
                    setData((prev) =>
                      prev
                        ? { ...prev, areas: prev.areas.filter((item) => item.id !== area.id) }
                        : prev,
                    );
                    setPreview(null);
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-muted)]">
            人員
          </h2>
          <button
            type="button"
            disabled={busy}
            className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)] disabled:opacity-50"
            onClick={() =>
              run(async () => {
                const name = promptName("新增參與人員姓名");
                if (!name) return;
                const member = await createCleaningMember(name);
                setData((prev) =>
                  prev ? { ...prev, members: [...prev.members, member] } : prev,
                );
                setPreview(null);
              })
            }
          >
            ＋新增人員
          </button>
        </div>
        {members.length === 0 ? (
          <p className="text-[0.9375rem] text-[var(--brand-text-muted)]">先新增至少一位參與人員</p>
        ) : (
          <ul className="divide-y divide-[var(--brand-border)]/70">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                disabled={busy}
                onEdit={() =>
                  run(async () => {
                    const name = promptName("修改姓名", member.name);
                    if (!name || name === member.name) return;
                    const updated = await updateCleaningMember(member.id, name);
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            members: prev.members.map((item) =>
                              item.id === updated.id ? updated : item,
                            ),
                          }
                        : prev,
                    );
                    setPreview(null);
                  })
                }
                onDelete={() =>
                  run(async () => {
                    if (!window.confirm(`刪除人員「${member.name}」？`)) return;
                    await deleteCleaningMember(member.id);
                    setData((prev) =>
                      prev
                        ? {
                            ...prev,
                            members: prev.members.filter((item) => item.id !== member.id),
                          }
                        : prev,
                    );
                    setPreview(null);
                  })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 pt-1">
        <PrimaryButton
          className="w-full text-[1.0625rem]"
          disabled={!canDraw || busy}
          onClick={() => run(handleDraw)}
        >
          🎲 一鍵抽籤
        </PrimaryButton>
        {!canDraw ? (
          <p className="text-center text-[0.8125rem] text-[var(--brand-text-muted)]">
            {areas.length === 0
              ? "先新增至少一個打掃區域"
              : "先新增至少一位參與人員"}
          </p>
        ) : null}
      </section>

      {preview ? (
        <PreviewPanel
          preview={preview}
          revealTick={revealTick}
          confirming={confirming}
          disabled={busy}
          onRedraw={() => run(handleDraw)}
          onConfirm={() => run(handleConfirm)}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-muted)]">
          最近紀錄
        </h2>
        {history.length === 0 ? (
          <p className="text-[0.9375rem] text-[var(--brand-text-muted)]">尚無正式抽籤紀錄</p>
        ) : (
          <ul className="space-y-5">
            {history.map((round) => (
              <HistoryRound key={round.id} round={round} />
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-[var(--brand-border)]/70 pt-5">
        <button
          type="button"
          disabled={busy || members.length === 0}
          className="text-[0.875rem] font-medium text-[#86868b] underline-offset-2 hover:underline disabled:opacity-50"
          onClick={() =>
            run(async () => {
              if (
                !window.confirm(
                  "重置所有人員的公平紀錄？\n權重、累積次數、連續休息都會歸零。\n區域／人員名單與歷史紀錄會保留。",
                )
              ) {
                return;
              }
              if (!window.confirm("再次確認：真的要重置公平紀錄？")) return;
              const next = await resetCleaningFairness();
              applyBootstrap(next);
              setPreview(null);
              setConfirmedKey(null);
            })
          }
        >
          重置公平紀錄
        </button>
        {data?.fairnessResetAt ? (
          <p className="mt-2 text-[0.75rem] text-[var(--brand-text-muted)]">
            上次重置：{formatDateTime(data.fairnessResetAt)}
          </p>
        ) : null}
      </section>
    </PageShell>
  );
}

function AreaRow({
  area,
  disabled,
  onEdit,
  onDelete,
}: {
  area: CleaningRosterArea;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <span className="min-w-0 truncate text-[1.0625rem] font-medium text-[var(--brand-text)]">
        {area.name}
      </span>
      <div className="flex shrink-0 gap-3 text-[0.8125rem]">
        <button
          type="button"
          disabled={disabled}
          className="font-medium text-[var(--brand-primary-dark)] disabled:opacity-50"
          onClick={onEdit}
        >
          編輯
        </button>
        <button
          type="button"
          disabled={disabled}
          className="font-medium text-[#86868b] disabled:opacity-50"
          onClick={onDelete}
        >
          刪除
        </button>
      </div>
    </li>
  );
}

function MemberRow({
  member,
  disabled,
  onEdit,
  onDelete,
}: {
  member: CleaningRosterMember;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-[1.0625rem] font-medium text-[var(--brand-text)]">
          {member.name}
        </p>
        <p className="mt-0.5 text-[0.8125rem] text-[var(--brand-text-muted)]">
          累積 {member.totalAssignments}　權重 {formatWeight(member.currentWeight)}
        </p>
      </div>
      <div className="flex shrink-0 gap-3 text-[0.8125rem]">
        <button
          type="button"
          disabled={disabled}
          className="font-medium text-[var(--brand-primary-dark)] disabled:opacity-50"
          onClick={onEdit}
        >
          編輯
        </button>
        <button
          type="button"
          disabled={disabled}
          className="font-medium text-[#86868b] disabled:opacity-50"
          onClick={onDelete}
        >
          刪除
        </button>
      </div>
    </li>
  );
}

function PreviewPanel({
  preview,
  revealTick,
  confirming,
  disabled,
  onRedraw,
  onConfirm,
}: {
  preview: CleaningRosterPreview;
  revealTick: number;
  confirming: boolean;
  disabled: boolean;
  onRedraw: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="space-y-4 rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)]/80 px-4 py-5 sm:px-5">
      <div>
        <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-muted)]">
          本輪預覽
        </p>
        <p className="mt-1 text-[0.8125rem] text-[var(--brand-text-muted)]">
          尚未寫入正式紀錄，可安心重抽
        </p>
      </div>

      <ul className="space-y-2.5">
        {preview.assignments.map((assignment, index) => (
          <li
            key={`${assignment.areaId}-${assignment.memberId}-${index}`}
            className={`flex items-baseline justify-between gap-3 transition-all duration-300 ${
              revealTick > index ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            <span className="text-[0.9375rem] text-[var(--brand-text-muted)]">{assignment.areaName}</span>
            <span className="text-[1.0625rem] font-semibold text-[var(--brand-text)]">
              {assignment.memberName}
            </span>
          </li>
        ))}
      </ul>

      {preview.resting.length > 0 ? (
        <p
          className={`text-[0.9375rem] text-[var(--brand-text-muted)] transition-opacity duration-300 ${
            revealTick > preview.assignments.length ? "opacity-100" : "opacity-0"
          }`}
        >
          本輪休息：{preview.resting.map((item) => item.memberName).join("、")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          disabled={disabled}
          onClick={onRedraw}
          className="flex-1 rounded-2xl border border-[var(--brand-border)] bg-white px-4 py-3.5 text-[0.9375rem] font-semibold text-[var(--brand-text)] transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          重新抽籤
        </button>
        <PrimaryButton
          className="flex-1"
          disabled={disabled || confirming}
          onClick={onConfirm}
        >
          {confirming ? "確認中…" : "✅ 確認本輪"}
        </PrimaryButton>
      </div>
    </section>
  );
}

function HistoryRound({ round }: { round: CleaningRosterHistoryRound }) {
  return (
    <li className="space-y-2">
      <p className="text-[0.875rem] font-semibold text-[var(--brand-text)]">
        {formatDateTime(round.confirmedAt)}
      </p>
      <ul className="space-y-1">
        {round.assignments.map((item, index) => (
          <li
            key={`${round.id}-a-${index}`}
            className="flex justify-between gap-3 text-[0.9375rem]"
          >
            <span className="text-[var(--brand-text-muted)]">{item.areaName}</span>
            <span className="font-medium text-[var(--brand-text)]">{item.memberName}</span>
          </li>
        ))}
      </ul>
      {round.resting.length > 0 ? (
        <p className="text-[0.875rem] text-[var(--brand-text-muted)]">
          休息：{round.resting.map((item) => item.memberName).join("、")}
        </p>
      ) : null}
    </li>
  );
}
