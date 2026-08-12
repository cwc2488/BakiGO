import type {
  CoachingCustomerVoiceSignal,
  CoachingDailyNutritionAssessment,
  CoachingDailyNutritionAssessmentLevel,
  CoachingMealObservation,
  CoachingMealObservationSignal,
  CoachingSignalEvidence,
} from "@/types/coaching-signals";
import type { CoachingMealPlanContext } from "@/lib/coaching/ai/meal-plan-context";
import { mealSlotAllowsShake } from "@/lib/coaching/ai/meal-plan-context";
import { normalizeMealObservation } from "@/lib/coaching/ai/normalize-meal-observations";

/**
 * Material fat-loss deviations.
 * shake_dominant / shakeObserved alone is an observation, NOT a material deviation.
 */
const MATERIAL_DEVIATION_SIGNALS = new Set<CoachingMealObservationSignal>([
  "fried_food",
  "starch_concentrated",
  "sugary_drink",
  "low_protein",
  "vegetable_low",
  "processed_food",
  "meal_skipped",
]);

const STRONG_DEVIATION_SIGNALS = new Set<CoachingMealObservationSignal>([
  "fried_food",
  "starch_concentrated",
  "sugary_drink",
  "meal_skipped",
]);

const SLOT_LABEL: Record<"breakfast" | "lunch" | "dinner", string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

export const DAILY_NUTRITION_ASSESSMENT_CUSTOMER_LABELS: Record<
  CoachingDailyNutritionAssessmentLevel,
  string
> = {
  on_track: "大致在減脂方向",
  needs_adjustment: "需要調整",
  off_track: "明顯偏離減脂方向",
  insufficient_data: "資料不足，暫不判斷",
};

function evidence(
  key: string,
  value: string | number | boolean | null,
  label?: string,
): CoachingSignalEvidence {
  return label ? { key, value, label } : { key, value };
}

function materialSignals(observation: CoachingMealObservation): CoachingMealObservationSignal[] {
  return observation.signals.filter((signal) => MATERIAL_DEVIATION_SIGNALS.has(signal));
}

function hasStrongDeviation(observation: CoachingMealObservation): boolean {
  return observation.signals.some((signal) => STRONG_DEVIATION_SIGNALS.has(signal));
}

function hasShakeEvidence(observation: CoachingMealObservation): boolean {
  return Boolean(
    observation.shakeObserved ||
      observation.signals.includes("shake_dominant") ||
      observation.observedFoods.some((food) => /奶昔|蛋白飲|代餐/.test(food)),
  );
}

/** Incomplete shake meal for satiety analysis — not a material "bad food" deviation. */
function isIncompleteShakeMeal(observation: CoachingMealObservation): boolean {
  return (
    hasShakeEvidence(observation) &&
    observation.solidFoodObserved !== true &&
    (observation.noOtherFoodVisible === true || observation.signals.includes("shake_dominant"))
  );
}

function hasUsableObservation(observation: CoachingMealObservation): boolean {
  return (
    observation.observedFoods.length > 0 ||
    observation.signals.length > 0 ||
    Boolean(observation.evidenceText?.length) ||
    observation.shakeObserved === true ||
    observation.friedOrHighOilCookingObserved === true
  );
}

/**
 * Deterministic whole-day fat-loss diet direction.
 * Single-meal deviations usually stay on_track; multi-meal accumulation → needs_adjustment+.
 * Plan-approved shakes are not material deviations.
 */
