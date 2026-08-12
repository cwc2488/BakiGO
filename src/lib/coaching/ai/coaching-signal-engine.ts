import { parseClockTimeToMinutes } from "@/lib/coaching/coaching-sleep";
import type {
  CoachingCoachDirectivesMemory,
  CoachingGenerationInput,
  CoachingInterventionLevel,
  CoachingOutcomeMemory,
  CoachingRollingMemory,
} from "@/types/coaching-ai";
import type { CoachingPlanSnapshot as PlanSnapshot } from "@/types/coaching";
import type {
  CoachingCoachAttentionDecision,
  CoachingDecisionContext,
  CoachingIssue,
  CoachingMealObservation,
  CoachingMealObservationSignal,
  CoachingPriority,
  CoachingSignal,
  CoachingSignalEvidence,
  CoachingSignalSeverity,
  CoachingTomorrowFocusContract,
} from "@/types/coaching-signals";

const PRIMARY_SLOTS = ["breakfast", "lunch", "dinner"] as const;

const MEAL_SIGNAL_PRIORITY_WEIGHT: Record<CoachingMealObservationSignal, number> = {
  meal_skipped: 520,
  low_protein: 510,
  sugary_drink: 505,
  shake_dominant: 435,
  fried_food: 430,
  starch_concentrated: 425,
  processed_food: 410,
  high_sauce: 200,
  vegetable_low: 180,
};

const SINGLE_MEAL_DEVIATION_KEYS = new Set([
  "meal_sugary_drink",
  "meal_low_protein",
  "meal_fried_food",
  "meal_high_sauce",
  "meal_processed_food",
  "meal_vegetable_low",
  "meal_meal_skipped",
  "meal_shake_dominant",
  "meal_starch_concentrated",
]);

function evidence(
  key: string,
  value: string | number | boolean | null,
  label?: string,
): CoachingSignalEvidence {
  return label ? { key, value, label } : { key, value };
}

function signal(input: Omit<CoachingSignal, "confidence"> & { confidence?: CoachingSignal["confidence"] }): CoachingSignal {
  return {
    ...input,
    confidence: input.confidence ?? "deterministic",
  };
}

function isAfterMidnightBedtime(time: string | null | undefined): boolean {
  const minutes = time ? parseClockTimeToMinutes(time) : null;
  if (minutes == null) {
    return false;
  }
  return minutes < 6 * 60;
}

