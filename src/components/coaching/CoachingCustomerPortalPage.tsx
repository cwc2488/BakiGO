"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CrmButton, CrmCard } from "@/components/members/ui";
import { coachingTodayLogDate } from "@/lib/coaching/coaching-time";
import { uploadCoachingMealPhotoWithRetry } from "@/lib/coaching/coaching-meal-photo-client";
import {
  COACHING_MEAL_SLOT_LABELS,
  PRIMARY_MEAL_SLOTS,
  type CoachingDailyLogDetail,
  type CoachingMealSlot,
  type CoachingPlanSnapshot,
  type CoachingPortalContext,
} from "@/types/coaching";

type MealDraft = {
  textNote: string;
  previewUrl: string | null;
  uploading: boolean;
  uploadError: string | null;
};

type DailyDraft = {
  waterMl: string;
  exerciseNote: string;
  bowelMovementCount: string;
  sleepDuration: string;
  customerNote: string;
  meals: Record<CoachingMealSlot, MealDraft>;
};

function emptyMealDraft(): MealDraft {
  return {
    textNote: "",
    previewUrl: null,
    uploading: false,
    uploadError: null,
  };
}

function buildEmptyDraft(): DailyDraft {
  return {
    waterMl: "",
    exerciseNote: "",
    bowelMovementCount: "",
    sleepDuration: "",
    customerNote: "",
    meals: {
      breakfast: emptyMealDraft(),
      lunch: emptyMealDraft(),
      dinner: emptyMealDraft(),
      fourth_meal: emptyMealDraft(),
      snacks: emptyMealDraft(),
      drinks: emptyMealDraft(),
    },
  };
}

function OnboardingStep({
  title,
  children,
  step,
  total,
  onNext,
  nextLabel = "下一步",
}: {
  title: string;
  children: React.ReactNode;
  step: number;
  total: number;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <CrmCard className="space-y-5">
      <p className="text-[0.8125rem] font-medium text-[#86868b]">
        Day 1 · {step}/{total}
      </p>
      <h2 className="text-[1.375rem] font-semibold text-[#1d1d1f]">{title}</h2>
      <div className="space-y-3 text-[0.9375rem] leading-relaxed text-[#636366]">{children}</div>
      <CrmButton onClick={onNext} type="button">
        {nextLabel}
      </CrmButton>
    </CrmCard>
  );
}

