"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CoachingDailyCompleteView } from "@/components/coaching/CoachingDailyCompleteView";
import { CoachingCustomerHistoryView } from "@/components/coaching/CoachingCustomerHistoryView";
import { CoachingProgressCard } from "@/components/coaching/CoachingProgressCard";
import CoachingExperienceCheckinCard from "@/components/coaching/CoachingExperienceCheckinCard";
import type { CoachingProgressView } from "@/lib/coaching/build-coaching-progress-view";
import { CoachingMealPhotoInput } from "@/components/coaching/CoachingMealPhotoInput";
import { CoachingRecentDaySelector } from "@/components/coaching/CoachingRecentDaySelector";
import { CrmButton, CrmCard } from "@/components/members/ui";
import type { CoachingRecentDaySummary } from "@/lib/coaching/coaching-day-status";
import { computeSleepDurationLabel } from "@/lib/coaching/coaching-sleep";
import { nextIncompleteBackfillDate, resolveBackfillContinueTarget } from "@/lib/coaching/coaching-backfill-flow";
import {
  coachingRelativeDayLabel,
  coachingTodayLogDate,
} from "@/lib/coaching/coaching-time";
import { uploadCoachingMealPhotoWithRetry } from "@/lib/coaching/coaching-meal-photo-client";
import {
  coachingJourneyDayNumberInWindow,
  resolveEnrollmentPlannedEndDate,
} from "@/lib/coaching/enrollment-window";
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
  sleepBedtime: string;
  sleepWakeTime: string;
  customerNote: string;
  meals: Record<CoachingMealSlot, MealDraft>;
};

type PortalDailyView = "home" | "form" | "complete" | "history" | "onboarding";

type DailyLogWithSignedPhotos = CoachingDailyLogDetail & {
  meals: Array<
    CoachingDailyLogDetail["meals"][number] & {
      photo: (CoachingDailyLogDetail["meals"][number]["photo"] & { signedUrl?: string | null }) | null;
    }
  >;
};

type HomeTodayStatus = "not_reported" | "ai_analyzing" | "complete";

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
    sleepBedtime: "",
    sleepWakeTime: "",
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

