"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMemoReminderLabel } from "@/lib/memos/format";
import { createMemo, fetchHomeMemos, updateMemo } from "@/lib/memos/client";
import type { Memo, MemoUpsertInput } from "@/lib/memos/types";
import { MemoFormModal } from "@/components/memos/MemoFormModal";

type LoadState = "loading" | "ready" | "error";

/**
 * Compact home memos block. Failures stay local — never throw into HomePage.
 */
export function HomeMemosCard() {
  const [state, setState] = useState<LoadState>("loading");
  const [memos, setMemos] = useState<Memo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = await fetchHomeMemos();
      setMemos(result.memos);
      setHasMore(result.hasMore);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void reload();
    });
  }, [reload]);

  const onToggleComplete = async (memo: Memo) => {
    const previous = memos;
    setMemos((list) => list.filter((item) => item.id !== memo.id));
    try {
      await updateMemo(memo.id, { completed: true });
      await reload();
    } catch {
      setMemos(previous);
    }
  };

  const onCreate = async (input: MemoUpsertInput) => {
    setSaving(true);
    try {
      await createMemo(input);
      setFormOpen(false);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-4 shadow-[0_1px_2px_rgba(29,29,31,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
            備忘錄
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-9 items-center rounded-xl px-2.5 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
              onClick={() => setFormOpen(true)}
            >
              ＋ 新增
            </button>
            <Link
              href="/memos"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-xl text-[0.9375rem] text-[var(--brand-hint)]"
              aria-label="查看全部備忘錄"
            >
              ›
            </Link>
          </div>
        </div>

        {state === "loading" ? (
          <div className="mt-3 space-y-2">
            <div className="h-10 animate-pulse rounded-xl bg-[var(--brand-border)]/50" />
            <div className="h-10 animate-pulse rounded-xl bg-[var(--brand-border)]/40" />
          </div>
        ) : null}

        {state === "error" ? (
          <p className="mt-3 text-[0.8125rem] text-[var(--brand-text-muted)]">暫時無法載入備忘錄</p>
        ) : null}

        {state === "ready" && memos.length === 0 ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[0.875rem] text-[var(--brand-text-muted)]">目前沒有備忘錄</p>
            <button
              type="button"
              className="inline-flex min-h-9 shrink-0 items-center rounded-xl px-2 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
              onClick={() => setFormOpen(true)}
            >
              ＋ 新增備忘錄
            </button>
          </div>
        ) : null}

        {state === "ready" && memos.length > 0 ? (
          <ul className="mt-2 divide-y divide-[var(--brand-border)]/60">
            {memos.map((memo) => {
              const reminder = formatMemoReminderLabel(memo);
              return (
                <li key={memo.id} className="flex items-start gap-3 py-2.5 first:pt-1 last:pb-0">
                  <button
                    type="button"
                    aria-label={`完成「${memo.title}」`}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.35rem] border border-[var(--brand-border)] bg-white text-[0.75rem] text-[var(--brand-primary-dark)]"
                    onClick={() => void onToggleComplete(memo)}
                  />
                  <Link href={`/memos?id=${encodeURIComponent(memo.id)}`} className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-semibold text-[var(--brand-text)]">
                      {memo.title}
                    </span>
                    {reminder ? (
                      <span className="mt-0.5 block text-[0.75rem] text-[var(--brand-text-muted)]">
                        {reminder}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}

        {state === "ready" && hasMore ? (
          <div className="mt-2 border-t border-[var(--brand-border)]/60 pt-2">
            <Link
              href="/memos"
              className="inline-flex min-h-9 items-center text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]"
            >
              查看全部
            </Link>
          </div>
        ) : null}
      </section>

      <MemoFormModal
        open={formOpen}
        saving={saving}
        title="新增備忘錄"
        onClose={() => setFormOpen(false)}
        onSubmit={onCreate}
      />
    </>
  );
}