export function assessDailyNutrition(input: {
  mealObservations: CoachingMealObservation[];
  customerVoice?: CoachingCustomerVoiceSignal[];
  planContext?: CoachingMealPlanContext;
}): CoachingDailyNutritionAssessment {
  const observations = input.mealObservations
    .filter(
      (item) =>
        item.mealSlot === "breakfast" || item.mealSlot === "lunch" || item.mealSlot === "dinner",
    )
    .map(normalizeMealObservation);
  const customerVoice = input.customerVoice ?? [];
  const hungerReported = customerVoice.some((item) => item.key === "hunger_reported");
  const planContext = input.planContext;

  const usable = observations.filter(hasUsableObservation);
  if (usable.length === 0) {
    return {
      level: "insufficient_data",
      evidence: [evidence("observation_count", 0, "usable meal observations")],
      reasons: ["今日可用餐點資料不足，先不硬做整日減脂判斷。"],
      positiveFactors: [],
      adjustmentSubjects: [],
      confidence: 0.2,
    };
  }

  const mealsWithMaterial = usable.filter((item) => materialSignals(item).length > 0);
  const strongMealCount = mealsWithMaterial.filter(hasStrongDeviation).length;
  const incompleteShakeMeals = usable.filter(isIncompleteShakeMeal);

  const evidenceItems: CoachingSignalEvidence[] = [];
  const reasons: string[] = [];
  const positiveFactors: string[] = [];
  const adjustmentSubjects: string[] = [];

  for (const observation of usable) {
    const materials = materialSignals(observation);
    for (const signal of materials) {
      evidenceItems.push(
        evidence(`${observation.mealSlot}_signal`, signal, SLOT_LABEL[observation.mealSlot]),
      );
    }
    if (observation.observedFoods.length > 0) {
      evidenceItems.push(
        evidence(
          `${observation.mealSlot}_foods`,
          observation.observedFoods.join(","),
          SLOT_LABEL[observation.mealSlot],
        ),
      );
    }
    if (hasShakeEvidence(observation)) {
      evidenceItems.push(
        evidence(
          `${observation.mealSlot}_shake_observed`,
          true,
          SLOT_LABEL[observation.mealSlot],
        ),
      );
      if (planContext && mealSlotAllowsShake(planContext, observation.mealSlot)) {
        evidenceItems.push(
          evidence(
            `${observation.mealSlot}_shake_plan_aligned`,
            true,
            `${SLOT_LABEL[observation.mealSlot]}奶昔符合方案`,
          ),
        );
      }
    }
    if (materials.length === 0 && observation.observedFoods.length > 0) {
      positiveFactors.push(`${SLOT_LABEL[observation.mealSlot]}未見明顯偏離訊號`);
    }
  }

  let satietyNeedsAttention = false;
  if (hungerReported) {
    evidenceItems.push(evidence("customer_voice", "hunger_reported", "飢餓感受"));
    const compositionRelated =
      incompleteShakeMeals.length > 0 ||
      mealsWithMaterial.some((item) =>
        item.signals.some(
          (signal) =>
            signal === "low_protein" ||
            signal === "vegetable_low" ||
            signal === "starch_concentrated",
        ),
      );
    if (compositionRelated) {
      satietyNeedsAttention = true;
      reasons.push("客戶提到還是會餓，且餐食組成可能與飽足感有關。");
      adjustmentSubjects.push("飽足感與餐食完整度");
    } else {
      reasons.push("客戶提到還是會餓，先接住感受再觀察。");
    }
  }

  for (const observation of mealsWithMaterial) {
    const materials = materialSignals(observation);
    adjustmentSubjects.push(
      `${SLOT_LABEL[observation.mealSlot]}：${materials.join("、")}`,
    );
    reasons.push(
      `${SLOT_LABEL[observation.mealSlot]}出現 ${materials.join("、")}，需要留意。`,
    );
  }

  if (mealsWithMaterial.length >= 2) {
    reasons.unshift("同一天多餐出現偏離減脂方向的訊號，重點是整天累積，不是單一餐定罪。");
  }

  let level: CoachingDailyNutritionAssessmentLevel;
  let confidence: number;

  if (mealsWithMaterial.length >= 3 && strongMealCount >= 2) {
    level = "off_track";
    confidence = 0.82;
  } else if (mealsWithMaterial.length >= 2) {
    level = "needs_adjustment";
    confidence = 0.75;
  } else if (mealsWithMaterial.length === 1) {
    level = "on_track";
    confidence = 0.7;
    reasons.unshift("只有一餐偏離訊號，整天方向仍可維持，先針對該餐微調即可。");
    if (usable.length - mealsWithMaterial.length > 0) {
      positiveFactors.push("其餘餐次未見明顯累積偏離");
    }
  } else {
    level = "on_track";
    confidence = Math.min(0.9, 0.55 + usable.length * 0.1);
    if (positiveFactors.length === 0) {
      positiveFactors.push("目前可見餐次大致符合減脂陪跑方向");
    }
  }

  // Hunger + incomplete shake composition can need satiety coaching without treating shake as "bad food".
  if (satietyNeedsAttention && incompleteShakeMeals.length >= 1 && level === "on_track") {
    level = "needs_adjustment";
    confidence = Math.max(confidence, 0.72);
  }

  if (usable.length === 1) {
    confidence = Math.min(confidence, 0.55);
    if (level === "on_track" && mealsWithMaterial.length === 0) {
      reasons.push("目前只有一餐資料，整日判斷把握較有限。");
    }
  }

  return {
    level,
    evidence: evidenceItems.slice(0, 12),
    reasons: reasons.slice(0, 6),
    positiveFactors: positiveFactors.slice(0, 4),
    adjustmentSubjects: [...new Set(adjustmentSubjects)].slice(0, 6),
    confidence,
  };
}

export function dailyNutritionAssessmentCustomerLabel(
  level: CoachingDailyNutritionAssessmentLevel,
): string {
  return DAILY_NUTRITION_ASSESSMENT_CUSTOMER_LABELS[level];
}