function formatSlashDate(isoDate: string | null | undefined): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate.slice(0, 10))) return null;
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${y}/${m}/${d}`;
}

function resolveHomeTodayStatus(summary: CoachingRecentDaySummary | undefined, dailyLog: CoachingDailyLogDetail | null): HomeTodayStatus {
  if (!dailyLog?.submittedAt && (!summary || summary.status === "not_started" || summary.status === "draft")) {
    return "not_reported";
  }
  if (!dailyLog?.submittedAt && !summary?.submittedAt) {
    return "not_reported";
  }
  const status = summary?.status;
  if (status === "ai_ready" || status === "ai_unavailable") {
    return "complete";
  }
  if (status === "ai_analyzing" || status === "submitted") {
    return "ai_analyzing";
  }
  if (dailyLog?.submittedAt) {
    return "ai_analyzing";
  }
  return "not_reported";
}

const HOME_STATUS_LABELS: Record<HomeTodayStatus, string> = {
  not_reported: "尚未回報",
  ai_analyzing: "已收到，AI 分析中",
  complete: "今日回報完成",
};

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
  const [dailyView, setDailyView] = useState<PortalDailyView>("home");
  const [selectedLogDate, setSelectedLogDate] = useState(coachingTodayLogDate());
  const [recentDays, setRecentDays] = useState<CoachingRecentDaySummary[]>([]);
  const [progress, setProgress] = useState<CoachingProgressView | null>(null);
  const [customerReminders, setCustomerReminders] = useState<string[]>([]);
  const [backfillActive, setBackfillActive] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const dayLabel = coachingRelativeDayLabel(selectedLogDate);
  const todayLogDate = coachingTodayLogDate();

  const load = useCallback(
    async (logDate: string, options?: { preferView?: PortalDailyView }) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/coaching/portal/${encodeURIComponent(token)}/context?logDate=${encodeURIComponent(logDate)}`,
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          context?: CoachingPortalContext;
          logDate?: string;
          recentDays?: CoachingRecentDaySummary[];
          progress?: CoachingProgressView | null;
          customerReminders?: string[];
          dailyLog?: DailyLogWithSignedPhotos | null;
          error?: string;
        };

        if (!response.ok || !payload.ok || !payload.context) {
          throw new Error(payload.error ?? "連結無效或已過期");
        }

        setContext(payload.context);
        setSelectedLogDate(payload.logDate ?? logDate);
        setRecentDays(payload.recentDays ?? []);
        setProgress(payload.progress ?? null);
        setCustomerReminders(payload.customerReminders ?? []);

        if (payload.dailyLog?.id) {
          setDailyLog(payload.dailyLog);
          setDraft(mergeDailyLogIntoDraft(buildEmptyDraft(), payload.dailyLog));
        } else {
          setDailyLog(null);
          setDraft(buildEmptyDraft());
        }

        // Default portal entry is always Home (not onboarding/form).
        let nextView: PortalDailyView = options?.preferView ?? "home";
        if (nextView === "complete" && !payload.dailyLog?.submittedAt) {
          nextView = payload.dailyLog?.id ? "form" : "home";
        }
        setDailyView(nextView);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "無法載入陪跑");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load(selectedLogDate, { preferView: "home" });
    // Initial load only; subsequent day switches call load explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const plan = context?.planSnapshot;
  const needsOnboarding = Boolean(context?.hasActiveEnrollment && !context.onboardingCompletedAt);
  const sleepDurationPreview = useMemo(() => {
    if (!draft.sleepBedtime.trim() || !draft.sleepWakeTime.trim()) {
      return null;
    }
    return computeSleepDurationLabel(draft.sleepBedtime, draft.sleepWakeTime);
  }, [draft.sleepBedtime, draft.sleepWakeTime]);

  const continueBackfill = useMemo(() => {
    if (!backfillActive) {
      const incomplete = nextIncompleteBackfillDate(recentDays, selectedLogDate);
      return incomplete ? { logDate: incomplete, kind: "incomplete" as const } : null;
    }
    return resolveBackfillContinueTarget({
      recentDays,
      afterLogDate: selectedLogDate,
      backfillActive,
    });
  }, [backfillActive, recentDays, selectedLogDate]);

  const continueBackfillDate = continueBackfill?.logDate ?? null;

  const journeyDayNumber = useMemo(() => {
    if (!context?.startedAt) return null;
    return coachingJourneyDayNumberInWindow({
      startedAt: context.startedAt,
      // Soft: plannedEndAt may be absent until RPC/types are fully wired.
      plannedEndAt: context.plannedEndAt,
      logDate: todayLogDate,
    });
  }, [context?.startedAt, context?.plannedEndAt, todayLogDate]);

  const plannedEndLabel = useMemo(() => {
    const end =
      context?.plannedEndAt ??
      resolveEnrollmentPlannedEndDate({
        startedAt: context?.startedAt,
        plannedEndAt: context?.plannedEndAt,
      });
    return formatSlashDate(end);
  }, [context?.startedAt, context?.plannedEndAt]);

  const todaySummary = useMemo(
    () => recentDays.find((day) => day.logDate === todayLogDate),
    [recentDays, todayLogDate],
  );

  const homeTodayStatus = resolveHomeTodayStatus(
    todaySummary,
    selectedLogDate === todayLogDate ? dailyLog : null,
  );

  // Soft-poll Home while AI is analyzing so status flips without remount.
  useEffect(() => {
    if (dailyView !== "home") return;
    if (homeTodayStatus !== "ai_analyzing") return;
    let cancelled = false;
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      if (cancelled) return;
      if (Date.now() - startedAt >= 90_000) {
        window.clearInterval(tick);
        return;
      }
      void fetch(
        `/api/coaching/portal/${encodeURIComponent(token)}/context?logDate=${encodeURIComponent(todayLogDate)}`,
      )
        .then(async (response) => {
          const payload = (await response.json()) as {
            ok?: boolean;
            recentDays?: CoachingRecentDaySummary[];
            dailyLog?: CoachingDailyLogDetail | null;
          };
          if (!response.ok || !payload.ok || cancelled) return;
          if (payload.recentDays) setRecentDays(payload.recentDays);
          if (payload.dailyLog?.id) setDailyLog(payload.dailyLog);
        })
        .catch(() => {
          // Ignore soft-poll errors.
        });
    }, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
    };
  }, [dailyView, homeTodayStatus, token, todayLogDate]);

  const openDayDetail = async (logDate: string) => {
    setSavedMessage(null);
    setJustSubmitted(false);
    setBackfillActive(false);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/coaching/portal/${encodeURIComponent(token)}/context?logDate=${encodeURIComponent(logDate)}`,
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        context?: CoachingPortalContext;
        logDate?: string;
        recentDays?: CoachingRecentDaySummary[];
        progress?: CoachingProgressView | null;
        customerReminders?: string[];
        dailyLog?: DailyLogWithSignedPhotos | null;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.context) {
        throw new Error(payload.error ?? "連結無效或已過期");
      }
      setContext(payload.context);
      setSelectedLogDate(payload.logDate ?? logDate);
      setRecentDays(payload.recentDays ?? []);
      setProgress(payload.progress ?? null);
      setCustomerReminders(payload.customerReminders ?? []);
      if (payload.dailyLog?.id) {
        setDailyLog(payload.dailyLog);
        setDraft(mergeDailyLogIntoDraft(buildEmptyDraft(), payload.dailyLog));
        setDailyView(payload.dailyLog.submittedAt ? "complete" : "form");
      } else {
        setDailyLog(null);
        setDraft(buildEmptyDraft());
        setDailyView("form");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入陪跑");
    } finally {
      setLoading(false);
    }
  };

  const startBackfillFlow = async () => {
    setBackfillActive(true);
    const first = nextIncompleteBackfillDate(recentDays);
    if (!first) {
      setSavedMessage("最近三天都已送出");
      return;
    }
    setSavedMessage(null);
    await openDayDetail(first);
  };

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
      await load(coachingTodayLogDate(), { preferView: "home" });
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
          logDate: selectedLogDate,
          waterMl: draft.waterMl.trim() ? Number(draft.waterMl) : null,
          exerciseNote: draft.exerciseNote.trim() || null,
          bowelMovementCount: draft.bowelMovementCount.trim() ? Number(draft.bowelMovementCount) : null,
          sleepBedtime: draft.sleepBedtime.trim() || null,
          sleepWakeTime: draft.sleepWakeTime.trim() || null,
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
      setDraft((current) => mergeDailyLogIntoDraft(current, payload.dailyLog!));

      // Refresh recent-day statuses without blocking submit on AI generation.
      void fetch(
        `/api/coaching/portal/${encodeURIComponent(token)}/context?logDate=${encodeURIComponent(selectedLogDate)}`,
      )
        .then(async (contextResponse) => {
          const contextPayload = (await contextResponse.json()) as {
            ok?: boolean;
            recentDays?: CoachingRecentDaySummary[];
            progress?: CoachingProgressView | null;
            customerReminders?: string[];
          };
          if (contextResponse.ok && contextPayload.ok) {
            if (contextPayload.recentDays) setRecentDays(contextPayload.recentDays);
            if (contextPayload.progress !== undefined) setProgress(contextPayload.progress ?? null);
            if (contextPayload.customerReminders) setCustomerReminders(contextPayload.customerReminders);
          }
        })
        .catch(() => {
          // Non-blocking refresh.
        });

      if (markSubmitted) {
        setJustSubmitted(true);
        setDailyView("complete");
        return;
      }

      setSavedMessage("已自動儲存");
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
        logDate: selectedLogDate,
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
          <p className="mt-3 text-[0.9375rem] text-[#636366]">請聯絡你的教練確認陪跑是否已開始。</p>
        </CrmCard>
      </div>
    );
  }

  if (dailyView === "onboarding" && onboardingContent) {
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
          <button
            className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
            onClick={() => setDailyView("home")}
            type="button"
          >
            返回首頁
          </button>
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

  const formHeader = (
    <header className="space-y-3 px-1">
      <div className="space-y-1">
        <button
          className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
          onClick={() => {
            setJustSubmitted(false);
            void load(todayLogDate, { preferView: "home" });
          }}
          type="button"
        >
          ← 返回首頁
        </button>
        <p className="text-[0.875rem] text-[#86868b]">
          {selectedLogDate} · {dayLabel}陪跑
        </p>
        <h1 className="text-[1.75rem] font-semibold text-[#1d1d1f]">{context.displayName}</h1>
        <p className="text-[0.9375rem] text-[#636366]">持續 &gt; 完美。拍照為主，文字為輔。</p>
      </div>
      {recentDays.length > 0 ? (
        <CoachingRecentDaySelector
          days={recentDays}
          onSelect={(logDate) => void openDayDetail(logDate)}
          selectedLogDate={selectedLogDate}
        />
      ) : null}
      <button
        className="text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
        onClick={() => void startBackfillFlow()}
        type="button"
      >
        補回最近幾天
      </button>
    </header>
  );

  if (dailyView === "history") {
    return (
      <div className="home-container space-y-4 py-8">
        <button
          className="px-1 text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
          onClick={() => setDailyView("home")}
          type="button"
        >
          ← 返回首頁
        </button>
        {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}
        <CoachingCustomerHistoryView
          days={recentDays}
          onBackToToday={() => {
            void load(coachingTodayLogDate(), { preferView: "home" });
          }}
          onSelectDay={(logDate) => void openDayDetail(logDate)}
        />
      </div>
    );
  }

  if (dailyView === "complete" && dailyLog) {
    return (
      <div className="home-container space-y-4 py-8">
        {formHeader}
        {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}
        <CoachingDailyCompleteView
          continueBackfillLabel={
            continueBackfillDate
              ? continueBackfill?.kind === "sequence"
                ? `前往${coachingRelativeDayLabel(continueBackfillDate)}`
                : `繼續補${coachingRelativeDayLabel(continueBackfillDate)}`
              : null
          }
          dailyLog={dailyLog}
          dayLabel={dayLabel}
          logDate={selectedLogDate}
          mealDrafts={draft.meals}
          onContinueBackfill={
            continueBackfillDate
              ? () => {
                  void openDayDetail(continueBackfillDate);
                }
              : undefined
          }
          onEdit={() => setDailyView("form")}
          onOpenHistory={() => setDailyView("history")}
          portalToken={token}
          showImmediateReceived={justSubmitted}
        />
      </div>
    );
  }

  if (dailyView === "home") {
    return (
      <div className="home-container space-y-4 py-8">
        <header className="space-y-2 px-1">
          <h1 className="text-[1.75rem] font-semibold text-[#1d1d1f]">
            你好，{context.displayName ?? "夥伴"}
          </h1>
          <p className="text-[0.9375rem] text-[#636366]">
            {journeyDayNumber != null ? `第 ${journeyDayNumber} 天` : "陪跑進行中"}
            {plannedEndLabel ? `｜陪跑至 ${plannedEndLabel}` : null}
          </p>
          <p className="text-[0.9375rem] text-[#1d1d1f]">
            今日狀態：{HOME_STATUS_LABELS[homeTodayStatus]}
          </p>
        </header>

        {error ? <p className="text-[0.9375rem] text-[#cf1322]">{error}</p> : null}

        <CrmButton
          onClick={() => {
            setJustSubmitted(false);
            if (homeTodayStatus === "not_reported") {
              void load(todayLogDate, { preferView: "form" });
              return;
            }
            void load(todayLogDate, { preferView: "complete" });
          }}
          type="button"
        >
          {homeTodayStatus === "not_reported"
            ? "開始今日回報"
            : homeTodayStatus === "ai_analyzing"
              ? "查看分析進度"
              : "查看今天結果"}
        </CrmButton>

        {needsOnboarding && onboardingContent ? (
          <CrmCard className="space-y-3">
            <p className="text-[1.0625rem] font-semibold text-[#1d1d1f]">開始前先了解陪跑方式</p>
            <p className="text-[0.875rem] text-[#636366]">約一分鐘，看完就能更安心地開始今天的回報。</p>
            <CrmButton onClick={() => setDailyView("onboarding")} type="button" variant="secondary">
              查看陪跑說明
            </CrmButton>
          </CrmCard>
        ) : null}

        {customerReminders.length > 0 ? (
          <CrmCard className="space-y-3">
            <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">教練今天提醒</h2>
            <ul className="list-disc space-y-2 pl-5 text-[0.9375rem] leading-relaxed text-[#636366]">
              {customerReminders.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CrmCard>
        ) : null}

        {progress ? (
          <div className="space-y-2">
            <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-[#86868b]">
              我的進度
            </h2>
            <CoachingProgressCard progress={progress} />
          </div>
        ) : null}

        <CoachingExperienceCheckinCard token={token} />

        <CrmCard className="space-y-3">
          <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">歷史紀錄</h2>
          <p className="text-[0.875rem] text-[#636366]">查看先前的每日回報與安全回饋摘要。</p>
          <CrmButton onClick={() => setDailyView("history")} type="button" variant="secondary">
            打開歷史紀錄
          </CrmButton>
        </CrmCard>
      </div>
    );
  }

  return (
    <div className="home-container space-y-4 py-8">
      {formHeader}
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
          />
        ))}
      </CrmCard>

      <CrmCard className="space-y-4">
        <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">其他飲食</h2>
        {(["fourth_meal", "snacks", "drinks"] as const).map((slot) => (
          <MealReportField
            key={slot}
            compact
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
        <h2 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">{dayLabel}狀態</h2>
        <FieldInput
          label="水分 (ml)"
          onChange={(value) => setDraft((current) => ({ ...current, waterMl: value }))}
          value={draft.waterMl}
        />
        <SleepTimeFields
          bedtime={draft.sleepBedtime}
          durationPreview={sleepDurationPreview}
          onBedtimeChange={(value) => setDraft((current) => ({ ...current, sleepBedtime: value }))}
          onWakeTimeChange={(value) => setDraft((current) => ({ ...current, sleepWakeTime: value }))}
          wakeTime={draft.sleepWakeTime}
        />
        <FieldInput
          label="運動"
          onChange={(value) => setDraft((current) => ({ ...current, exerciseNote: value }))}
          value={draft.exerciseNote}
        />
        <FieldInput
          inputMode="numeric"
          label="排便次數"
          onChange={(value) => setDraft((current) => ({ ...current, bowelMovementCount: value }))}
          value={draft.bowelMovementCount}
        />
        <label className="block space-y-2">
          <span className="text-[0.875rem] font-medium text-[#636366]">{dayLabel}心得</span>
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
          送出{dayLabel}回報
        </CrmButton>
      </div>
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

function SleepTimeFields({
  bedtime,
  wakeTime,
  durationPreview,
  onBedtimeChange,
  onWakeTimeChange,
}: {
  bedtime: string;
  wakeTime: string;
  durationPreview: string | null;
  onBedtimeChange: (value: string) => void;
  onWakeTimeChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[0.875rem] font-medium text-[#636366]">睡眠</p>
      <label className="block space-y-2">
        <span className="text-[0.8125rem] text-[#86868b]">入睡時間</span>
        <input
          className="w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
          onChange={(event) => onBedtimeChange(event.target.value)}
          type="time"
          value={bedtime}
        />
      </label>
      <label className="block space-y-2">
        <span className="text-[0.8125rem] text-[#86868b]">起床時間</span>
        <input
          className="w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
          onChange={(event) => onWakeTimeChange(event.target.value)}
          type="time"
          value={wakeTime}
        />
      </label>
      {durationPreview ? (
        <p className="text-[0.875rem] text-[var(--brand-primary-dark)]">約 {durationPreview}</p>
      ) : (
        <p className="text-[0.8125rem] text-[#86868b]">填寫入睡與起床時間後，系統會自動計算睡眠時數。</p>
      )}
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
  compact = false,
}: {
  label: string;
  draft: MealDraft;
  onTextChange: (value: string) => void;
  onPhotoSelect: (file: File | null) => void;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-[1rem] border border-[#eef2ea] p-3">
      <p className="text-[0.9375rem] font-semibold text-[#1d1d1f]">{label}</p>
      <CoachingMealPhotoInput compact={compact} onSelect={onPhotoSelect} uploading={draft.uploading} />
      {draft.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={`${label}預覽`} className="max-h-40 w-full rounded-[0.75rem] object-cover" src={draft.previewUrl} />
      ) : null}
      {draft.uploadError ? <p className="text-[0.875rem] text-[#cf1322]">{draft.uploadError}</p> : null}
      <input
        className="w-full rounded-[1rem] border border-[#e5e5ea] px-4 py-3 text-[1rem]"
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={compact ? "簡短描述（選填）" : "補充文字（選填）"}
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
      previewUrl:
        (meal.photo as { signedUrl?: string | null } | null)?.signedUrl ?? meals[meal.mealSlot].previewUrl,
      uploading: false,
      uploadError: null,
    };
  }

  return {
    waterMl: dailyLog.waterMl != null ? String(dailyLog.waterMl) : "",
    exerciseNote: dailyLog.exerciseNote ?? "",
    bowelMovementCount: dailyLog.bowelMovementCount != null ? String(dailyLog.bowelMovementCount) : "",
    sleepBedtime: dailyLog.sleepBedtime ?? "",
    sleepWakeTime: dailyLog.sleepWakeTime ?? "",
    customerNote: dailyLog.customerNote ?? "",
    meals,
  };
}
