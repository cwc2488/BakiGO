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

export function TrainingChecklistPage() {
  const { checklist, setChecklist, loading, error, reload } = useTrainingChecklist();

  if (loading) {
    return (
      <TrainingPageFrame backHref="/" backLabel="首頁">
        <TrainingSkeletonList />
      </TrainingPageFrame>
    );
  }

  if (error || !checklist) {
    return (
      <TrainingPageFrame backHref="/" backLabel="首頁">
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
      backHref="/"
      backLabel="首頁"
      checklist={checklist}
      onChecklistChange={setChecklist}
      showOrgLink
    />
  );
}
