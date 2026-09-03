"use client";

import {
  TrainingChecklistViewPanel,
  useTrainingChecklist,
} from "@/components/training/TrainingChecklistViewPanel";
import {
  TRAINING_SURFACE,
  TrainingFeedbackBanner,
  TrainingPageFrame,
  TrainingSkeletonList,
} from "@/components/training/training-ui";

export function TrainingChecklistPage() {
  const { checklist, loading, error, reload } = useTrainingChecklist();

  if (loading) {
    return (
      <TrainingPageFrame backHref="/" backLabel="返回首頁">
        <TrainingSkeletonList />
      </TrainingPageFrame>
    );
  }

  if (error || !checklist) {
    return (
      <TrainingPageFrame backHref="/" backLabel="返回首頁">
        <div className="home-section space-y-3">
          <h1 className="text-[2rem] font-semibold tracking-tight text-[var(--brand-text)]">
            培訓檢核
          </h1>
          <TrainingFeedbackBanner tone="error">
            {error ?? "無法載入培訓檢核"}
          </TrainingFeedbackBanner>
          <button
            className={`${TRAINING_SURFACE} inline-flex min-h-11 items-center justify-center px-4 text-[0.9375rem] font-medium`}
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
      checklist={checklist}
      onSigned={() => void reload()}
      showOrgLink
    />
  );
}
