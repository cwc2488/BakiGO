"use client";

import {
  TrainingChecklistViewPanel,
  useTrainingChecklist,
} from "@/components/training/TrainingChecklistViewPanel";
import {
  TrainingFeedbackBanner,
  TrainingPageFrame,
  TrainingSkeletonList,
} from "@/components/training/training-ui";

export function TrainingMemberChecklistPage({ memberId }: { memberId: string }) {
  const { checklist, setChecklist, loading, error, reload } = useTrainingChecklist(memberId);

  if (loading) {
    return (
      <TrainingPageFrame backHref="/training/organization" backLabel="我的組織">
        <TrainingSkeletonList />
      </TrainingPageFrame>
    );
  }

  if (error || !checklist) {
    return (
      <TrainingPageFrame backHref="/training/organization" backLabel="我的組織">
        <div className="home-section space-y-3">
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-[var(--brand-text)]">
            培訓檢核
          </h1>
          <TrainingFeedbackBanner tone="error">
            {error ?? "無法載入培訓檢核"}
          </TrainingFeedbackBanner>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-[0.95rem] border border-[var(--brand-border)] px-4 text-[0.9375rem] font-medium"
            onClick={() => void reload()}
            type="button"
          >
            重試
          </button>
        </div>
      </TrainingPageFrame>
    );
  }

  return (
    <TrainingChecklistViewPanel
      backHref="/training/organization"
      backLabel="我的組織"
      checklist={checklist}
      onChecklistChange={setChecklist}
      tagline="檢視培訓進度，並由上線正式簽核完成項目。"
      title="培訓檢核"
      traineeLabel={checklist.traineeDisplayName}
    />
  );
}
