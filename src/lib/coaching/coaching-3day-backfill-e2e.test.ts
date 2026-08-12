import { describe, expect, it } from "vitest";
import { fingerprintCoachingGenerationInput } from "@/lib/ai/input-fingerprint";
import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import {
  planDailyCoachGenerationSubmit,
  resolveGenerationOutputMutation,
} from "@/lib/coaching/ai/coaching-generation-submit";
import { nextIncompleteBackfillDate, resolveBackfillContinueTarget } from "@/lib/coaching/coaching-backfill-flow";
import {
  COACHING_DAY_UI_STATUS_LABELS,
  mapCoachingDayUiStatus,
  type CoachingRecentDaySummary,
} from "@/lib/coaching/coaching-day-status";
import { buildCoachingMealPhotoPath, CoachingServiceError } from "@/lib/coaching/coaching-service";
import {
  coachingLogDateOffset,
  coachingRelativeDayLabel,
  coachingTodayLogDate,
  listCoachingBackfillLogDates,
  listCoachingRecentLogDates,
} from "@/lib/coaching/coaching-time";
import { requireAllowedCoachingLogDate } from "@/lib/coaching/require-allowed-coaching-log-date";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import type { CoachingDailyLogDetail, CoachingEnrollment, CoachingMealSlot } from "@/types/coaching";
import type { CoachingAiOutputStatus, CoachingGenerationInput } from "@/types/coaching-ai";

type StoredAiOutput = {
  id: string;
  enrollmentId: string;
  logDate: string;
  status: CoachingAiOutputStatus;
  inputFingerprint: string;
  regenerationCount: number;
  outputJson: { marker: string } | null;
};

type StoredJob = {
  id: string;
  enrollmentId: string;
  logDate: string;
  outputId: string;
  fingerprint: string;
  status: "queued" | "processing" | "completed" | "failed";
};

type StoredMeal = {
  mealSlot: CoachingMealSlot;
  textNote: string | null;
  photoPath: string | null;
};

type StoredDailyLog = {
  id: string;
  enrollmentId: string;
  logDate: string;
  submittedAt: string | null;
  waterMl: number | null;
  customerNote: string | null;
  meals: StoredMeal[];
};

