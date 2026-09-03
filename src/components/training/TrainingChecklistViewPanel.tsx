"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { PageShell } from "@/components/ui/PageShell";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import { formatTrainingSignedDate } from "@/lib/training/training-checklist-helpers";
import type { TrainingChecklistView } from "@/types/training-checklist";

function LearningHint({
  links,
}: {
  links: TrainingChecklistView["incomplete"][number]["learningLinks"];
}) {
  if (links.length === 0) return null;
  const primary = links[0];
  if (!primary.learningResourceYoutubeUrl) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-[var(--brand-text-muted)]">
      <span>有相關學習內容</span>
      <a
        className="font-medium text-[var(--brand-primary-dark)] underline-offset-2 hover:underline active:opacity-70"
        href={primary.learningResourceYoutubeUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        前往學習
      </a>
    </div>
  );
}

export function TrainingChecklistViewPanel({
  checklist,
  onSigned,
  backHref = "/training",
  backLabel = "返回培訓檢核",
  showOrgLink = false,
  title = "培訓檢核",
  subtitle,
}: {
  checklist: TrainingChecklistView;
  onSigned?: () => void;
  backHref?: string;
  backLabel?: string;
  showOrgLink?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [confirmItemId, setConfirmItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const confirmItem = checklist.incomplete.find((entry) => entry.item.id === confirmItemId);

  const runSignOff = useCallback(
    (trainingItemId: string) => {
      if (submittingRef.current || !checklist.canSignOff) return;
      submittingRef.current = true;
      setPendingItemId(trainingItemId);
      setError(null);
      setFeedback(null);

      startTransition(async () => {
        try {
          const response = await fetchWithMemberAuth("/api/training/signoff", {
            method: "POST",
            body: JSON.stringify({
              traineeMemberId: checklist.traineeMemberId,
              trainingItemId,
            }),
          });
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
            ok?: boolean;
          };
          if (!response.ok) {
            throw new Error(payload.error ?? "簽核失敗");
          }
          setConfirmItemId(null);
          setFeedback("已簽核完成");
          onSigned?.();
        } catch (err) {
          setError(err instanceof Error ? err.message : "簽核失敗");
        } finally {
          submittingRef.current = false;
          setPendingItemId(null);
        }
      });
    },
    [checklist.canSignOff, checklist.traineeMemberId, onSigned],
  );

  return (
    <PageShell
      backHref={backHref}
      backLabel={backLabel}
      headerExtra={
        showOrgLink ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3.5 text-[0.875rem] font-medium text-[var(--brand-text)] active:opacity-80"
            href="/training/organization"
          >
            我的組織
          </Link>
        ) : null
      }
      subtitle={subtitle ?? "先看還沒完成的項目。完成狀態由上線簽核。"}
      title={title}
    >
      {feedback ? (
        <p
          className="rounded-[1rem] border border-[#b7f0c2] bg-[#e8f9ec] px-3.5 py-2.5 text-[0.875rem] font-medium text-[#248a3d]"
          role="status"
        >
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-[1rem] border border-[#ffd0d0] bg-[#fff5f5] px-3.5 py-2.5 text-[0.875rem] text-[#c62828]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="px-0.5 text-[1.0625rem] font-semibold text-[var(--brand-text)]">
          尚未完成
        </h2>
        {checklist.incomplete.length === 0 ? (
          <p className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4 text-[0.9375rem] text-[var(--brand-text-muted)]">
            目前沒有尚未完成的項目
          </p>
        ) : (
          <ul className="space-y-2.5">
            {checklist.incomplete.map((entry) => (
              <li
                key={entry.item.id}
                className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.35rem] border-2 border-[#c7c7cc] text-[0.75rem] text-transparent"
                  >
                    □
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[1.0rem] font-semibold leading-snug text-[var(--brand-text)]">
                      {entry.item.name}
                    </p>
                    <LearningHint links={entry.learningLinks} />
                    {checklist.canSignOff ? (
                      <button
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-[0.875rem] bg-[var(--brand-primary)] px-4 text-[0.9375rem] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-50 sm:w-auto"
                        disabled={isPending || pendingItemId === entry.item.id}
                        onClick={() => setConfirmItemId(entry.item.id)}
                        type="button"
                      >
                        簽核完成
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-0.5 text-[1.0625rem] font-semibold text-[var(--brand-text)]">
          已完成
        </h2>
        {checklist.completed.length === 0 ? (
          <p className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-4 text-[0.9375rem] text-[var(--brand-text-muted)]">
            尚未有完成紀錄
          </p>
        ) : (
          <ul className="space-y-2.5">
            {checklist.completed.map((entry) => (
              <li
                key={entry.item.id}
                className="rounded-[1.25rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3.5"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[1rem] font-semibold text-[#248a3d]"
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[1.0rem] font-semibold leading-snug text-[var(--brand-text)]">
                      {entry.item.name}
                    </p>
                    {entry.signoff ? (
                      <div className="mt-1.5 space-y-0.5 text-[0.8125rem] leading-relaxed text-[var(--brand-text-muted)]">
                        <p>{formatTrainingSignedDate(entry.signoff.signedAt)}</p>
                        <p>簽核：{entry.signoff.signerDisplayName}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="w-full max-w-md rounded-[1.25rem] bg-[var(--brand-surface)] p-5 shadow-lg"
            role="dialog"
          >
            <h3 className="text-[1.125rem] font-semibold text-[var(--brand-text)]">確認簽核</h3>
            <p className="mt-2 break-words text-[0.9375rem] leading-relaxed text-[var(--brand-text-muted)]">
              確認將「{confirmItem.item.name}」標記為已完成？
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
              <button
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[0.875rem] bg-[var(--brand-primary)] px-4 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
                disabled={isPending}
                onClick={() => runSignOff(confirmItem.item.id)}
                type="button"
              >
                {isPending ? "簽核中…" : "確認簽核"}
              </button>
              <button
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] px-4 text-[0.9375rem] font-medium text-[var(--brand-text)]"
                disabled={isPending}
                onClick={() => setConfirmItemId(null)}
                type="button"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export function useTrainingChecklist(traineeMemberId?: string | null) {
  const [checklist, setChecklist] = useState<TrainingChecklistView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        traineeMemberId && traineeMemberId.length > 0
          ? `?memberId=${encodeURIComponent(traineeMemberId)}`
          : "";
      const response = await fetchWithMemberAuth(`/api/training/checklist${qs}`);
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        checklist?: TrainingChecklistView;
        error?: string;
      };
      if (!response.ok || !payload.checklist) {
        throw new Error(payload.error ?? "無法載入培訓檢核");
      }
      setChecklist(payload.checklist);
    } catch (err) {
      setChecklist(null);
      setError(err instanceof Error ? err.message : "無法載入培訓檢核");
    } finally {
      setLoading(false);
    }
  }, [traineeMemberId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { checklist, loading, error, reload };
}
