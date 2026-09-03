"use client";

import {
  TrainingChecklistViewPanel,
  useTrainingChecklist,
} from "@/components/training/TrainingChecklistViewPanel";
import { PageShell } from "@/components/ui/PageShell";

export function TrainingMemberChecklistPage({ memberId }: { memberId: string }) {
  const { checklist, loading, error, reload } = useTrainingChecklist(memberId);

  if (loading) {
    return (
      <PageShell
        backHref="/training/organization"
        backLabel="返回我的組織"
        subtitle="載入中…"
        title="培訓檢核"
      >
        <p className="text-[0.9375rem] text-[var(--brand-text-muted)]">正在載入…</p>
      </PageShell>
    );
  }

  if (error || !checklist) {
    return (
      <PageShell
        backHref="/training/organization"
        backLabel="返回我的組織"
        subtitle="無法載入"
        title="培訓檢核"
      >
        <p className="rounded-[1.25rem] border border-[#ffd0d0] bg-[#fff5f5] px-4 py-4 text-[0.9375rem] text-[#c62828]">
          {error ?? "無法載入培訓檢核"}
        </p>
      </PageShell>
    );
  }

  return (
    <TrainingChecklistViewPanel
      backHref="/training/organization"
      backLabel="返回我的組織"
      checklist={checklist}
      onSigned={() => void reload()}
      subtitle={`${checklist.traineeDisplayName} 的培訓檢核`}
      title="培訓檢核"
    />
  );
}