function extractHydrationTargetMl(
  planSnapshot: PlanSnapshot | null | undefined,
  coachDirectives: CoachingCoachDirectivesMemory | null | undefined,
): number | null {
  const corpus = [
    ...(planSnapshot?.dailyInstructions.hydration ?? []),
    coachDirectives?.coachInstruction ?? "",
    coachDirectives?.currentFocus ?? "",
    coachDirectives?.currentPriority ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const match = corpus.match(/(\d{3,4})\s*(ml|毫升|c\.?c\.?)/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function mealSignalKey(slot: string, kind: CoachingMealObservationSignal): string {
  return `meal_${kind}_${slot}`;
}

function buildReportingSignals(input: CoachingGenerationInput): CoachingSignal[] {
  const today = input.todayContext;
  const reported = today.primaryMeals.filter((meal) => Boolean(meal.textNote?.trim()) || Boolean(meal.storagePath));
  const reportedCount = PRIMARY_SLOTS.filter((slot) =>
    reported.some((meal) => meal.mealSlot === slot),
  ).length;

  const signals: CoachingSignal[] = [];
  if (reportedCount === PRIMARY_SLOTS.length) {
    signals.push(
      signal({
        key: "complete_primary_meal_reporting",
        category: "reporting",
        severity: "positive",
        source: "today",
        evidence: [
          evidence("primary_meals_reported", reportedCount),
          evidence("primary_meals_total", PRIMARY_SLOTS.length),
          evidence("log_date", today.logDate),
        ],
      }),
    );
  } else if (today.submitted || reportedCount > 0) {
    signals.push(
      signal({
        key: "incomplete_primary_meal_reporting",
        category: "reporting",
        severity: "minor",
        source: "today",
        evidence: [
          evidence("primary_meals_reported", reportedCount),
          evidence("primary_meals_total", PRIMARY_SLOTS.length),
          evidence(
            "missing_slots",
            PRIMARY_SLOTS.filter((slot) => !reported.some((meal) => meal.mealSlot === slot)).join(","),
          ),
        ],
      }),
    );
  }

  if (input.rollingMemory.recurringPatterns.includes("submission_inconsistent")) {
    signals.push(
      signal({
        key: "submission_inconsistent",
        category: "reporting",
        severity: "minor",
        source: "rolling",
        evidence: [
          evidence("days_submitted", input.rollingMemory.aggregates.daysSubmitted),
          evidence("window_days", input.rollingMemory.aggregates.windowDays),
          evidence("days_with_report", input.rollingMemory.aggregates.daysWithReport),
        ],
      }),
    );
  }

  return signals;
}

function classifyLateSleepPatternSeverity(rolling: CoachingRollingMemory): CoachingSignalSeverity {
  const afterMidnightDays = rolling.recentDays.filter((day) => isAfterMidnightBedtime(day.sleepBedtime)).length;
  const avgSleep = rolling.aggregates.averageSleepDurationMinutes;
  const lateSleepDays = rolling.aggregates.lateSleepDays;

  if (afterMidnightDays >= 2 || (lateSleepDays >= 3 && avgSleep != null && avgSleep < 7 * 60)) {
    return afterMidnightDays >= 3 || (avgSleep != null && avgSleep < 6.5 * 60) ? "high" : "moderate";
  }

  // Soft late (e.g. 23:00) across short windows — observable but not priority-worthy alone.
  if (lateSleepDays >= 3) {
    return "minor";
  }
  return "minor";
}

function buildSleepSignals(input: CoachingGenerationInput): CoachingSignal[] {
  const signals: CoachingSignal[] = [];
  const todayBed = input.todayContext.sleepBedtime;
  const aggregates = input.rollingMemory.aggregates;
  const recent = input.rollingMemory.recentDays;

  if (
    todayBed &&
    (((parseClockTimeToMinutes(todayBed) ?? -1) >= 23 * 60) || isAfterMidnightBedtime(todayBed))
  ) {
    const severity: CoachingSignalSeverity = isAfterMidnightBedtime(todayBed) ? "moderate" : "minor";
    signals.push(
      signal({
        key: "late_sleep_today",
        category: "sleep",
        severity,
        source: "today",
        evidence: [
          evidence("sleep_bedtime", todayBed),
          evidence("sleep_wake_time", input.todayContext.sleepWakeTime),
          evidence("sleep_duration_minutes", input.todayContext.sleepDurationMinutes),
          evidence("after_midnight", isAfterMidnightBedtime(todayBed)),
        ],
      }),
    );
  }

  if (aggregates.lateSleepDays >= 3 || input.rollingMemory.recurringPatterns.includes("late_sleep_pattern")) {
    const severity = classifyLateSleepPatternSeverity(input.rollingMemory);
    signals.push(
      signal({
        key: "late_sleep_pattern",
        category: "sleep",
        severity,
        source: "rolling",
        evidence: [
          evidence("late_sleep_days", aggregates.lateSleepDays, "late_sleep_days"),
          evidence("observed_days", aggregates.daysWithReport, "observed_days"),
          evidence(
            "after_midnight_recent_days",
            recent.filter((day) => isAfterMidnightBedtime(day.sleepBedtime)).length,
          ),
          evidence("average_sleep_duration_minutes", aggregates.averageSleepDurationMinutes),
          evidence("window_days", aggregates.windowDays),
        ],
      }),
    );
  }

  const olderLate = recent.slice(1).filter((day) => {
    const minutes = day.sleepBedtime ? parseClockTimeToMinutes(day.sleepBedtime) : null;
    return minutes != null && (minutes >= 23 * 60 || minutes < 6 * 60);
  }).length;
  const todayNotLate =
    todayBed != null &&
    !(
      ((parseClockTimeToMinutes(todayBed) ?? -1) >= 23 * 60) ||
      isAfterMidnightBedtime(todayBed)
    );
  if (olderLate >= 1 && todayNotLate) {
    signals.push(
      signal({
        key: "sleep_improved",
        category: "sleep",
        severity: "positive",
        source: "rolling",
        evidence: [
          evidence("today_sleep_bedtime", todayBed),
          evidence("prior_late_sleep_days_in_recent", olderLate),
        ],
      }),
    );
  }

  return signals;
}

function buildExerciseSignals(input: CoachingGenerationInput): CoachingSignal[] {
  const signals: CoachingSignal[] = [];
  const exerciseNote = input.todayContext.exerciseNote?.trim() || null;
  if (exerciseNote) {
    signals.push(
      signal({
        key: "exercised_today",
        category: "exercise",
        severity: "positive",
        source: "today",
        evidence: [evidence("exercise_note", exerciseNote), evidence("log_date", input.todayContext.logDate)],
      }),
    );
  }

  if (
    input.rollingMemory.recurringPatterns.includes("exercise_infrequent") ||
    (input.rollingMemory.aggregates.exerciseDays <= 1 && input.rollingMemory.aggregates.daysWithReport >= 5)
  ) {
    signals.push(
      signal({
        key: "exercise_infrequent",
        category: "exercise",
        severity: "minor",
        source: "rolling",
        evidence: [
          evidence("exercise_days", input.rollingMemory.aggregates.exerciseDays),
          evidence("days_with_report", input.rollingMemory.aggregates.daysWithReport),
        ],
      }),
    );
  }

  return signals;
}

function buildHydrationSignals(
  input: CoachingGenerationInput,
  planSnapshot: PlanSnapshot,
): CoachingSignal[] {
  const targetMl = extractHydrationTargetMl(planSnapshot, input.coachDirectives);
  const waterMl = input.todayContext.waterMl;
  if (targetMl == null || waterMl == null) {
    // Observed water is never treated as a target.
    return [];
  }

  if (waterMl >= targetMl) {
    return [
      signal({
        key: "hydration_met_plan",
        category: "hydration",
        severity: "positive",
        source: "today",
        evidence: [
          evidence("water_ml_observed", waterMl),
          evidence("water_ml_target", targetMl),
          evidence("target_source", "plan_or_directive"),
        ],
      }),
    ];
  }

  return [
    signal({
      key: "hydration_below_plan",
      category: "hydration",
      severity: waterMl < targetMl * 0.7 ? "moderate" : "minor",
      source: "today",
      evidence: [
        evidence("water_ml_observed", waterMl),
        evidence("water_ml_target", targetMl),
        evidence("target_source", "plan_or_directive"),
      ],
    }),
  ];
}

function buildBodyTrendSignals(outcome: CoachingOutcomeMemory): CoachingSignal[] {
  if (!outcome.baselineMeasurement || !outcome.latestMeasurement) {
    return [];
  }
  if (outcome.baselineMeasurement.recordDate === outcome.latestMeasurement.recordDate) {
    return [];
  }

  const weight = outcome.trendDeltas.find((item) => item.label === "體重");
  const bodyFat = outcome.trendDeltas.find((item) => item.label === "體脂率");
  const muscle = outcome.trendDeltas.find((item) => item.label === "骨骼肌");

  // Require more than weight alone.
  const supportingMetrics = [bodyFat, muscle].filter(Boolean);
  if (!weight || supportingMetrics.length === 0) {
    return [];
  }

  const evidenceBase: CoachingSignalEvidence[] = [
    evidence("days_between_measurements", outcome.daysBetweenMeasurements),
    evidence("weight_delta", weight.delta),
    evidence("body_fat_delta", bodyFat?.delta ?? null),
    evidence("muscle_delta", muscle?.delta ?? null),
    evidence("trend_summary", outcome.trendSummary),
  ];

  const improving =
    weight.delta <= -0.3 &&
    (bodyFat == null || bodyFat.delta <= 0.2) &&
    (muscle == null || muscle.delta >= -0.2);
  const worsening =
    weight.delta >= 0.3 &&
    ((bodyFat != null && bodyFat.delta > 0.2) || (muscle != null && muscle.delta < -0.2));
  const flat = outcome.trendDeltas.every((item) => Math.abs(item.delta) < 0.2);

  if (improving) {
    return [
      signal({
        key: "body_trend_improving",
        category: "body_trend",
        severity: "positive",
        source: "body",
        evidence: evidenceBase,
      }),
    ];
  }
  if (worsening) {
    return [
      signal({
        key: "body_trend_worsening",
        category: "body_trend",
        severity: "moderate",
        source: "body",
        evidence: evidenceBase,
      }),
    ];
  }
  if (flat || outcome.trendDeltas.length > 0) {
    return [
      signal({
        key: "body_trend_flat",
        category: "body_trend",
        severity: "minor",
        source: "body",
        evidence: evidenceBase,
      }),
    ];
  }
  return [];
}

function buildCoachDirectiveSignals(directives: CoachingCoachDirectivesMemory | null): CoachingSignal[] {
  if (!directives) {
    return [];
  }
  const text = [directives.currentPriority, directives.currentFocus, directives.coachInstruction]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join(" / ");
  if (!text) {
    return [];
  }
  return [
    signal({
      key: "coach_directive_active",
      category: "coach_directive",
      severity: "high",
      source: "coach_directive",
      evidence: [
        evidence("current_priority", directives.currentPriority),
        evidence("current_focus", directives.currentFocus),
        evidence("coach_instruction", directives.coachInstruction),
        evidence("effective_from", directives.effectiveFrom),
      ],
    }),
  ];
}

function buildMealObservationSignals(observations: CoachingMealObservation[]): CoachingSignal[] {
  const signals: CoachingSignal[] = [];
  for (const observation of observations) {
    for (const kind of observation.signals) {
      // Never invent a positive signal for skipped meal + water.
      signals.push(
        signal({
          key: mealSignalKey(observation.mealSlot, kind),
          category: "meal",
          severity: kind === "high_sauce" || kind === "vegetable_low" ? "minor" : "moderate",
          source: "today",
          confidence: "vision_assisted",
          evidence: [
            evidence("meal_slot", observation.mealSlot),
            evidence("observation_signal", kind),
            evidence("observed_foods", observation.observedFoods.join(", ") || null),
            evidence("shake_observed", observation.shakeObserved ?? null),
            evidence("no_other_food_visible", observation.noOtherFoodVisible ?? null),
            evidence("follow_up_question", observation.followUpQuestion ?? null),
            ...observation.evidenceText.map((text, index) => evidence(`evidence_text_${index + 1}`, text)),
            ...(observation.uncertainties ?? []).map((text, index) => evidence(`uncertainty_${index + 1}`, text)),
          ],
        }),
      );
    }
  }
  return signals;
}

function buildCustomerVoiceCoachingSignals(
  voices: import("@/types/coaching-signals").CoachingCustomerVoiceSignal[],
): CoachingSignal[] {
  return voices.map((voice) =>
    signal({
      key: `customer_voice_${voice.key}`,
      category: "customer_voice",
      severity: voice.key === "hunger_reported" ? "moderate" : "moderate",
      source: "today",
      confidence: "deterministic",
      evidence: voice.evidence,
    }),
  );
}

export function collectCoachingSignals(input: {
  generationInput: CoachingGenerationInput;
  mealObservations?: CoachingMealObservation[];
  customerVoice?: import("@/types/coaching-signals").CoachingCustomerVoiceSignal[];
}): CoachingSignal[] {
  const { generationInput, mealObservations = [], customerVoice = [] } = input;
  const planSnapshot = generationInput.profileMemory.planSnapshot;

  return [
    ...buildReportingSignals(generationInput),
    ...buildSleepSignals(generationInput),
    ...buildExerciseSignals(generationInput),
    ...buildHydrationSignals(generationInput, planSnapshot),
    ...buildBodyTrendSignals(generationInput.outcomeMemory),
    ...buildCoachDirectiveSignals(generationInput.coachDirectives),
    ...buildMealObservationSignals(mealObservations),
    ...buildCustomerVoiceCoachingSignals(customerVoice),
  ];
}

function severityRank(severity: CoachingSignalSeverity): number {
  switch (severity) {
    case "high":
      return 4;
    case "moderate":
      return 3;
    case "minor":
      return 2;
    case "positive":
      return 1;
    default:
      return 0;
  }
}

function mealPriorityReason(signalKey: string): { reason: string; subject: string } | null {
  if (signalKey.includes("low_protein")) {
    return { reason: "早餐蛋白質", subject: "早餐蛋白質" };
  }
  if (signalKey.includes("sugary_drink")) {
    return { reason: "含糖飲料替代", subject: "含糖飲料替代" };
  }
  if (signalKey.includes("meal_skipped")) {
    return { reason: "補上可完成的早餐", subject: "早餐最低版本" };
  }
  if (signalKey.includes("shake_dominant")) {
    return { reason: "確認奶昔餐是否有搭配", subject: "確認奶昔餐搭配" };
  }
  if (signalKey.includes("starch_concentrated") || signalKey.includes("fried_food")) {
    return { reason: "主食份量收一點、補肉蛋青菜", subject: "炒飯份量與搭配" };
  }
  if (signalKey.includes("processed_food")) {
    return { reason: "減少高油／加工選項", subject: "減少高油加工" };
  }
  if (signalKey.includes("high_sauce")) {
    return { reason: "減少醬料", subject: "減少醬料" };
  }
  if (signalKey.includes("vegetable_low")) {
    return { reason: "增加蔬菜", subject: "增加蔬菜" };
  }
  return null;
}

function candidateScore(item: CoachingSignal): { score: number; reason: string; subject: string } | null {
  if (item.severity === "positive") {
    return null;
  }

  if (item.key === "coach_directive_active") {
    return {
      score: 1000,
      reason: "教練指定重點",
      subject: String(item.evidence.find((e) => e.key === "current_priority")?.value ?? "教練指定重點"),
    };
  }

  if (item.key === "late_sleep_pattern") {
    if (item.severity === "minor") {
      return null;
    }
    return {
      score: item.severity === "high" ? 820 : 700,
      reason: "晚睡模式",
      subject: "睡眠往前",
    };
  }

  if (item.key === "late_sleep_today" && item.severity !== "minor") {
    return { score: 420, reason: "今晚偏晚睡", subject: "今晚提早躺床" };
  }

  if (item.key.startsWith("meal_")) {
    const kind = item.evidence.find((e) => e.key === "observation_signal")?.value;
    if (typeof kind !== "string") {
      return null;
    }
    const mealMeta = mealPriorityReason(item.key);
    if (!mealMeta) {
      return null;
    }
    const weight = MEAL_SIGNAL_PRIORITY_WEIGHT[kind as CoachingMealObservationSignal] ?? 250;
    // Minor meal issues stay below actionable threshold unless no stronger candidates.
    if (weight < 400 && item.severity === "minor") {
      return { score: weight, reason: mealMeta.reason, subject: mealMeta.subject };
    }
    return { score: weight, reason: mealMeta.reason, subject: mealMeta.subject };
  }

  if (item.key === "hydration_below_plan" && item.severity !== "minor") {
    return { score: 450, reason: "水分未達計畫", subject: "依計畫補水" };
  }

  if (item.key === "customer_voice_hunger_reported") {
    return { score: 470, reason: "你說還是會餓", subject: "找出比較有飽足感的吃法" };
  }

  if (item.key.startsWith("customer_voice_")) {
    return { score: 460, reason: "回應你今天的感受", subject: "回應你今天提到的狀況" };
  }

  if (item.key === "body_trend_worsening") {
    return { score: 480, reason: "身體組成走勢需關注", subject: "身體組成觀察" };
  }

  // submission_inconsistent / incomplete reporting / soft late sleep / exercise infrequent:
  // signals only — not auto-priorities.
  return null;
}

export function rankCoachingPriorities(signals: CoachingSignal[]): CoachingPriority[] {
  const actionable = signals
    .map((item) => {
      const scored = candidateScore(item);
      if (!scored) {
        return null;
      }
      return { item, ...scored };
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((left, right) => right.score - left.score || severityRank(right.item.severity) - severityRank(left.item.severity));

  // Only keep candidates that clear the actionable bar (skip pure minor optimizations).
  const selected = actionable.filter((item) => item.score >= 400).slice(0, 2);

  return selected.map((item, index) => ({
    signalKey: item.item.key,
    rank: index + 1,
    reason: item.reason,
    evidence: item.item.evidence,
    tomorrowFocusSubject: item.subject,
  }));
}

export function buildTomorrowFocusContract(priorities: CoachingPriority[]): CoachingTomorrowFocusContract {
  const top = priorities[0] ?? null;
  if (!top) {
    return { subject: null, sourcePriorityRank: null, sourceSignalKey: null };
  }
  return {
    subject: top.tomorrowFocusSubject,
    sourcePriorityRank: top.rank,
    sourceSignalKey: top.signalKey,
  };
}

export function selectRecurringIssue(signals: CoachingSignal[]): CoachingIssue | null {
  const lateSleep = signals.find(
    (item) => item.key === "late_sleep_pattern" && item.severity !== "minor" && item.evidence.length > 0,
  );
  if (lateSleep) {
    return {
      key: lateSleep.key,
      label: "晚睡模式",
      evidence: lateSleep.evidence,
      sourceSignalKeys: [lateSleep.key],
    };
  }

  const mealSkipRolling = signals.find(
    (item) => item.key.includes("meal_skipped") && item.source === "rolling" && item.evidence.length > 0,
  );
  if (mealSkipRolling) {
    return {
      key: mealSkipRolling.key,
      label: "餐點常漏",
      evidence: mealSkipRolling.evidence,
      sourceSignalKeys: [mealSkipRolling.key],
    };
  }

  return null;
}

export function selectImprovedIssue(signals: CoachingSignal[]): CoachingIssue | null {
  const improved = signals.find(
    (item) =>
      item.severity === "positive" &&
      (item.key === "sleep_improved" || item.key === "body_trend_improving") &&
      item.evidence.length > 0,
  );
  if (!improved) {
    return null;
  }
  return {
    key: improved.key,
    label: improved.key === "sleep_improved" ? "睡眠改善" : "身體組成改善",
    evidence: improved.evidence,
    sourceSignalKeys: [improved.key],
  };
}

function isSingleMealDeviationSignal(item: CoachingSignal): boolean {
  if (!item.key.startsWith("meal_")) {
    return false;
  }
  const kind = item.evidence.find((e) => e.key === "observation_signal")?.value;
  return typeof kind === "string" && SINGLE_MEAL_DEVIATION_KEYS.has(`meal_${kind}`);
}

export function resolveCoachAttention(input: {
  signals: CoachingSignal[];
  interventionLevel: CoachingInterventionLevel;
}): CoachingCoachAttentionDecision {
  // Conservative v1:
  // - single meal/hotpot/tea/egg-pancake/skip never alone triggers attention
  // - watch may raise standards without elevating coach_attention_required
  // - only coach_attention + rolling moderate/high (non-submission) can alert
  const recurringSupport = input.signals.filter(
    (item) =>
      item.source === "rolling" &&
      (item.severity === "high" || item.severity === "moderate") &&
      item.key !== "submission_inconsistent" &&
      item.evidence.length > 0,
  );

  const mealDeviations = input.signals.filter(isSingleMealDeviationSignal);
  if (mealDeviations.length > 0 && recurringSupport.length === 0) {
    return { required: false, reason: null, evidence: [] };
  }

  if (input.interventionLevel === "coach_attention" && recurringSupport.length > 0) {
    const primary = recurringSupport.sort(
      (left, right) => severityRank(right.severity) - severityRank(left.severity),
    )[0]!;
    return {
      required: true,
      reason: `rolling:${primary.key}`,
      evidence: primary.evidence,
    };
  }

  return {
    required: false,
    reason: null,
    evidence: [],
  };
}

export function resolveFinalInterventionLevel(signals: CoachingSignal[]): {
  finalInterventionLevel: CoachingInterventionLevel;
  reasons: string[];
} {
  const lateSleep = signals.find((item) => item.key === "late_sleep_pattern");
  // Conservative v1: recurring late sleep raises to watch (not coach_attention).
  if (lateSleep && (lateSleep.severity === "high" || lateSleep.severity === "moderate")) {
    return {
      finalInterventionLevel: "watch",
      reasons: [`signal:${lateSleep.key}:${lateSleep.severity}`],
    };
  }
  return { finalInterventionLevel: "normal", reasons: [] };
}

export function buildCoachingDecisionContext(input: {
  generationInput: CoachingGenerationInput;
  mealObservations?: CoachingMealObservation[];
  customerVoice?: import("@/types/coaching-signals").CoachingCustomerVoiceSignal[];
  photoReuse?: import("@/types/coaching-signals").CoachingPhotoReuseDetection[];
  pendingFollowUps?: import("@/types/coaching-signals").CoachingFollowUpMemory[];
  /** Optional override when caller already resolved intervention (e.g. fixture C). */
  finalInterventionLevelOverride?: CoachingInterventionLevel;
}): CoachingDecisionContext {
  const mealObservations = input.mealObservations ?? [];
  const customerVoice = input.customerVoice ?? [];
  const photoReuse = input.photoReuse ?? [];
  const pendingFollowUps = input.pendingFollowUps ?? [];

  const signals = collectCoachingSignals({
    generationInput: input.generationInput,
    mealObservations,
    customerVoice,
  });
  const positiveSignals = signals.filter((item) => item.severity === "positive");
  // Never treat skipped-meal-adjacent wording as positive — already enforced by not emitting such keys.
  const forbiddenPositive = positiveSignals.filter((item) =>
    /skipped_meal_but_drinking_water_was_good|meal_skipped/.test(item.key),
  );
  const safePositive = positiveSignals.filter((item) => !forbiddenPositive.includes(item));

  const resolved = resolveFinalInterventionLevel(signals);
  const finalInterventionLevel = input.finalInterventionLevelOverride ?? resolved.finalInterventionLevel;
  const priorities = rankCoachingPriorities(signals);
  const recurringIssue = selectRecurringIssue(signals);
  const improvedIssue = selectImprovedIssue(signals);
  const coachAttention = resolveCoachAttention({
    signals,
    interventionLevel: finalInterventionLevel,
  });

  return {
    signals,
    positiveSignals: safePositive,
    priorities,
    recurringIssue,
    improvedIssue,
    coachAttention,
    finalInterventionLevel,
    customerVoice,
    mealObservations,
    photoReuse,
    pendingFollowUps,
  };
}

export function getFixtureMealObservations(
  scenario: "A_normal" | "B_breakfast_deviation" | "C_watch_pattern" | "D_hunger_shake_fried_rice",
): CoachingMealObservation[] {
  if (scenario === "D_hunger_shake_fried_rice") {
    // Controlled OpenAI eval uses live Meal Vision / heuristics; unit fixtures leave empty.
    return [];
  }

  if (scenario === "B_breakfast_deviation") {
    return [
      {
        mealSlot: "breakfast",
        observedFoods: ["蛋餅", "奶茶"],
        signals: ["low_protein", "sugary_drink"],
        evidenceText: ["breakfast text: 蛋餅 + 奶茶"],
      },
    ];
  }

  if (scenario === "C_watch_pattern") {
    return [
      {
        mealSlot: "breakfast",
        observedFoods: ["水"],
        signals: ["meal_skipped"],
        evidenceText: ["breakfast text: 來不及，只喝水"],
      },
      {
        mealSlot: "dinner",
        observedFoods: ["火鍋"],
        signals: ["processed_food"],
        evidenceText: ["dinner text: 外食火鍋"],
      },
    ];
  }

  return [];
}
