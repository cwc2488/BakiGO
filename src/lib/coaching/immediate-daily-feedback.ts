/**
 * P0 Layer 1 — Immediate deterministic customer feedback.
 * Compute-on-read from authoritative daily log (+ optional directive reminders).
 * Never calls OpenAI / vision / medical diagnosis.
 */

import { assessBowelMovementSignal } from "@/lib/coaching/ai/bowel-movement-signal";
import { countPrimaryMealsDone, isMealReported } from "@/lib/coaching/coaching-completion";
import type { CoachingDailyLogDetail, CoachingMealEntryWithPhoto } from "@/types/coaching";
import { PRIMARY_MEAL_SLOTS } from "@/types/coaching";

export type ImmediateDailyFeedback = {
  title: string;
  lines: string[];
  primaryMealsDone: number;
  primaryMealsTotal: number;
  waterMl: number | null;
  sleepLabel: string | null;
  exerciseNote: string | null;
  bowelMovementCount: number | null;
};

export type ImmediateDirectiveSignal = {
  mealSlot: string;
  instructionText: string;
  /** Meal slot already has photo or text on the daily log. */
  mealReported: boolean;
};

function sleepCustomerLine(sleepDuration: string | null | undefined): string | null {
  const raw = sleepDuration?.trim();
  if (!raw) return null;
  // Normalize common "7小時" / "7h" / "7 hr"
  if (/小時|hr|h\b/i.test(raw)) {
    return `今天睡眠 ${raw}。`;
  }
  return `今天睡眠 ${raw}。`;
}

function mealCompletionLine(done: number, total: number): string {
  if (done >= total) {
    return "今天三餐都有完成回報 👍";
  }
  if (done === 0) {
    return "今天主要三餐尚未回報，之後補上也很棒。";
  }
  return `今天主要三餐已回報 ${done}/${total}。`;
}

function waterLine(waterMl: number | null): string | null {
  if (waterMl == null || !Number.isFinite(waterMl)) return null;
  return `今天喝水 ${Math.max(0, Math.floor(waterMl))} ml，已經記錄下來。`;
}

function exerciseLine(note: string | null | undefined): string | null {
  const text = note?.trim();
  if (!text) return null;
  return `今天運動：${text}`;
}

function bowelLines(input: {
  bowelMovementCount: number | null | undefined;
  customerNote?: string | null;
  recentCounts?: Array<number | null | undefined>;
}): string[] {
  const count = input.bowelMovementCount;
  if (count == null || !Number.isFinite(count)) return [];

  const lines: string[] = [`今天排便 ${Math.max(0, Math.floor(count))} 次。`];
  const signal = assessBowelMovementSignal({
    todayCount: count,
    recentCounts: input.recentCounts,
    customerNote: input.customerNote,
  });
  if (signal.customerCopy) {
    lines.push(signal.customerCopy);
  } else if (count >= 4) {
    // Defensive — assess should already cover ≥4; keep non-diagnostic tone.
    lines.push("次數較多，可以持續留意身體狀況。");
  }
  return lines;
}

/**
 * Deterministic directive signals without vision:
 * remind when meal for that slot is reported; never assert photo contents.
 */
export function buildImmediateDirectiveLines(
  signals: ImmediateDirectiveSignal[],
): string[] {
  const lines: string[] = [];
  for (const signal of signals) {
    const instruction = signal.instructionText.trim();
    if (!instruction) continue;
    if (signal.mealReported) {
      lines.push(`今天已回報對應餐次，記得完成教練安排：${instruction}`);
    } else {
      lines.push(`教練提醒：${instruction}`);
    }
  }
  return lines;
}

export function buildImmediateDirectiveSignalsFromMeals(input: {
  meals: CoachingMealEntryWithPhoto[];
  directives: Array<{ mealSlot: string; instructionText: string }>;
}): ImmediateDirectiveSignal[] {
  return input.directives.map((directive) => {
    const slot = directive.mealSlot;
    let mealReported = false;
    if (slot === "general") {
      mealReported = PRIMARY_MEAL_SLOTS.some((primary) =>
        isMealReported(input.meals.find((meal) => meal.mealSlot === primary)),
      );
    } else if (slot === "snack") {
      mealReported =
        isMealReported(input.meals.find((meal) => meal.mealSlot === "snacks")) ||
        isMealReported(input.meals.find((meal) => meal.mealSlot === "fourth_meal"));
    } else {
      mealReported = isMealReported(input.meals.find((meal) => meal.mealSlot === slot));
    }
    return {
      mealSlot: slot,
      instructionText: directive.instructionText,
      mealReported,
    };
  });
}

/** Pure compute — safe for submit response, complete page, and portal home. */
export function buildImmediateDailyFeedback(input: {
  dailyLog: Pick<
    CoachingDailyLogDetail,
    | "meals"
    | "waterMl"
    | "sleepDuration"
    | "exerciseNote"
    | "bowelMovementCount"
    | "customerNote"
  >;
  /** Optional recent bowel counts (newest-first, excluding today). */
  recentBowelCounts?: Array<number | null | undefined>;
  /** Customer-visible active directive texts for this day. */
  directiveSignals?: ImmediateDirectiveSignal[];
  /** Extra customer-safe reminder lines already filtered. */
  directiveReminderLines?: string[];
}): ImmediateDailyFeedback {
  const meals = input.dailyLog.meals ?? [];
  const primaryMealsDone = countPrimaryMealsDone(meals);
  const primaryMealsTotal = PRIMARY_MEAL_SLOTS.length;
  const waterMl = input.dailyLog.waterMl ?? null;
  const sleepLabel = input.dailyLog.sleepDuration?.trim() || null;
  const exerciseNote = input.dailyLog.exerciseNote?.trim() || null;
  const bowelMovementCount =
    input.dailyLog.bowelMovementCount != null && Number.isFinite(input.dailyLog.bowelMovementCount)
      ? Math.max(0, Math.floor(input.dailyLog.bowelMovementCount))
      : null;

  const lines: string[] = [];
  lines.push(mealCompletionLine(primaryMealsDone, primaryMealsTotal));

  const water = waterLine(waterMl);
  if (water) lines.push(water);

  const sleep = sleepCustomerLine(sleepLabel);
  if (sleep) lines.push(sleep);

  const exercise = exerciseLine(exerciseNote);
  if (exercise) lines.push(exercise);

  lines.push(
    ...bowelLines({
      bowelMovementCount,
      customerNote: input.dailyLog.customerNote,
      recentCounts: input.recentBowelCounts,
    }),
  );

  if (input.directiveSignals?.length) {
    lines.push(...buildImmediateDirectiveLines(input.directiveSignals));
  } else if (input.directiveReminderLines?.length) {
    for (const reminder of input.directiveReminderLines) {
      const text = reminder.trim();
      if (text) lines.push(text);
    }
  }

  return {
    title: "今日即時回饋",
    lines,
    primaryMealsDone,
    primaryMealsTotal,
    waterMl,
    sleepLabel,
    exerciseNote,
    bowelMovementCount,
  };
}
