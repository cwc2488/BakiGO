"use client";

import { CoachConsoleView } from "@/components/coaching/CoachConsoleView";
import { buildCoachConsoleView } from "@/lib/coaching/semantics/build-coach-console";
import type { CoachingDailyLogDetail, CoachingMealEntryWithPhoto } from "@/types/coaching";
import type { BodyCompositionRecord } from "@/types/customer";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function meal(slot: CoachingMealEntryWithPhoto["mealSlot"], textNote: string | null): CoachingMealEntryWithPhoto {
  return {
    id: `${slot}-id`,
    dailyLogId: "log-1",
    mealSlot: slot,
    textNote,
    eatenAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    photo: null,
  };
}

function log(overrides: Partial<CoachingDailyLogDetail> = {}): CoachingDailyLogDetail {
  return {
    id: "log-1",
    enrollmentId: "enr-1",
    customerId: "cus-1",
    ownerMemberId: "mem-1",
    logDate: "2026-09-01",
    waterMl: null,
    exerciseNote: null,
    bowelMovementCount: null,
    sleepDuration: null,
    sleepBedtime: null,
    sleepWakeTime: null,
    customerNote: null,
    submittedAt: null,
    createdAt: "2026-09-01T01:00:00.000Z",
    updatedAt: "2026-09-01T01:00:00.000Z",
    meals: [],
    ...overrides,
  };
}

function record(id: string, date: string): BodyCompositionRecord {
  return {
    id,
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
    customerId: "cus-1",
    recordDate: date,
    age: 40,
    weightKg: 125.4,
    skeletalMuscleKg: 40.8,
    bodyFatKg: null,
    bmi: null,
    bodyFatPercent: 43.2,
    visceralFatLevel: null,
    basalMetabolicRate: null,
    bodyAge: null,
  };
}

const afternoon = new Date("2026-09-01T06:00:00.000Z");
const morning = new Date("2026-09-01T02:00:00.000Z");

const CASES: Record<string, ReturnType<typeof buildCoachConsoleView>> = {
  baseline: buildCoachConsoleView({
    dailyLog: null,
    baselineRecord: record("m1", "2026-08-20"),
    latestRecord: record("m1", "2026-08-20"),
    measurementStage: "baseline_only",
    outcomeStatus: "not_yet_measurable",
    now: morning,
  }),
  partial: buildCoachConsoleView({
    dailyLog: log({
      waterMl: 1200,
      customerNote: "我今天早餐喝一杯奶昔、午餐吃蕎麥麵+3顆蛋。目前水喝1200cc",
      meals: [meal("breakfast", "奶昔")],
    }),
    baselineRecord: record("m1", "2026-08-20"),
    latestRecord: record("m1", "2026-08-20"),
    measurementStage: "baseline_only",
    outcomeStatus: "not_yet_measurable",
    now: afternoon,
  }),
  complete: buildCoachConsoleView({
    dailyLog: log({
      waterMl: 2000,
      sleepDuration: "7 小時",
      meals: [meal("breakfast", "奶昔"), meal("lunch", "蕎麥麵+蛋"), meal("dinner", "雞胸＋菜")],
      submittedAt: "2026-09-01T12:00:00.000Z",
    }),
    now: afternoon,
  }),
  none: buildCoachConsoleView({ dailyLog: null, now: morning }),
  trend: buildCoachConsoleView({
    dailyLog: log({
      waterMl: 1800,
      meals: [meal("breakfast", "奶昔"), meal("lunch", "沙拉"), meal("dinner", "雞胸")],
      sleepDuration: "7 小時",
    }),
    baselineRecord: record("m1", "2026-08-20"),
    latestRecord: { ...record("m2", "2026-09-01"), weightKg: 123.1, bodyFatPercent: 41.8, skeletalMuscleKg: 41.2 },
    measurementStage: "comparison_available",
    outcomeStatus: "improving",
    now: afternoon,
  }),
  watertext: buildCoachConsoleView({
    dailyLog: log({
      waterMl: 1200,
      customerNote: "再喝了2000的水",
      meals: [meal("breakfast", "奶昔")],
    }),
    now: morning,
  }),
  feeling: buildCoachConsoleView({
    dailyLog: log({
      customerNote: "今天真的很餓，很難忍",
      meals: [meal("breakfast", "奶昔")],
    }),
    now: morning,
  }),
  question: buildCoachConsoleView({
    dailyLog: log({
      customerNote: "午餐可以吃蕎麥麵嗎？",
      meals: [meal("breakfast", "奶昔")],
      waterMl: 800,
    }),
    now: afternoon,
  }),
};

function PreviewInner() {
  const params = useSearchParams();
  const key = params.get("case") ?? "partial";
  const view = useMemo(() => CASES[key] ?? CASES.partial, [key]);
  return (
    <div className="min-h-dvh bg-[#f2f2f7] px-4 py-5">
      <header className="mb-4 rounded-[1.25rem] bg-white px-4 py-4">
        <h1 className="text-[1.375rem] font-semibold text-[#1d1d1f]">王小美</h1>
        <p className="mt-1 text-[0.9375rem] text-[#636366]">第 12 天</p>
        <p className="mt-0.5 text-[0.8125rem] text-[#86868b]">陪跑日期：2026/08/20 ～ 2026/11/17</p>
      </header>
      <CoachConsoleView view={view} />
    </div>
  );
}

export default function CoachConsolePreviewPage() {
  return (
    <Suspense fallback={<p className="p-6 text-[#86868b]">載入預覽…</p>}>
      <PreviewInner />
    </Suspense>
  );
}
