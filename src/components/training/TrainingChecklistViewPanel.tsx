"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import {
  TrainingCollapseToggle,
  TrainingFeedbackBanner,
  TrainingHeroCompact,
  TrainingLearningActionLabel,
  TrainingListDivider,
  TrainingListSurface,
  TrainingPageFrame,
  TrainingSectionHeading,
  TrainingSheetShell,
  formatTrainingDisplayDate,
  formatTrainingItemNumber,
  getValidTrainingLearningLinks,
} from "@/components/training/training-ui";
import { fetchWithMemberAuth } from "@/lib/quiz/quiz-member-fetch";
import type {
  TrainingChecklistEntry,
  TrainingChecklistView,
  TrainingLearningLink,
  TrainingSignoff,
} from "@/types/training-checklist";

type ChecklistInflight = Promise<{
  checklist: TrainingChecklistView | null;
  error: string | null;
}>;

const checklistInflight = new Map<string, ChecklistInflight>();

function openLearningResource(link: TrainingLearningLink) {
  if (!link.learningResourceYoutubeUrl || typeof window === "undefined") return;
  window.open(link.learningResourceYoutubeUrl, "_blank", "noopener,noreferrer");
}

function IncompleteRow({
  entry,
  canSignOff,
  signing,
  showDivider,
  onSignOff,
  onLearning,
}: {
  entry: TrainingChecklistEntry;
  canSignOff: boolean;
  signing: boolean;
  showDivider: boolean;
  onSignOff: () => void;
  onLearning: (links: TrainingLearningLink[]) => void;
}) {
  const links = getValidTrainingLearningLinks(entry.learningLinks);

  return (
    <>
      {showDivider ? <TrainingListDivider /> : null}
      <div className="flex min-h-14 items-start gap-3 px-4 py-3">
        <span className="mt-0.5 inline-flex min-w-[1.5rem] justify-center font-mono text-[0.75rem] font-semibold tabular-nums text-[var(--brand-hint)]">
          {formatTrainingItemNumber(entry.item.sortOrder)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[0.975rem] font-semibold leading-snug text-[var(--brand-text)]">
            {entry.item.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[0.75rem] text-[var(--brand-text-muted)]">尚待培訓</span>
            {links.length > 0 ? (
              <button
                className="inline-flex min-h-9 items-center transition-opacity active:opacity-70"
                onClick={() => onLearning(links)}
                type="button"
              >
                <TrainingLearningActionLabel />
              </button>
            ) : null}
          </div>
        </div>
        {canSignOff ? (
          <button
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-semibold text-[var(--brand-text)] transition-opacity active:opacity-70 disabled:opacity-45"
            disabled={signing}
            onClick={onSignOff}
            type="button"
          >
            簽核
            <span aria-hidden className="text-[var(--brand-hint)]">
              ›
            </span>
          </button>
        ) : (
          <span aria-hidden className="mt-1 text-[1.1rem] text-[var(--brand-hint)]">
            ›
          </span>
        )}
      </div>
    </>
  );
}

function CompletedRow({
  entry,
  showDivider,
}: {
  entry: TrainingChecklistEntry;
  showDivider: boolean;
}) {
  const meta = entry.signoff
    ? `已簽核 · ${entry.signoff.signerDisplayName} · ${formatTrainingDisplayDate(entry.signoff.signedAt)}`
    : "已簽核";

  return (
    <>
      {showDivider ? <TrainingListDivider /> : null}
      <div className="flex min-h-12 items-start gap-3 px-4 py-2.5">
        <span
          aria-hidden
          className="mt-0.5 inline-flex min-w-[1.5rem] justify-center text-[0.875rem] font-semibold text-[var(--brand-primary-dark)]"
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-[0.9375rem] font-medium leading-snug text-[var(--brand-text)]">
            {entry.item.name}
          </p>
          <p className="mt-0.5 break-words text-[0.75rem] leading-relaxed text-[var(--brand-text-muted)]">
            {meta}
          </p>
        </div>
      </div>
    </>
  );
}

function SignOffSheet({
  traineeName,
  itemName,
  pending,
  onClose,
  onConfirm,
}: {
  traineeName: string;
  itemName: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <TrainingSheetShell
      footer={
        <div className="flex flex-col gap-2.5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 sm:flex-row-reverse">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[0.95rem] bg-[var(--brand-text)] px-4 text-[0.9375rem] font-semibold text-white disabled:opacity-50"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            {pending ? "簽核中…" : "確認簽核"}
          </button>
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[0.95rem] border border-[var(--brand-border)] px-4 text-[0.9375rem] font-medium text-[var(--brand-text)]"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
        </div>
      }
      onClose={onClose}
      subtitle={
        <div>
          <p>{traineeName}</p>
          <p className="mt-1 break-words font-medium text-[var(--brand-text)]">「{itemName}」</p>
          <p className="mt-2">完成簽核後將記錄你的身份與日期。</p>
        </div>
      }
      title="確認完成培訓"
    />
  );
}

function LearningPickerSheet({
  itemName,
  links,
  onClose,
  onSelect,
}: {
  itemName: string;
  links: TrainingLearningLink[];
  onClose: () => void;
  onSelect: (link: TrainingLearningLink) => void;
}) {
  return (
    <TrainingSheetShell
      footer={
        <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          <button
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[0.95rem] border border-[var(--brand-border)] px-4 text-[0.9375rem] font-medium text-[var(--brand-text)]"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
        </div>
      }
      onClose={onClose}
      subtitle={
        <div>
          <p className="break-words text-[var(--brand-text)]">{itemName}</p>
          <p className="mt-1">選擇要查看的內容</p>
        </div>
      }
      title="相關學習內容"
    >
      <div className="px-2 pb-1">
        {links.map((link, index) => (
          <div key={link.id}>
            {index > 0 ? <div className="mx-3 h-px bg-[var(--brand-border)]/70" /> : null}
            <button
              className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-3 text-left transition-opacity active:opacity-70"
              onClick={() => onSelect(link)}
              type="button"
            >
              <span className="min-w-0 break-words text-[0.9375rem] font-medium text-[var(--brand-text)]">
                {link.learningResourceTitle ?? link.learningResourceId}
              </span>
              <span aria-hidden className="shrink-0 text-[var(--brand-hint)]">
                ›
              </span>
            </button>
          </div>
        ))}
      </div>
    </TrainingSheetShell>
  );
}

function applyLocalSignOff(
  checklist: TrainingChecklistView,
  trainingItemId: string,
  signoff: TrainingSignoff,
): TrainingChecklistView {
  const entry = checklist.incomplete.find((item) => item.item.id === trainingItemId);
  if (!entry) {
    return checklist;
  }
  const completedEntry: TrainingChecklistEntry = {
    ...entry,
    status: "completed",
    signoff,
  };
  return {
    ...checklist,
    incomplete: checklist.incomplete.filter((item) => item.item.id !== trainingItemId),
    completed: [completedEntry, ...checklist.completed],
  };
}

export function TrainingChecklistViewPanel({
  checklist,
  onChecklistChange,
  backHref = "/training",
  backLabel = "培訓檢核",
  showOrgLink = false,
  title = "培訓檢核",
  tagline,
  traineeLabel,
}: {
  checklist: TrainingChecklistView;
  onChecklistChange?: (next: TrainingChecklistView) => void;
  backHref?: string;
  backLabel?: string;
  showOrgLink?: boolean;
  title?: string;
  tagline?: string;
  traineeLabel?: string;
}) {
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [confirmItemId, setConfirmItemId] = useState<string | null>(null);
  const [learningItemId, setLearningItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(true);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  const confirmItem = checklist.incomplete.find((entry) => entry.item.id === confirmItemId);
  const learningItem = checklist.incomplete.find((entry) => entry.item.id === learningItemId);
  const learningLinks = learningItem
    ? getValidTrainingLearningLinks(learningItem.learningLinks)
    : [];

  const isOwnView = checklist.viewerMemberId === checklist.traineeMemberId;
  const resolvedTagline =
    tagline ??
    (isOwnView
      ? "建立你的專業基本功"
      : "檢視培訓進度，並由上線正式簽核完成項目。");

  const handleLearning = useCallback((itemId: string, links: TrainingLearningLink[]) => {
    if (links.length === 0) return;
    if (links.length === 1) {
      openLearningResource(links[0]);
      return;
    }
    setLearningItemId(itemId);
  }, []);

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
            signoff?: TrainingSignoff;
          };
          if (!response.ok || !payload.signoff) {
            throw new Error(payload.error ?? "簽核失敗");
          }
          setConfirmItemId(null);
          setFeedback("已完成正式簽核");
          onChecklistChange?.(applyLocalSignOff(checklist, trainingItemId, payload.signoff));
        } catch (err) {
          setError(err instanceof Error ? err.message : "簽核失敗");
        } finally {
          submittingRef.current = false;
          setPendingItemId(null);
        }
      });
    },
    [checklist, onChecklistChange],
  );

  return (
    <TrainingPageFrame
      backHref={backHref}
      backLabel={backLabel}
      headerExtra={
        showOrgLink ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] px-3.5 text-[0.8125rem] font-medium text-[var(--brand-text)] transition-opacity active:opacity-80"
            href="/training/organization"
          >
            我的組織
          </Link>
        ) : null
      }
    >
      <TrainingHeroCompact
        completedCount={checklist.completed.length}
        eyebrow={traineeLabel}
        incompleteCount={checklist.incomplete.length}
        tagline={resolvedTagline}
        title={title}
      />

      {(feedback || error) && (
        <div className="home-section space-y-2">
          {feedback ? (
            <TrainingFeedbackBanner tone="success">{feedback}</TrainingFeedbackBanner>
          ) : null}
          {error ? <TrainingFeedbackBanner tone="error">{error}</TrainingFeedbackBanner> : null}
        </div>
      )}

      <section className="home-section space-y-2.5">
        <TrainingSectionHeading count={checklist.incomplete.length}>
          尚未完成
        </TrainingSectionHeading>

        {checklist.incomplete.length === 0 ? (
          <TrainingListSurface>
            <div className="px-4 py-7 text-center">
              <p className="text-[0.975rem] font-semibold text-[var(--brand-text)]">
                培訓項目已全部完成
              </p>
              <p className="mt-1 text-[0.8125rem] text-[var(--brand-text-muted)]">
                所有可培訓項目均已由上線正式簽核。
              </p>
            </div>
          </TrainingListSurface>
        ) : (
          <TrainingListSurface>
            {checklist.incomplete.map((entry, index) => (
              <IncompleteRow
                key={entry.item.id}
                canSignOff={checklist.canSignOff}
                entry={entry}
                onLearning={(links) => handleLearning(entry.item.id, links)}
                onSignOff={() => setConfirmItemId(entry.item.id)}
                showDivider={index > 0}
                signing={isPending || pendingItemId === entry.item.id}
              />
            ))}
          </TrainingListSurface>
        )}
      </section>

      {checklist.completed.length > 0 ? (
        <section className="home-section space-y-2.5">
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
            <TrainingListSurface>
              {checklist.completed.map((entry, index) => (
                <CompletedRow
                  key={entry.item.id}
                  entry={entry}
                  showDivider={index > 0}
                />
              ))}
            </TrainingListSurface>
          ) : null}
        </section>
      ) : null}

      {confirmItem ? (
        <SignOffSheet
          itemName={confirmItem.item.name}
          onClose={() => setConfirmItemId(null)}
          onConfirm={() => runSignOff(confirmItem.item.id)}
          pending={isPending}
          traineeName={checklist.traineeDisplayName}
        />
      ) : null}

      {learningItem && learningLinks.length > 1 ? (
        <LearningPickerSheet
          itemName={learningItem.item.name}
          links={learningLinks}
          onClose={() => setLearningItemId(null)}
          onSelect={(link) => {
            setLearningItemId(null);
            openLearningResource(link);
          }}
        />
      ) : null}
    </TrainingPageFrame>
  );
}

async function fetchTrainingChecklist(
  traineeMemberId?: string | null,
): Promise<{ checklist: TrainingChecklistView | null; error: string | null }> {
  const key = traineeMemberId?.trim() || "__self__";
  const existing = checklistInflight.get(key);
  if (existing) {
    return existing;
  }

  const request = (async () => {
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
        return { checklist: null, error: payload.error ?? "無法載入培訓檢核" };
      }
      return { checklist: payload.checklist, error: null };
    } catch (err) {
      return {
        checklist: null,
        error: err instanceof Error ? err.message : "無法載入培訓檢核",
      };
    } finally {
      checklistInflight.delete(key);
    }
  })();

  checklistInflight.set(key, request);
  return request;
}

export function useTrainingChecklist(traineeMemberId?: string | null) {
  const [checklist, setChecklist] = useState<TrainingChecklistView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchTrainingChecklist(traineeMemberId);
    setChecklist(result.checklist);
    setError(result.error);
    setLoading(false);
  }, [traineeMemberId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { checklist, setChecklist, loading, error, reload };
}
