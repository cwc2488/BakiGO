import { describe, expect, it } from "vitest";
import {
  buildGo21DailyTargetsSnapshot,
  parseGo21DailyTargetsRecord,
  toGo21DailyTargetsPublicView,
} from "@/lib/go21/daily-targets";
import { buildGo21DailyState, compactGo21DailyStateForAi } from "@/lib/go21/daily-state";
import {
  aggregateDayNutritionEstimates,
  estimateMealNutritionBand,
  extractExplicitNutritionFromText,
} from "@/lib/go21/meal-estimate";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { extractGo21TurnSignals, updateGo21UnderstandingFromTurn } from "@/lib/go21/premium-understanding";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { buildCoachingAiV2UserPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { COACHING_AI_V2_PROMPT_VERSION } from "@/types/coaching-ai-v2";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import { GO21_DAILY_TARGET_PRESETS } from "@/types/go21";

describe("Go21 daily targets model", () => {
  it("parses and round-trips snapshots", () => {
    const snapshot = buildGo21DailyTargetsSnapshot({
      waterMl: 2500,
      caloriesKcal: 1600,
      proteinG: 100,
      sleepHours: 7.5,
      source: "activation",
    });
    const record = parseGo21DailyTargetsRecord({
      version: 1,
      current: snapshot,
      history: [],
    });
    expect(toGo21DailyTargetsPublicView(record)?.hasAny).toBe(true);
    expect(toGo21DailyTargetsPublicView(record)?.proteinG).toBe(100);
  });

  it("rejects empty targets", () => {
    expect(() =>
      buildGo21DailyTargetsSnapshot({
        waterMl: null,
        caloriesKcal: null,
        proteinG: null,
        sleepHours: null,
        source: "coach_edit",
      }),
    ).toThrow(/至少/);
  });

  it("exposes coach presets", () => {
    expect(GO21_DAILY_TARGET_PRESETS.length).toBe(3);
    expect(GO21_DAILY_TARGET_PRESETS[1].label).toBe("標準");
  });
});

describe("Go21 meal estimate — conservative bands", () => {
  it("reads explicit label numbers with high confidence", () => {
    const band = extractExplicitNutritionFromText("這一餐 450 kcal，蛋白質 32g");
    expect(band?.caloriesLow).toBeGreaterThan(400);
    expect(band?.proteinLow).toBeGreaterThan(25);
  });

  it("gives wide low-confidence bands for fried photo meals", () => {
    const band = estimateMealNutritionBand({
      note: "炸雞便當",
      hasPhoto: true,
      signals: ["fried_food"],
    });
    expect(band?.confidence).toBe("low");
    expect((band?.caloriesHigh ?? 0) - (band?.caloriesLow ?? 0)).toBeGreaterThan(200);
  });

  it("aggregates day without claiming precision", () => {
    const day = aggregateDayNutritionEstimates([
      estimateMealNutritionBand({ note: "雞胸沙拉" })!,
      estimateMealNutritionBand({ note: "牛肉麵" })!,
    ]);
    expect(day.caloriesMid).not.toBeNull();
    expect(day.incomplete).toBe(false);
  });
});

describe("Go21 daily state + AI compact", () => {
  it("builds soft cues without remaining-number nagging", () => {
    const state = buildGo21DailyState({
      logDate: "2026-08-10",
      targets: {
        waterMl: 2500,
        caloriesKcal: 1600,
        proteinG: 100,
        sleepHours: 7,
        setAt: "2026-08-01T00:00:00.000Z",
        source: "activation",
        hasAny: true,
      },
      waterMl: 600,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationLabel: "4小時30分",
      meals: [
        { slot: "lunch", note: "水果", signals: ["low_protein"] },
      ],
    });
    expect(state.cues.some((c) => c.key === "water" || c.key === "sleep" || c.key === "protein")).toBe(
      true,
    );
    const ai = compactGo21DailyStateForAi(state);
    expect(ai.guidance).toMatch(/Do not nag|不要/);
    expect(ai.approxToday.sleepHours).toBeGreaterThan(4);
  });
});

describe("Go21 sleep extraction", () => {
  it("extracts hours and qualitative sleep", () => {
    const e = extractGo21StructuredEvent({
      message: "昨晚只睡四個半小時，今天一直想吃甜的",
      messageLogDate: "2026-08-10",
    });
    expect(e.sleepHours).toBe(4.5);
  });

  it("extracts water cups", () => {
    const e = extractGo21StructuredEvent({
      message: "今天喝了 6 杯水",
      messageLogDate: "2026-08-10",
    });
    expect(e.waterMl).toBe(1500);
  });
});

describe("Go21 longitudinal sleep/protein patterns", () => {
  it("detects poor sleep and sleep-linked craving signals", () => {
    const signals = extractGo21TurnSignals({
      freeMessage: "昨晚只睡四小時，今天一直想吃甜的",
      logDate: "2026-08-10",
    });
    expect(signals.some((s) => s.signal === "poor_sleep_stated")).toBe(true);
    expect(signals.some((s) => s.signal === "sleep_linked_craving" || s.signal === "evening_craving")).toBe(
      true,
    );
  });

  it("promotes poor-sleep craving only with co-occurrence", () => {
    let record = null;
    for (const day of ["2026-08-01", "2026-08-02", "2026-08-03"]) {
      record = updateGo21UnderstandingFromTurn({
        prior: record,
        freeMessage: "昨晚睡很少，晚上又超想吃",
        logDate: day,
        lifecycleDay: 5,
        lifecycleStage: "find_patterns",
      }).record;
    }
    expect(
      record?.items.some((i) => i.patternKey === "poor_sleep_next_day_craving" && i.evidenceCount >= 2),
    ).toBe(true);
  });
});

describe("Go21 AI uses targets naturally without nagging", () => {
  function gi(): CoachingGenerationInput {
    return {
      enrollmentId: "enr-dt-1",
      customerId: "cus-dt-1",
      logDate: "2026-08-10",
      profileMemory: {
        displayName: "小美",
        goal: "減脂",
        daysSinceEnrollmentStart: 5,
        planSnapshot: null,
        sex: null,
        heightCm: null,
        latestWeightKg: null,
        latestBodyFatPercent: null,
      },
      todayContext: {
        submitted: true,
        primaryMeals: [
          { mealSlot: "lunch", textNote: "沙拉", storagePath: null },
          { mealSlot: "breakfast", textNote: null, storagePath: null },
          { mealSlot: "dinner", textNote: null, storagePath: null },
        ],
        secondaryMealNotes: [],
        waterMl: 800,
        sleepBedtime: null,
        sleepWakeTime: null,
        sleepDurationLabel: null,
        exerciseNote: null,
        bowelMovementCount: null,
        customerNote: null,
      },
      rollingMemory: { recurringPatterns: [], recentWins: [], openConcerns: [] },
      recentCoachActionMemory: [],
    } as unknown as CoachingGenerationInput;
  }

  function emptyMemory(): CoachingAiV2MemoryBundle {
    return {
      recentTurns: [],
      durableMemory: [],
      openLoops: [],
      hypotheses: [],
      lifecycle: {
        cycle: null,
        dayNumber: 5,
        stage: "find_patterns",
        intensiveActive: true,
        daysRemaining: 16,
      },
    };
  }

  const dailyTargetsState = {
    logDate: "2026-08-10",
    targets: { waterMl: 2500, caloriesKcal: 1600, proteinG: 100, sleepHours: 7 },
    approxToday: {
      waterMl: 800,
      waterConfidence: "reported",
      caloriesKcal: 400,
      caloriesRange: [300, 500] as [number, number],
      caloriesConfidence: "low",
      proteinG: 25,
      proteinRange: [15, 35] as [number, number],
      proteinConfidence: "low",
      sleepHours: 4.5,
      sleepConfidence: "reported",
      sleepNote: null,
    },
    softCues: ["蛋白質偏少", "水偏少"],
    guidance: "Do not nag remaining kcal/g/ml.",
  };

  it("user prompt injects dailyTargetsState", () => {
    const user = buildCoachingAiV2UserPrompt({
      generationInput: gi(),
      decisionContext: {
        finalInterventionLevel: "normal",
        dailyNutritionAssessment: { level: "needs_attention", reasons: [] },
        priorities: [],
        mealObservations: [],
        customerVoice: [],
        recurringIssue: null,
        improvedIssue: null,
        outcomeAssessment: { outcomeStatus: "unclear", customerSummary: "", coachSummary: "" },
      } as unknown as CoachingDecisionContext,
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "晚餐吃什麼？",
      dailyTargetsState,
    });
    expect(user).toMatch(/dailyTargetsState/);
    expect(user).toMatch(/Do not nag|不要每則報/);
    expect(COACHING_AI_V2_PROMPT_VERSION).toMatch(/daily_targets|coach_plan/);
  });

  it("fixture menu uses soft protein cue when calories ok", () => {
    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: {
        finalInterventionLevel: "normal",
        dailyNutritionAssessment: { level: "on_track", reasons: [] },
        priorities: [],
        mealObservations: [],
        customerVoice: [],
        recurringIssue: null,
        improvedIssue: null,
        outcomeAssessment: { outcomeStatus: "unclear", customerSummary: "", coachSummary: "" },
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "晚餐吃什麼？",
      dailyTargetsState,
    });
    expect(draft.coachMessage).toMatch(/蛋白質/);
    expect(draft.coachMessage).not.toMatch(/還差\s*\d+|還剩\s*\d+/);
  });

  it("fixture uses sleep to explain cravings", () => {
    const draft = generateFixtureV2Draft({
      generationInput: gi(),
      decisionContext: {
        finalInterventionLevel: "normal",
        dailyNutritionAssessment: { level: "on_track", reasons: [] },
        priorities: [],
        mealObservations: [],
        customerVoice: [],
        recurringIssue: null,
        improvedIssue: null,
        outcomeAssessment: { outcomeStatus: "unclear", customerSummary: "", coachSummary: "" },
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory: emptyMemory(),
      channel: "free_message",
      freeMessage: "突然很想吃甜的",
      dailyTargetsState: {
        ...dailyTargetsState,
        softCues: ["睡眠偏少"],
        approxToday: { ...dailyTargetsState.approxToday, sleepHours: 4.5 },
      },
    });
    expect(draft.coachMessage).toMatch(/睡/);
    expect(draft.coachMessage).not.toMatch(/還差|kcal/);
  });
});
