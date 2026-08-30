import type {
  Go21DailyStatePublicView,
  Go21DailyTargetsPublicView,
  Go21EstimateConfidence,
} from "@/types/go21";
import {
  aggregateDayNutritionEstimates,
  estimateMealNutritionBand,
} from "@/lib/go21/meal-estimate";
import { parseSleepDurationLabelToMinutes } from "@/lib/coaching/coaching-sleep";

export type Go21DailyStateInput = {
  logDate: string;
  targets: Go21DailyTargetsPublicView | null;
  waterMl: number | null;
  hydrationQuality?: "low" | "high" | null;
  sleepBedtime: string | null;
  sleepWakeTime: string | null;
  sleepDurationLabel: string | null;
  sleepHoursReported?: number | null;
  sleepNote?: string | null;
  meals: Array<{
    slot: string;
    note: string | null;
    hasPhoto?: boolean;
    visionSummary?: string | null;
    signals?: string[];
  }>;
};

/**
 * Build today's lightweight daily state for portal UI + AI context.
 * Progress cues are soft — never invent precise remaining macros.
 */
export function buildGo21DailyState(input: Go21DailyStateInput): Go21DailyStatePublicView {
  const mealBands = input.meals
    .map((m) =>
      estimateMealNutritionBand({
        note: m.note,
        visionSummary: m.visionSummary,
        signals: m.signals,
        hasPhoto: m.hasPhoto,
      }),
    )
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
  const nutrition = aggregateDayNutritionEstimates(mealBands);

  const sleepFromLabel = (() => {
    const mins = parseSleepDurationLabelToMinutes(input.sleepDurationLabel);
    return mins != null ? Math.round((mins / 60) * 10) / 10 : null;
  })();
  const sleepHours =
    input.sleepHoursReported ??
    sleepFromLabel ??
    hoursFromBedWake(input.sleepBedtime, input.sleepWakeTime);

  const waterConfidence: Go21EstimateConfidence =
    input.waterMl != null ? "reported" : input.hydrationQuality ? "low" : "none";

  const sleepConfidence: Go21EstimateConfidence =
    sleepHours != null
      ? input.sleepHoursReported != null || input.sleepDurationLabel
        ? "reported"
        : "medium"
      : input.sleepNote
        ? "low"
        : "none";

  const calConfidence: Go21EstimateConfidence =
    nutrition.confidence === "none" ? "none" : nutrition.confidence;
  const proConfidence: Go21EstimateConfidence = calConfidence;

  const cues: Go21DailyStatePublicView["cues"] = [];
  const t = input.targets;

  if (t?.waterMl != null && input.waterMl != null) {
    const ratio = input.waterMl / t.waterMl;
    if (ratio < 0.4) {
      cues.push({ key: "water", tone: "soft", label: "水偏少" });
    } else if (ratio >= 0.9) {
      cues.push({ key: "water", tone: "quiet", label: "水差不多了" });
    }
  } else if (input.hydrationQuality === "low") {
    cues.push({ key: "water", tone: "soft", label: "水偏少" });
  }

  if (t?.proteinG != null && nutrition.proteinMid != null && proConfidence !== "none") {
    if (nutrition.proteinHigh != null && nutrition.proteinHigh < t.proteinG * 0.55) {
      cues.push({ key: "protein", tone: "soft", label: "蛋白質偏少" });
    } else if (nutrition.proteinLow != null && nutrition.proteinLow >= t.proteinG * 0.85) {
      cues.push({ key: "protein", tone: "quiet", label: "蛋白質還可以" });
    }
  }

  if (t?.caloriesKcal != null && nutrition.caloriesMid != null && calConfidence !== "none") {
    if (nutrition.caloriesLow != null && nutrition.caloriesLow > t.caloriesKcal * 1.15) {
      cues.push({ key: "calories", tone: "attention", label: "熱量偏多" });
    } else if (
      !nutrition.incomplete &&
      nutrition.caloriesHigh != null &&
      nutrition.caloriesHigh < t.caloriesKcal * 0.7
    ) {
      cues.push({ key: "calories", tone: "quiet", label: "熱量還有空間" });
    }
  }

  if (t?.sleepHours != null && sleepHours != null) {
    if (sleepHours + 0.4 < t.sleepHours) {
      cues.push({ key: "sleep", tone: "soft", label: "睡眠偏少" });
    } else if (sleepHours >= t.sleepHours - 0.25) {
      cues.push({ key: "sleep", tone: "quiet", label: "睡眠還行" });
    }
  } else if (sleepHours != null && sleepHours < 5.5) {
    cues.push({ key: "sleep", tone: "attention", label: "睡很少" });
  }

  return {
    logDate: input.logDate,
    targets: t,
    water: {
      ml: input.waterMl,
      confidence: waterConfidence,
      qualitative: input.hydrationQuality ?? null,
    },
    calories: {
      approxKcal: nutrition.caloriesMid,
      rangeLow: nutrition.caloriesLow,
      rangeHigh: nutrition.caloriesHigh,
      confidence: calConfidence,
    },
    protein: {
      approxG: nutrition.proteinMid,
      rangeLow: nutrition.proteinLow,
      rangeHigh: nutrition.proteinHigh,
      confidence: proConfidence,
    },
    sleep: {
      hours: sleepHours,
      bedtime: input.sleepBedtime,
      wakeTime: input.sleepWakeTime,
      confidence: sleepConfidence,
      note: input.sleepNote ?? null,
    },
    cues: cues.slice(0, 3),
  };
}