function makeEnrollment(): CoachingEnrollment {
  return {
    id: "enroll-e2e",
    customerId: "cust-e2e",
    ownerMemberId: "member-e2e",
    goal: "健康減脂",
    status: "active",
    startedAt: "2026-07-01T00:00:00.000Z",
    endedAt: null,
    onboardingCompletedAt: "2026-07-01T01:00:00.000Z",
    planSnapshot: cloneDefaultCoachingPlanSnapshot(),
    baselineBodyRecordId: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function toDetail(log: StoredDailyLog): CoachingDailyLogDetail {
  return {
    id: log.id,
    enrollmentId: log.enrollmentId,
    customerId: "cust-e2e",
    ownerMemberId: "member-e2e",
    logDate: log.logDate,
    waterMl: log.waterMl,
    exerciseNote: null,
    bowelMovementCount: 1,
    sleepDuration: "7小時",
    sleepBedtime: "23:00",
    sleepWakeTime: "06:00",
    customerNote: log.customerNote,
    submittedAt: log.submittedAt,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    meals: log.meals.map((meal, index) => ({
      id: `${log.id}-${meal.mealSlot}`,
      dailyLogId: log.id,
      mealSlot: meal.mealSlot,
      textNote: meal.textNote,
      eatenAt: null,
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      photo: meal.photoPath
        ? {
            id: `photo-${index}`,
            mealEntryId: `${log.id}-${meal.mealSlot}`,
            storagePath: meal.photoPath,
            uploadedAt: "2026-08-12T00:00:00.000Z",
            createdAt: "2026-08-12T00:00:00.000Z",
          }
        : null,
    })),
  };
}

function buildGenerationForDay(input: {
  enrollment: CoachingEnrollment;
  logDate: string;
  logsByDate: Map<string, StoredDailyLog>;
}): CoachingGenerationInput {
  const todayStored = input.logsByDate.get(input.logDate);
  if (!todayStored) {
    throw new Error(`missing log for ${input.logDate}`);
  }
  const recentLogs = [...input.logsByDate.values()]
    .map(toDetail)
    .sort((a, b) => b.logDate.localeCompare(a.logDate));

  return buildCoachingGenerationInput({
    enrollment: input.enrollment,
    customer: { displayName: "E2E", heightCm: 165, sex: "female", region: "台北", occupation: "設計師" },
    logDate: input.logDate,
    todayLog: toDetail(todayStored),
    recentLogs,
    bodyRecords: [],
    builtAt: "2026-08-12T12:00:00.000Z",
  });
}

function summarizeDays(
  dates: string[],
  logsByDate: Map<string, StoredDailyLog>,
  aiByDate: Map<string, StoredAiOutput>,
): CoachingRecentDaySummary[] {
  return dates.map((logDate) => {
    const log = logsByDate.get(logDate) ?? null;
    const ai = aiByDate.get(logDate) ?? null;
    const status = mapCoachingDayUiStatus({
      hasLog: Boolean(log),
      submittedAt: log?.submittedAt ?? null,
      aiStatus: ai?.status ?? "missing",
    });
    return {
      logDate,
      relativeKey: null,
      relativeLabel: coachingRelativeDayLabel(logDate),
      shortDate: logDate.slice(5),
      status,
      statusLabel: COACHING_DAY_UI_STATUS_LABELS[status],
      submittedAt: log?.submittedAt ?? null,
      hasLog: Boolean(log),
    };
  });
}

describe("3-day backfill E2E regression", () => {
  // Fixed Taipei calendar: 2026-08-12
  const now = new Date("2026-08-12T02:00:00.000Z");
  const today = coachingTodayLogDate("Asia/Taipei", now);
  const yesterday = coachingLogDateOffset(-1, "Asia/Taipei", now);
  const dayBefore = coachingLogDateOffset(-2, "Asia/Taipei", now);
  const tooOld = coachingLogDateOffset(-3, "Asia/Taipei", now);

  it("backfills 前天→昨天 without touching today's completed AI, and rolling memory sees backfill", () => {
    expect(today).toBe("2026-08-12");
    expect(yesterday).toBe("2026-08-11");
    expect(dayBefore).toBe("2026-08-10");
    expect(listCoachingRecentLogDates("Asia/Taipei", now)).toEqual([today, yesterday, dayBefore]);
    expect(listCoachingBackfillLogDates("Asia/Taipei", now)).toEqual([dayBefore, yesterday, today]);

    const enrollment = makeEnrollment();
    const logsByDate = new Map<string, StoredDailyLog>();
    const aiByDate = new Map<string, StoredAiOutput>();
    const jobs: StoredJob[] = [];

    // Initial: 前天/昨天未回報；今天已送出且 AI completed
    const todayFingerprintSeed = "today-completed-fingerprint-v1";
    logsByDate.set(today, {
      id: "log-today",
      enrollmentId: enrollment.id,
      logDate: today,
      submittedAt: "2026-08-12T01:00:00.000Z",
      waterMl: 2500,
      customerNote: "今天正常",
      meals: [
        {
          mealSlot: "breakfast",
          textNote: "奶昔",
          photoPath: buildCoachingMealPhotoPath({
            customerId: enrollment.customerId,
            enrollmentId: enrollment.id,
            logDate: today,
            mealSlot: "breakfast",
            photoId: "photo-today-bf",
          }),
        },
      ],
    });
    aiByDate.set(today, {
      id: "ai-today",
      enrollmentId: enrollment.id,
      logDate: today,
      status: "completed",
      inputFingerprint: todayFingerprintSeed,
      regenerationCount: 0,
      outputJson: { marker: "today-ai-v1" },
    });

    const todayAiBefore = structuredClone(aiByDate.get(today)!);
    expect(logsByDate.has(yesterday)).toBe(false);
    expect(logsByDate.has(dayBefore)).toBe(false);

    let recent = summarizeDays([today, yesterday, dayBefore], logsByDate, aiByDate);
    expect(recent.find((d) => d.logDate === today)?.status).toBe("ai_ready");
    expect(recent.find((d) => d.logDate === yesterday)?.status).toBe("not_started");
    expect(recent.find((d) => d.logDate === dayBefore)?.status).toBe("not_started");

    // 「補回最近幾天」應先到前天
    expect(nextIncompleteBackfillDate(recent, null, now)).toBe(dayBefore);

    const simulateSubmitAndEnqueue = (logDate: string, note: string, mealNote: string) => {
      requireAllowedCoachingLogDate(logDate);

      const photoPath = buildCoachingMealPhotoPath({
        customerId: enrollment.customerId,
        enrollmentId: enrollment.id,
        logDate,
        mealSlot: "lunch",
        photoId: `photo-${logDate}-lunch`,
      });
      expect(photoPath).toContain(`/${logDate}/`);
      expect(photoPath).not.toContain(`/${today}/lunch/photo-${logDate}`);

      logsByDate.set(logDate, {
        id: `log-${logDate}`,
        enrollmentId: enrollment.id,
        logDate,
        submittedAt: `${logDate}T12:00:00.000Z`,
        waterMl: 1800,
        customerNote: note,
        meals: [{ mealSlot: "lunch", textNote: mealNote, photoPath }],
      });

      // Generation planning is per (enrollment, logDate) — today store entry stays untouched.
      const generationInput = buildGenerationForDay({ enrollment, logDate, logsByDate });
      expect(generationInput.logDate).toBe(logDate);
      expect(generationInput.todayContext.logDate).toBe(logDate);
      expect(generationInput.todayContext.customerNote).toBe(note);

      const fingerprint = fingerprintCoachingGenerationInput(generationInput);
      const existing = aiByDate.get(logDate) ?? null;
      const decision = planDailyCoachGenerationSubmit({
        fingerprint,
        existingOutput: existing,
        activeJobs: jobs
          .filter((job) => job.logDate === logDate && (job.status === "queued" || job.status === "processing"))
          .map((job) => ({ inputFingerprint: job.fingerprint, status: job.status })),
      });
      expect(decision.action).toBe("enqueue");

      const mutation = resolveGenerationOutputMutation(decision, fingerprint);
      expect(mutation).not.toBeNull();

      const outputId = `ai-${logDate}`;
      aiByDate.set(logDate, {
        id: outputId,
        enrollmentId: enrollment.id,
        logDate,
        status: "pending",
        inputFingerprint: fingerprint,
        regenerationCount: mutation!.regenerationCount,
        outputJson: null,
      });
      jobs.push({
        id: `job-${logDate}`,
        enrollmentId: enrollment.id,
        logDate,
        outputId,
        fingerprint,
        status: "queued",
      });

      // Complete this day's AI independently.
      const row = aiByDate.get(logDate)!;
      row.status = "completed";
      row.outputJson = { marker: `${logDate}-ai` };
      const job = jobs.find((item) => item.logDate === logDate)!;
      job.status = "completed";

      return { fingerprint, generationInput };
    };

    // 1) 補前天
    const dayBeforeResult = simulateSubmitAndEnqueue(dayBefore, "前天補登", "炒麵");
    recent = summarizeDays([today, yesterday, dayBefore], logsByDate, aiByDate);
    expect(recent.find((d) => d.logDate === dayBefore)?.status).toBe("ai_ready");

    // 今天 AI / fingerprint 不變
    expect(aiByDate.get(today)).toEqual(todayAiBefore);
    expect(aiByDate.get(today)?.outputJson).toEqual({ marker: "today-ai-v1" });
    expect(aiByDate.get(today)?.inputFingerprint).toBe(todayFingerprintSeed);

    // 三天 logs 獨立
    expect(logsByDate.get(dayBefore)?.id).toBe(`log-${dayBefore}`);
    expect(logsByDate.get(today)?.id).toBe("log-today");
    expect(logsByDate.get(dayBefore)?.meals[0]?.photoPath).toContain(`/${dayBefore}/lunch/`);
    expect(logsByDate.get(today)?.meals[0]?.photoPath).toContain(`/${today}/breakfast/`);

    // 補完前天 → 繼續補下一天 = 昨天
    const afterDayBefore = resolveBackfillContinueTarget({
      recentDays: recent,
      afterLogDate: dayBefore,
      backfillActive: true,
      now,
    });
    expect(afterDayBefore).toEqual({ logDate: yesterday, kind: "incomplete" });
    expect(coachingRelativeDayLabel(afterDayBefore!.logDate, "Asia/Taipei", now)).toBe("昨天");

    // 2) 補昨天
    const yesterdayResult = simulateSubmitAndEnqueue(yesterday, "昨天補登", "便當");
    recent = summarizeDays([today, yesterday, dayBefore], logsByDate, aiByDate);
    expect(recent.find((d) => d.logDate === yesterday)?.status).toBe("ai_ready");

    // AI outputs 不互相覆蓋（各自 log_date key）
    expect(aiByDate.get(dayBefore)?.id).toBe(`ai-${dayBefore}`);
    expect(aiByDate.get(yesterday)?.id).toBe(`ai-${yesterday}`);
    expect(aiByDate.get(today)?.id).toBe("ai-today");
    expect(aiByDate.get(dayBefore)?.outputJson).toEqual({ marker: `${dayBefore}-ai` });
    expect(aiByDate.get(yesterday)?.outputJson).toEqual({ marker: `${yesterday}-ai` });
    expect(aiByDate.get(today)?.outputJson).toEqual({ marker: "today-ai-v1" });
    expect(dayBeforeResult.fingerprint).not.toBe(yesterdayResult.fingerprint);
    expect(dayBeforeResult.fingerprint).not.toBe(todayFingerprintSeed);

    // Jobs 各自 log_date
    expect(jobs.map((job) => job.logDate).sort()).toEqual([dayBefore, yesterday].sort());
    expect(jobs.every((job) => job.enrollmentId === enrollment.id)).toBe(true);

    // 補完昨天 → 前往今天（即使今天已 AI completed）
    const afterYesterday = resolveBackfillContinueTarget({
      recentDays: recent,
      afterLogDate: yesterday,
      backfillActive: true,
      now,
    });
    expect(afterYesterday).toEqual({ logDate: today, kind: "sequence" });
    expect(coachingRelativeDayLabel(afterYesterday!.logDate, "Asia/Taipei", now)).toBe("今天");
    expect(listCoachingRecentLogDates("Asia/Taipei", now)[0]).toBe(today);

    // 今天仍完整不變
    expect(aiByDate.get(today)).toEqual(todayAiBefore);

    // Rolling memory：對「下一次 generation」（例如再生成今天）可讀到補登資料
    const nextTodayGeneration = buildGenerationForDay({
      enrollment,
      logDate: today,
      logsByDate,
    });
    const rollingDates = nextTodayGeneration.rollingMemory.recentDays.map((day) => day.logDate);
    expect(rollingDates).toContain(dayBefore);
    expect(rollingDates).toContain(yesterday);
    expect(rollingDates).toContain(today);
    const backfilledNotes = nextTodayGeneration.rollingMemory.recentDays.map((day) => day.customerNote);
    expect(backfilledNotes).toContain("前天補登");
    expect(backfilledNotes).toContain("昨天補登");

    // Same-fingerprint today still skips regenerate
    const todayDecision = planDailyCoachGenerationSubmit({
      fingerprint: todayFingerprintSeed,
      existingOutput: aiByDate.get(today)!,
      activeJobs: [],
    });
    expect(todayDecision).toEqual({ action: "skip", reason: "same_fingerprint_completed" });
  });

  it("rejects dates older than 前天 with 400", () => {
    expect(() => requireAllowedCoachingLogDate(tooOld)).toThrow(CoachingServiceError);
    try {
      requireAllowedCoachingLogDate(tooOld);
    } catch (error) {
      expect(error).toBeInstanceOf(CoachingServiceError);
      expect((error as CoachingServiceError).status).toBe(400);
      expect((error as CoachingServiceError).message).toMatch(/最近 3 天/);
    }
  });
});
