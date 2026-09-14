"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { MemoFormModal } from "@/components/memos/MemoFormModal";
import { formatMemoReminderLabel } from "@/lib/memos/format";
import {
  createMemo,
  deleteMemo,
  fetchAllMemos,
  updateMemo,
} from "@/lib/memos/client";
import type { Memo, MemoUpsertInput } from "@/lib/memos/types";

export default function MemosPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("id");

  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Memo | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAllMemos();
      setMemos(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`memo-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, loading, memos]);

  const incomplete = useMemo(() => memos.filter((memo) => !memo.completed), [memos]);
  const completed = useMemo(() => memos.filter((memo) => memo.completed), [memos]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (memo: Memo) => {
    setEditing(memo);
    setFormOpen(true);
  };

  const onSubmit = async (input: MemoUpsertInput) => {
    setSaving(true);
    try {
      if (editing) {
        await updateMemo(editing.id, input);
      } else {
        await createMemo(input);
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (memo: Memo) => {
    const nextCompleted = !memo.completed;
    setMemos((list) =>
      list.map((item) => (item.id === memo.id ? { ...item, completed: nextCompleted } : item)),
    );
    try {
      await updateMemo(memo.id, { completed: nextCompleted });
      await load();
    } catch {
      await load();
    }
  };

  const onDelete = async (memo: Memo) => {
    if (!window.confirm(`刪除「${memo.title}」？`)) return;
    try {
      await deleteMemo(memo.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    }
  };

  const renderRow = (memo: Memo) => {
    const reminder = formatMemoReminderLabel(memo);
    const focused = focusId === memo.id;
    return (
      <li
        key={memo.id}
        id={`memo-${memo.id}`}
        className={`px-4 py-3 ${focused ? "bg-[var(--brand-primary-muted)]/50" : ""}`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-label={memo.completed ? `取消完成「${memo.title}」` : `完成「${memo.title}」`}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.35rem] border text-[0.75rem] ${
              memo.completed
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                : "border-[var(--brand-border)] bg-white text-[var(--brand-primary-dark)]"
            }`}
            onClick={() => void onToggle(memo)}
          >
            {memo.completed ? "✓" : null}
          </button>
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEdit(memo)}>
            <span
              className={`block text-[0.9375rem] font-semibold ${
                memo.completed
                  ? "text-[var(--brand-text-muted)] line-through"
                  : "text-[var(--brand-text)]"
              }`}
            >
              {memo.title}
            </span>
            {memo.content ? (
              <span className="mt-0.5 block truncate text-[0.8125rem] text-[var(--brand-text-muted)]">
                {memo.content}
              </span>
            ) : null}
            {reminder ? (
              <span className="mt-0.5 block text-[0.75rem] text-[var(--brand-text-muted)]">
                {reminder}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="shrink-0 px-1 py-0.5 text-[0.75rem] font-medium text-[#b42318]"
            onClick={() => void onDelete(memo)}
          >
            刪除
          </button>
        </div>
      </li>
    );
  };

  return (
    <PageShell
      backHref="/"
      backLabel="返回首頁"
      title="備忘錄"
      subtitle="記下要做的事，到時提醒你"
      variant="plain"
      headerExtra={
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--brand-primary)] px-4 text-[0.875rem] font-semibold text-white"
          onClick={openCreate}
        >
          新增
        </button>
      }
    >
      {loading ? (
        <div className="space-y-2 pt-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-[var(--brand-border)]/60" />
          ))}
        </div>
      ) : null}

      {error ? <p className="pt-4 text-center text-[0.875rem] text-[#b42318]">{error}</p> : null}

      {!loading && !error && memos.length === 0 ? (
        <div className="pt-10 text-center">
          <p className="text-[0.875rem] text-[var(--brand-text-muted)]">目前沒有備忘錄</p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-11 items-center rounded-2xl bg-[var(--brand-primary)] px-4 text-[0.875rem] font-semibold text-white"
            onClick={openCreate}
          >
            ＋ 新增備忘錄
          </button>
        </div>
      ) : null}

      {!loading && incomplete.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-0.5 text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
            未完成
          </h2>
          <ul className="divide-y divide-[var(--brand-border)]/70 overflow-hidden rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)]">
            {incomplete.map(renderRow)}
          </ul>
        </section>
      ) : null}

      {!loading && completed.length > 0 ? (
        <section className="space-y-2">
          <button
            type="button"
            className="flex min-h-10 w-full items-center justify-between px-0.5 text-left text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]"
            onClick={() => setShowCompleted((value) => !value)}
          >
            <span>已完成（{completed.length}）</span>
            <span aria-hidden>{showCompleted ? "▴" : "▾"}</span>
          </button>
          {showCompleted ? (
            <ul className="divide-y divide-[var(--brand-border)]/70 overflow-hidden rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)]">
              {completed.map(renderRow)}
            </ul>
          ) : null}
        </section>
      ) : null}

      <MemoFormModal
        open={formOpen}
        title={editing ? "編輯備忘錄" : "新增備忘錄"}
        initial={editing}
        saving={saving}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={onSubmit}
      />
    </PageShell>
  );
}
