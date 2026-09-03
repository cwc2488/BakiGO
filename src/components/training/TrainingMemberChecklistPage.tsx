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

export function TrainingMemberChecklistPage({ memberId }: { memberId: string }) {
  const { checklist, loading, error, reload } = useTrainingChecklist(memberId);

  if (loading) {
    return (
      <TrainingPageFrame backHref="/training/organization" backLabel="返回我的組織">
        <TrainingSkeletonList />
      </TrainingPageFrame>
    );
  }

  if (error || !checklist) {
    return (
      <TrainingPageFrame backHref="/training/organization" backLabel="返回我的組織">
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
      backHref="/training/organization"
      backLabel="返回我的組織"
      checklist={checklist}
      onSigned={() => void reload()}
      tagline="檢視培訓進度，並由上線正式簽核完成項目。"
      title="培訓檢核"
      traineeLabel={checklist.traineeDisplayName}
    />
  );
}
