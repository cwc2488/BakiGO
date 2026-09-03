"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  TRAINING_SURFACE,
  TRAINING_SURFACE_SOFT,
  TrainingCollapseToggle,
  TrainingFeedbackBanner,
  TrainingHero,
  TrainingLearningLink,
  TrainingPageFrame,
  TrainingSectionHeading,
  TrainingStatusChip,
  TrainingVerifiedSeal,
  formatTrainingDisplayDate,
  formatTrainingItemNumber,
} from "@/components/training/training-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type { TrainingChecklistEntry, TrainingChecklistView } from "@/types/training-checklist";

function IncompleteCard({
  entry,
  canSignOff,
  signing,
  onSignOff,
}: {
  entry: TrainingChecklistEntry;
  canSignOff: boolean;
  signing: boolean;
  onSignOff: () => void;
}) {
  const learning = entry.learningLinks.find((link) => link.learningResourceYoutubeUrl);

  return (
    <li className={`${TRAINING_SURFACE} px-4 py-4`}>
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 inline-flex min-w-[1.75rem] justify-center font-mono text-[0.8125rem] font-semibold tabular-nums tracking-wide text-[var(--brand-hint)]">
          {formatTrainingItemNumber(entry.item.sortOrder)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[1.0625rem] font-semibold leading-snug tracking-tight text-[var(--brand-text)]">
            {entry.item.name}
          </p>
          <div className="mt-2.5">
            <TrainingStatusChip>尚待培訓</TrainingStatusChip>
          </div>
          {learning?.learningResourceYoutubeUrl ? (
            <TrainingLearningLink href={learning.learningResourceYoutubeUrl} />
          ) : null}
          {canSignOff ? (
            <button
              className="mt-3.5 inline-flex min-h-11 w-full items-center justify-center rounded-[0.95rem] bg-[var(--brand-text)] px-4 text-[0.9375rem] font-semibold text-white transition-[opacity,transform] active:scale-[0.99] active:opacity-90 disabled:opacity-50"
              disabled={signing}
              onClick={onSignOff}
              type="button"
            >
              簽核完成
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function CompletedCard({ entry }: { entry: TrainingChecklistEntry }) {
  return (
    <li className={`${TRAINING_SURFACE_SOFT} px-4 py-3.5`}>
      <div className="flex items-start gap-3">
        <TrainingVerifiedSeal />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TrainingStatusChip tone="verified">已簽核</TrainingStatusChip>
          </div>
          <p className="mt-2 break-words text-[1rem] font-semibold leading-snug text-[var(--brand-text)]">
            {entry.item.name}
          </p>
          {entry.signoff ? (
            <dl className="mt-2.5 grid gap-1 text-[0.8125rem] leading-relaxed text-[var(--brand-text-muted)]">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-[var(--brand-hint)]">簽核人</dt>
                <dd className="break-words text-[var(--brand-text-secondary)]">
                  {entry.signoff.signerDisplayName}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-[var(--brand-hint)]">日期</dt>
                <dd className="tabular-nums text-[var(--brand-text-secondary)]">
                  {formatTrainingDisplayDate(entry.signoff.signedAt)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SignOffSheet({
  traineeName,
  itemName,
  pending,
  onCancel,
  onConfirm,
}: {
  traineeName: string;
  itemName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(29,29,31,0.42)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <div
        aria-labelledby="training-signoff-title"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-[1.5rem] border border-[var(--brand-border)]/70 bg-[var(--brand-surface)] shadow-[0_18px_48px_rgba(29,29,31,0.16)]"
        role="dialog"
      >
        <div className="px-5 pb-2 pt-5">
          <p className="text-[0.75rem] font-medium tracking-[0.06em] text-[var(--brand-text-muted)]">
            正式簽核
          </p>
          <h3
            className="mt-1.5 text-[1.1875rem] font-semibold tracking-tight text-[var(--brand-text)]"
            id="training-signoff-title"
          >
            確認完成培訓
          </h3>
          <div className="mt-4 rounded-[1.1rem] bg-[var(--brand-bg)] px-4 py-3.5">
            <p className="text-[0.8125rem] text-[var(--brand-text-muted)]">{traineeName}</p>
            <p className="mt-1 break-words text-[1.0625rem] font-semibold leading-snug text-[var(--brand-text)]">
              「{itemName}」
            </p>
          </div>
          <p className="mt-3.5 text-[0.875rem] leading-relaxed text-[var(--brand-text-secondary)]">
            完成簽核後將記錄你的身份與日期。
          </p>
        </div>
        <div className="mt-2 flex flex-col gap-2.5 px-5 pb-5 pt-2 sm:flex-row-reverse">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[0.95rem] bg-[var(--brand-text)] px-4 text-[0.9375rem] font-semibold text-white transition-opacity disabled:opacity-50"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending ? "簽核中…" : "確認簽核"}
          </button>
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[0.95rem] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 text-[0.9375rem] font-medium text-[var(--brand-text)]"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            取消
          </button>
        </div>
      </div>
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
  tagline,
  traineeLabel,
}: {
  checklist: TrainingChecklistView;
  onSigned?: () => void;
  backHref?: string;
  backLabel?: string;
  showOrgLink?: boolean;
  title?: string;
  tagline?: string;
  traineeLabel?: string;
}) {
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [confirmItemId, setConfirmItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(true);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const confirmItem = checklist.incomplete.find((entry) => entry.item.id === confirmItemId);
  const isOwnView = checklist.viewerMemberId === checklist.traineeMemberId;
  const resolvedTagline =
    tagline ??
    (isOwnView
      ? "建立你的專業基本功"
      : "檢視培訓進度，並由上線正式簽核完成項目。");

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
          setFeedback("已完成正式簽核");
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
    <TrainingPageFrame
      backHref={backHref}
      backLabel={backLabel}
      headerExtra={
        showOrgLink ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-4 text-[0.875rem] font-medium text-[var(--brand-text)] shadow-[0_1px_2px_rgba(29,29,31,0.04)] transition-opacity active:opacity-80"
            href="/training/organization"
          >
            我的組織
          </Link>
        ) : null
      }
    >
      <TrainingHero
        completedCount={checklist.completed.length}
        eyebrow={traineeLabel}
        incompleteCount={checklist.incomplete.length}
        tagline={resolvedTagline}
        title={title}
      />

      <div className="home-section space-y-3">
        {feedback ? (
          <TrainingFeedbackBanner tone="success">{feedback}</TrainingFeedbackBanner>
        ) : null}
        {error ? <TrainingFeedbackBanner tone="error">{error}</TrainingFeedbackBanner> : null}
      </div>

      <section className="home-section space-y-3.5">
        <TrainingSectionHeading count={checklist.incomplete.length}>
          尚未完成
        </TrainingSectionHeading>

        {checklist.incomplete.length === 0 ? (
          <div className={`${TRAINING_SURFACE} px-5 py-8 text-center`}>
            <div className="flex justify-center">
              <TrainingVerifiedSeal />
            </div>
            <p className="mt-3 text-[1.0625rem] font-semibold text-[var(--brand-text)]">
              培訓項目已全部完成
            </p>
            <p className="mt-1.5 text-[0.875rem] leading-relaxed text-[var(--brand-text-muted)]">
              所有可培訓項目均已由上線正式簽核。
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {checklist.incomplete.map((entry) => (
              <IncompleteCard
                key={entry.item.id}
                canSignOff={checklist.canSignOff}
                entry={entry}
                onSignOff={() => setConfirmItemId(entry.item.id)}
                signing={isPending || pendingItemId === entry.item.id}
              />
            ))}
          </ul>
        )}
      </section>

      {checklist.completed.length > 0 ? (
        <section className="home-section space-y-3.5">
          <TrainingSectionHeading
            count={checklist.completed.length}
            trailing={
              <TrainingCollapseToggle
                label={completedOpen ? "收合" : "展開"}
                onToggle={() => setCompletedOpen((open) => !open)}
                open={completedOpen}
              />
            }
          >
            已完成
          </TrainingSectionHeading>
          {completedOpen ? (
            <ul className="space-y-2">
              {checklist.completed.map((entry) => (
                <CompletedCard key={entry.item.id} entry={entry} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {confirmItem ? (
        <SignOffSheet
          itemName={confirmItem.item.name}
          onCancel={() => setConfirmItemId(null)}
          onConfirm={() => runSignOff(confirmItem.item.id)}
          pending={isPending}
          traineeName={checklist.traineeDisplayName}
        />
      ) : null}
    </TrainingPageFrame>
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