export default function CoachingCustomerPortalPage({ token }: { token: string }) {
  const [context, setContext] = useState<CoachingPortalContext | null>(null);
  const [dailyLog, setDailyLog] = useState<CoachingDailyLogDetail | null>(null);
  const [draft, setDraft] = useState<DailyDraft>(buildEmptyDraft());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const logDate = coachingTodayLogDate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/context`);
      const payload = (await response.json()) as {
        ok?: boolean;
        context?: CoachingPortalContext;
        dailyLog?: CoachingDailyLogDetail & {
          meals: Array<
            CoachingDailyLogDetail["meals"][number] & {
              photo: (CoachingDailyLogDetail["meals"][number]["photo"] & { signedUrl?: string | null }) | null;
            }
          >;
        };
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.context) {
        throw new Error(payload.error ?? "連結無效或已過期");
      }

      setContext(payload.context);
      if (payload.dailyLog) {
        setDailyLog(payload.dailyLog);
        setDraft((current) => mergeDailyLogIntoDraft(current, payload.dailyLog!));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入陪跑");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const plan = context?.planSnapshot;
  const needsOnboarding = Boolean(context?.hasActiveEnrollment && !context.onboardingCompletedAt);

  const completeOnboarding = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/onboarding`, {
        method: "POST",
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "無法完成 onboarding");
      }
      await load();
      setOnboardingStep(0);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "無法完成 onboarding");
    } finally {
      setSubmitting(false);
    }
  };

  const saveDaily = async (markSubmitted = false) => {
    setSubmitting(true);
    setError(null);
    setSavedMessage(null);
    try {
      const meals = Object.fromEntries(
        (Object.keys(draft.meals) as CoachingMealSlot[]).map((slot) => [
          slot,
          {
            textNote: draft.meals[slot].textNote.trim() || null,
          },
        ]),
      );

      const response = await fetch(`/api/coaching/portal/${encodeURIComponent(token)}/daily`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logDate,
          waterMl: draft.waterMl.trim() ? Number(draft.waterMl) : null,
          exerciseNote: draft.exerciseNote.trim() || null,
          bowelMovementCount: draft.bowelMovementCount.trim() ? Number(draft.bowelMovementCount) : null,
          sleepDuration: draft.sleepDuration.trim() || null,
          customerNote: draft.customerNote.trim() || null,
          meals,
          markSubmitted,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        dailyLog?: CoachingDailyLogDetail;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.dailyLog) {
        throw new Error(payload.error ?? "儲存失敗");
      }

      setDailyLog(payload.dailyLog);
      setSavedMessage(markSubmitted ? "今日回報已送出" : "已自動儲存");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存失敗");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoSelect = async (mealSlot: CoachingMealSlot, file: File | null) => {
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setDraft((current) => ({
      ...current,
      meals: {
        ...current.meals,
        [mealSlot]: {
          ...current.meals[mealSlot],
          previewUrl,
          uploading: true,
          uploadError: null,
        },
      },
    }));

    try {
      await uploadCoachingMealPhotoWithRetry({
        token,
        logDate,
        mealSlot,
        file,
      });
      setDraft((current) => ({
        ...current,
        meals: {
          ...current.meals,
          [mealSlot]: {
            ...current.meals[mealSlot],
            uploading: false,
            uploadError: null,
          },
        },
      }));
      setSavedMessage(`${COACHING_MEAL_SLOT_LABELS[mealSlot]}照片已上傳`);
    } catch (uploadError) {
      setDraft((current) => ({
        ...current,
        meals: {
          ...current.meals,
          [mealSlot]: {
            ...current.meals[mealSlot],
            uploading: false,
            uploadError: uploadError instanceof Error ? uploadError.message : "照片上傳失敗",
          },
        },
      }));
    }
  };

  const onboardingContent = useMemo(() => {
    if (!plan) return null;
    return [
      {
        title: "本陪跑方案的執行原則",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            {plan.dietaryGuidelines.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      },
      {
        title: "每日執行方式",
        body: <PlanInstructionSections plan={plan} />,
      },
      {
        title: "回報規則",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            {plan.reportingRules.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      },
    ];
  }, [plan]);

  if (loading) {
    return <p className="px-4 py-10 text-center text-[0.9375rem] text-[#86868b]">載入中…</p>;
  }

  if (error && !context) {
    return <p className="px-4 py-10 text-center text-[0.9375rem] text-[#cf1322]">{error}</p>;
  }

  if (!context?.validToken) {
    return <p className="px-4 py-10 text-center text-[0.9375rem] text-[#cf1322]">連結無效或已過期</p>;
  }

  if (!context.hasActiveEnrollment) {
    return (
      <div className="home-container space-y-4 py-10">
        <CrmCard>
          <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">陪跑尚未開始</h1>
          <p className="mt-3 text-[0.9375rem] text-[#636366]">
            請聯絡你的教練確認陪跑是否已開始。
          </p>
        </CrmCard>
      </div>
    );
  }

  if (needsOnboarding && onboardingContent) {
    const step = onboardingContent[onboardingStep];
    if (!step) {
      return null;
    }

    const isLast = onboardingStep === onboardingContent.length - 1;
    return (
      <div className="home-container space-y-4 py-8">
        <header className="space-y-1 px-1">
          <p className="text-[0.875rem] text-[#86868b]">AI 陪跑 · Day 1</p>
          <h1 className="text-[1.75rem] font-semibold text-[#1d1d1f]">{context.displayName}</h1>
        </header>
        <OnboardingStep
          nextLabel={isLast ? "我知道了，開始今天的陪跑" : "下一步"}
          onNext={() => {
            if (isLast) {
              void completeOnboarding();
              return;
            }
            setOnboardingStep((value) => value + 1);
          }}
          step={onboardingStep + 1}
          title={step.title}
          total={onboardingContent.length}
        >
          {step.body}
        </OnboardingStep>
        {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}
        {submitting ? <p className="text-[0.9375rem] text-[#86868b]">處理中…</p> : null}
      </div>
    );
  }

  return (
    <div className="home-container space-y-4 py-8">
      <header className="space-y-1 px-1">
        <p className="text-[0.875rem] text-[#86868b]">{logDate} · 今日陪跑</p>
        <h1 className="text-[1.75rem] font-semibold text-[#1d1d1f]">{context.displayName}</h1>
        <p className="text-[0.9375rem] text-[#636366]">持續 &gt; 完美。拍照為主，文字為輔。</p>
      </header>

      {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}
      {savedMessage ? <p className="text-[0.9375rem] text-[var(--brand-primary-dark)]">{savedMessage}</p> : null}

      <CrmCard className="space-y-4">
        <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">主要餐點</h2>
        {PRIMARY_MEAL_SLOTS.map((slot) => (
          <MealReportField
            key={slot}
            draft={draft.meals[slot]}
            label={COACHING_MEAL_SLOT_LABELS[slot]}
            onPhotoSelect={(file) => void handlePhotoSelect(slot, file)}
            onTextChange={(value) =>
              setDraft((current) => ({
                ...current,
                meals: {
                  ...current.meals,
                  [slot]: { ...current.meals[slot], textNote: value },
                },
              }))
            }
            primary
          />
        ))}
      </CrmCard>

      <CrmCard className="space-y-4">
        <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">其他飲食</h2>
        {(["fourth_meal", "snacks", "drinks"] as const).map((slot) => (
          <MealReportField
            key={slot}
            draft={draft.meals[slot]}
            label={COACHING_MEAL_SLOT_LABELS[slot]}
            onPhotoSelect={(file) => void handlePhotoSelect(slot, file)}
            onTextChange={(value) =>
              setDraft((current) => ({
                ...current,
                meals: {
                  ...current.meals,
                  [slot]: { ...current.meals[slot], textNote: value },
                },
              }))
            }
          />
        ))}
      </CrmCard>

      <CrmCard className="space-y-4">
        <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">今日狀態</h2>
        <FieldInput label="水分 (ml)" onChange={(value) => setDraft((current) => ({ ...current, waterMl: value }))} value={draft.waterMl} />
        <FieldInput label="睡眠" onChange={(value) => setDraft((current) => ({ ...current, sleepDuration: value }))} value={draft.sleepDuration} />
        <FieldInput label="運動" onChange={(value) => setDraft((current) => ({ ...current, exerciseNote: value }))} value={draft.exerciseNote} />
        <FieldInput label="排便次數" inputMode="numeric" onChange={(value) => setDraft((current) => ({ ...current, bowelMovementCount: value }))} value={draft.bowelMovementCount} />
        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">今日心得</span>
          <textarea
            className="min-h-24 w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
            onChange={(event) => setDraft((current) => ({ ...current, customerNote: event.target.value }))}
            value={draft.customerNote}
          />
        </label>
      </CrmCard>

      <div className="grid gap-2">
        <CrmButton disabled={submitting} onClick={() => void saveDaily(false)} type="button" variant="secondary">
          儲存草稿
        </CrmButton>
        <CrmButton disabled={submitting} onClick={() => void saveDaily(true)} type="button">
          送出今日回報
        </CrmButton>
      </div>

      {dailyLog?.submittedAt ? (
        <p className="text-center text-[0.875rem] text-[#86868b]">最後送出：{new Date(dailyLog.submittedAt).toLocaleString("zh-TW")}</p>
      ) : null}
    </div>
  );
}

function PlanInstructionSections({ plan }: { plan: CoachingPlanSnapshot }) {
  const sections = [
    ["起床／第一階段", plan.dailyInstructions.wakeUp],
    ["早餐", plan.dailyInstructions.breakfast],
    ["午餐", plan.dailyInstructions.lunch],
    ["晚餐", plan.dailyInstructions.dinner],
    ["加餐", plan.dailyInstructions.snacks],
    ["水分／睡前", plan.dailyInstructions.hydration],
    ["睡眠", plan.dailyInstructions.sleep],
  ] as const;

  return (
    <div className="space-y-4">
      {sections.map(([title, items]) => (
        <div key={title}>
          <p className="font-semibold text-[#1d1d1f]">{title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[0.875rem] font-medium text-[#636366]">{label}</span>
      <input
        className="w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function MealReportField({
  label,
  draft,
  onTextChange,
  onPhotoSelect,
  primary = false,
}: {
  label: string;
  draft: MealDraft;
  onTextChange: (value: string) => void;
  onPhotoSelect: (file: File | null) => void;
  primary?: boolean;
}) {
  return (
    <div className="rounded-[1rem] border border-[#eef2ea] p-3 space-y-3">
      <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{label}</p>
      {primary ? (
        <label className="inline-flex cursor-pointer rounded-[0.875rem] bg-[var(--brand-bg)] px-4 py-3 text-[0.9375rem] font-medium text-[var(--brand-primary-dark)]">
          {draft.uploading ? "上傳中…" : "拍照 / 選擇照片"}
          <input
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              onPhotoSelect(file);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      ) : (
        <label className="inline-flex cursor-pointer rounded-[0.875rem] bg-[#f7f7f8] px-4 py-3 text-[0.875rem] font-medium text-[#636366]">
          {draft.uploading ? "上傳中…" : "附加照片（選填）"}
          <input
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              onPhotoSelect(file);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      )}
      {draft.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`${label}預覽`} className="max-h-40 w-full rounded-[0.75rem] object-cover" src={draft.previewUrl} />
      ) : null}
      {draft.uploadError ? <p className="text-[0.875rem] text-[#cf1322]">{draft.uploadError}</p> : null}
      <input
        className="w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={primary ? "補充文字（選填）" : "簡短描述（選填）"}
        value={draft.textNote}
      />
    </div>
  );
}

function mergeDailyLogIntoDraft(current: DailyDraft, dailyLog: CoachingDailyLogDetail): DailyDraft {
  const meals = { ...current.meals };
  for (const meal of dailyLog.meals) {
    meals[meal.mealSlot] = {
      ...meals[meal.mealSlot],
      textNote: meal.textNote ?? "",
      previewUrl: (meal.photo as { signedUrl?: string | null } | null)?.signedUrl ?? meals[meal.mealSlot].previewUrl,
      uploading: false,
      uploadError: null,
    };
  }

  return {
    waterMl: dailyLog.waterMl != null ? String(dailyLog.waterMl) : "",
    exerciseNote: dailyLog.exerciseNote ?? "",
    bowelMovementCount: dailyLog.bowelMovementCount != null ? String(dailyLog.bowelMovementCount) : "",
    sleepDuration: dailyLog.sleepDuration ?? "",
    customerNote: dailyLog.customerNote ?? "",
    meals,
  };
}