/** Compact AI block — internal judgment aid, not a customer report. */
export function compactGo21DailyStateForAi(state: Go21DailyStatePublicView): {
  logDate: string;
  targets: {
    waterMl: number | null;
    caloriesKcal: number | null;
    proteinG: number | null;
    sleepHours: number | null;
  } | null;
  approxToday: {
    waterMl: number | null;
    waterConfidence: string;
    caloriesKcal: number | null;
    caloriesRange: [number, number] | null;
    caloriesConfidence: string;
    proteinG: number | null;
    proteinRange: [number, number] | null;
    proteinConfidence: string;
    sleepHours: number | null;
    sleepConfidence: string;
    sleepNote: string | null;
  };
  softCues: string[];
  guidance: string;
} {
  return {
    logDate: state.logDate,
    targets: state.targets
      ? {
          waterMl: state.targets.waterMl,
          caloriesKcal: state.targets.caloriesKcal,
          proteinG: state.targets.proteinG,
          sleepHours: state.targets.sleepHours,
        }
      : null,
    approxToday: {
      waterMl: state.water.ml,
      waterConfidence: state.water.confidence,
      caloriesKcal: state.calories.approxKcal,
      caloriesRange:
        state.calories.rangeLow != null && state.calories.rangeHigh != null
          ? [state.calories.rangeLow, state.calories.rangeHigh]
          : null,
      caloriesConfidence: state.calories.confidence,
      proteinG: state.protein.approxG,
      proteinRange:
        state.protein.rangeLow != null && state.protein.rangeHigh != null
          ? [state.protein.rangeLow, state.protein.rangeHigh]
          : null,
      proteinConfidence: state.protein.confidence,
      sleepHours: state.sleep.hours,
      sleepConfidence: state.sleep.confidence,
      sleepNote: state.sleep.note,
    },
    softCues: state.cues.map((c) => c.label),
    guidance:
      "Use dailyTargetsState for judgment only. Do not nag remaining kcal/g/ml. If customer asks what to eat and protein is behind, one soft protein cue is enough. If sleep was short and cravings are high, sleep may explain appetite — say so briefly. Photo estimates are uncertain — never pretend precision.",
  };
}

function hoursFromBedWake(bed: string | null, wake: string | null): number | null {
  if (!bed || !wake) return null;
  const b = parseHm(bed);
  const w = parseHm(wake);
  if (b == null || w == null) return null;
  let diff = w - b;
  if (diff <= 0) diff += 24 * 60;
  const hours = diff / 60;
  if (hours < 3 || hours > 14) return null;
  return Math.round(hours * 10) / 10;
}

function parseHm(value: string): number | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}
