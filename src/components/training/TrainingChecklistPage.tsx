"use client";

import { TrainingChecklistViewPanel, useTrainingChecklist } from "@/components/training/TrainingChecklistViewPanel";
import { PageShell } from "@/components/ui/PageShell";

export function TrainingChecklistPage() {
  const { checklist, loading, error, reload } = useTrainingChecklist();

  if (loading) {
    return (
      <PageShell subtitle="載入中…" title="培訓檢核">
        <p className="text-[0.9375rem] text-[var(--brand-text-muted)]">正在載入培訓檢核…</p>
      </PageShell>
    );
  }

  if (error || !checklist) {
    return (
      <PageShell subtitle="無法載入" title="培訓檢核">
        <p className="rounded-[1.25rem] border border-[#ffd0d0] bg-[#fff5f5] px-4 py-4 text-[0.9375rem] text-[#c62828]">
          {error ?? "無法載入培訓檢核"}
        </p>
        <button
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[0.875rem] border border-[var(--brand-border)] px-4 text-[0.9375rem] font-medium"
          onClick={() => void reload()}
          type="button"
        >
          重試
        </button>
      </PageShell>
    );
  }

  return (
    <TrainingChecklistViewPanel
      checklist={checklist}
      onSigned={() => void reload()}
      showOrgLink
    />
  );
}
