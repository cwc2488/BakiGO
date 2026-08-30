import { describe, expect, it } from "vitest";
import {
  buildCoachingAiV2SystemPrompt,
  buildCoachingAiV2UserPrompt,
  coachingBrainLooksUnscripted,
} from "@/lib/coaching/ai/v2/v2-prompts";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { addCalendarDays } from "@/lib/coaching/enrollment-window";
import {
  canShareInsight,
  compactGo21UnderstandingForAi,
  detectGo21UtteranceMode,
  emptyGo21UnderstandingRecord,
  extractGo21TurnSignals,
  GO21_SHARE_MIN_EVIDENCE,
  parseGo21UnderstandingRecord,
  synthesizeDay21Understanding,
  updateGo21UnderstandingFromTurn,
} from "@/lib/go21/premium-understanding";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import type { Go21UnderstandingRecord } from "@/types/go21";
import { COACHING_AI_V2_PROMPT_VERSION } from "@/types/coaching-ai-v2";

function baseGenerationInput(logDate: string): CoachingGenerationInput {
  return {
    enrollmentId: "enr-premium-1",
    customerId: "cus-premium-1",
    logDate,
    profileMemory: {
      displayName: "小明",
      goal: "晚上少失控",
      daysSinceEnrollmentStart: 1,
      planSnapshot: null,
      sex: null,
      heightCm: null,
      latestWeightKg: null,
      latestBodyFatPercent: null,
    },
    todayContext: {
      submitted: true,
      primaryMeals: [
        { mealSlot: "breakfast", textNote: null, storagePath: null },
        { mealSlot: "lunch", textNote: null, storagePath: null },
        { mealSlot: "dinner", textNote: null, storagePath: null },
      ],
      secondaryMealNotes: [],
      waterMl: null,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationLabel: null,
      exerciseNote: null,
      bowelMovementCount: null,
      customerNote: null,
    },
    rollingMemory: {
      recurringPatterns: [],
      recentWins: [],
      openConcerns: [],
    },
    recentCoachActionMemory: [],
  } as unknown as CoachingGenerationInput;
}

function emptyDecision(): CoachingDecisionContext {
  return {
    finalInterventionLevel: "normal",
    dailyNutritionAssessment: { level: "unclear", reasons: [] },
    priorities: [],
    mealObservations: [],
    customerVoice: [],
    recurringIssue: null,
    improvedIssue: null,
    outcomeAssessment: {
      outcomeStatus: "unclear",
      customerSummary: "",
      coachSummary: "",
    },
  } as unknown as CoachingDecisionContext;
}

function memoryForDay(day: number): CoachingAiV2MemoryBundle {
  const stage =
    day <= 3
      ? "understand"
      : day <= 7
        ? "find_patterns"
        : day <= 14
          ? "experiment"
          : day <= 20
            ? "build_autonomy"
            : "day21_ending";
  return {
    recentTurns: [],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber: day,
      stage,
      intensiveActive: true,
      daysRemaining: Math.max(0, 21 - day),
    },
  };
}

function simulateMultiDayLunchEvening(days: number): Go21UnderstandingRecord {
  let record: Go21UnderstandingRecord | null = null;
  const start = "2026-08-01";
  for (let d = 0; d < days; d++) {
    const logDate = addCalendarDays(start, d);
    const updated = updateGo21UnderstandingFromTurn({
      prior: record,
      freeMessage: "今天中午只吃一點水果，晚上又餓爆亂吃宵夜",
      logDate,
      todayMealNotes: [{ slot: "lunch", note: "水果" }],
      lifecycleDay: d + 1,
      lifecycleStage: d + 1 <= 3 ? "understand" : "find_patterns",
    });
    record = updated.record;
  }
  return record!;
}

describe("Go21 Premium Coaching Brain — understanding engine", () => {
  it("detects utterance modes without collapsing everything to advice", () => {
    expect(detectGo21UtteranceMode({ freeMessage: "午餐吃了雞胸" })).toBe("reporting");
    expect(detectGo21UtteranceMode({ freeMessage: "晚餐給我菜單？" })).toBe("asking_advice");
    expect(detectGo21UtteranceMode({ freeMessage: "蛋白質為什麼重要？" })).toBe("factual_question");
    expect(detectGo21UtteranceMode({ freeMessage: "我好難撐下去怎麼辦" })).toBe("seeking_help");
    expect(detectGo21UtteranceMode({ freeMessage: "待會想吃漢堡" })).toBe("making_plan");
    expect(detectGo21UtteranceMode({ freeMessage: "你還記得我中午吃什麼嗎" })).toBe("memory_check");
    expect(detectGo21UtteranceMode({ freeMessage: "哈哈好啊" })).toBe("casual_chat");
  });

  it("does not invent shareable patterns from a single late-night report", () => {
    const { record, newSignals } = updateGo21UnderstandingFromTurn({
      prior: null,
      freeMessage: "剛剛宵夜吃了泡麵",
      logDate: "2026-08-01",
      lifecycleDay: 1,
      lifecycleStage: "understand",
    });
    expect(newSignals.some((s) => s.signal === "late_night_eating")).toBe(true);
    const item = record.items.find((i) => i.patternKey === "late_night_eating");
    expect(item).toBeTruthy();
    expect(item!.evidenceCount).toBe(1);
    expect(canShareInsight(item!, { lifecycleDay: 1, lifecycleStage: "understand" })).toBe(false);

    const compact = compactGo21UnderstandingForAi({
      record,
      utteranceMode: "reporting",
      lifecycleDay: 1,
      lifecycleStage: "understand",
    });
    expect(compact?.shareableInsights).toEqual([]);
    expect(compact?.emergingObservations.length).toBeGreaterThan(0);
  });

  it("accumulates small-lunch→evening evidence and only shares after enough days", () => {
    const day1 = simulateMultiDayLunchEvening(1);
    const item1 = day1.items.find((i) => i.patternKey === "small_lunch_evening_overeating");
    expect(item1).toBeTruthy();
    expect(
      canShareInsight(item1!, { lifecycleDay: 1, lifecycleStage: "understand" }),
    ).toBe(false);

    const day2 = simulateMultiDayLunchEvening(2);
    const item2 = day2.items.find((i) => i.patternKey === "small_lunch_evening_overeating")!;
    expect(item2.evidenceCount).toBe(2);
    expect(
      canShareInsight(item2, { lifecycleDay: 5, lifecycleStage: "find_patterns" }),
    ).toBe(false);

    const day3 = simulateMultiDayLunchEvening(3);
    const item3 = day3.items.find((i) => i.patternKey === "small_lunch_evening_overeating")!;
    expect(item3.evidenceCount).toBeGreaterThanOrEqual(GO21_SHARE_MIN_EVIDENCE);
    expect(item3.confidence).toBeGreaterThanOrEqual(0.7);
    expect(
      canShareInsight(item3, { lifecycleDay: 5, lifecycleStage: "find_patterns" }),
    ).toBe(true);

    const compact = compactGo21UnderstandingForAi({
      record: day3,
      utteranceMode: "reporting",
      lifecycleDay: 5,
      lifecycleStage: "find_patterns",
    });
    expect(compact?.shareableInsights[0]?.patternKey).toBe("small_lunch_evening_overeating");
    expect(compact?.shareableInsights[0]?.customerFacingHint).toMatch(/中午都吃太少/);
  });

  it("revises understanding when contradictory behavior appears", () => {
    let record = simulateMultiDayLunchEvening(3);
    // Two contradicting days
    for (const offset of [3, 4]) {
      const logDate = addCalendarDays("2026-08-01", offset);
      const updated = updateGo21UnderstandingFromTurn({
        prior: record,
        freeMessage: "今天午餐吃得很飽，有好好吃便當，晚上很穩沒亂吃",
        logDate,
        lifecycleDay: offset + 1,
        lifecycleStage: "find_patterns",
      });
      record = updated.record;
    }
    const live = record.items.filter(
      (i) =>
        i.patternKey === "small_lunch_evening_overeating" &&
        i.status !== "revised" &&
        i.status !== "rejected",
    );
    // Either weakened/rejected original or a revised emerging statement
    const revised = record.items.filter((i) => i.status === "revised");
    expect(revised.length + live.filter((i) => /降級|反證/.test(i.statement)).length).toBeGreaterThan(
      0,
    );
  });

  it("keeps preferences per customer and does not cross-contaminate", () => {
    const a = updateGo21UnderstandingFromTurn({
      prior: null,
      freeMessage: "我不喜歡雞胸肉",
      logDate: "2026-08-01",
      lifecycleDay: 2,
      lifecycleStage: "understand",
    }).record;
    const b = updateGo21UnderstandingFromTurn({
      prior: null,
      freeMessage: "我超愛牛肉麵",
      logDate: "2026-08-01",
      lifecycleDay: 2,
      lifecycleStage: "understand",
    }).record;
    expect(a.preferences.some((p) => p.polarity === "dislike" && /雞胸/.test(p.content))).toBe(
      true,
    );
    expect(b.preferences.some((p) => p.polarity === "like")).toBe(true);
    expect(a.preferences.some((p) => /牛肉麵/.test(p.content))).toBe(false);
    expect(b.preferences.some((p) => /雞胸/.test(p.content))).toBe(false);
  });

  it("records strategy outcomes into understanding", () => {
    let record = simulateMultiDayLunchEvening(3);
    record = updateGo21UnderstandingFromTurn({
      prior: record,
      freeMessage: "我照你說的先把午餐吃完整試試",
      logDate: "2026-08-05",
      lifecycleDay: 5,
      lifecycleStage: "find_patterns",
    }).record;
    expect(record.experiments.some((e) => e.status === "running" || e.status === "proposed")).toBe(
      true,
    );
    record = updateGo21UnderstandingFromTurn({
      prior: record,
      freeMessage: "欸晚上真的比較穩，好像有用",
      logDate: "2026-08-06",
      lifecycleDay: 6,
      lifecycleStage: "find_patterns",
    }).record;
    expect(record.items.some((i) => i.category === "strategy_worked")).toBe(true);
    expect(record.coachingNotes.some((n) => /午餐|白天/.test(n))).toBe(true);
  });

  it("round-trips parse/serialize safely", () => {
    const record = simulateMultiDayLunchEvening(2);
    const parsed = parseGo21UnderstandingRecord(JSON.parse(JSON.stringify(record)));
    expect(parsed?.items.length).toBe(record.items.length);
    expect(parsed?.version).toBe(1);
  });

  it("Day21 synthesis uses only evidenced understanding", () => {
    const empty = synthesizeDay21Understanding(emptyGo21UnderstandingRecord());
    expect(empty.majorPatterns).toEqual([]);

    const rich = simulateMultiDayLunchEvening(4);
    const rich2 = updateGo21UnderstandingFromTurn({
      prior: rich,
      freeMessage: "照你說的試了，晚上真的比較穩好像有用",
      logDate: "2026-08-06",
      lifecycleDay: 6,
      lifecycleStage: "experiment",
    }).record;
    const synth = synthesizeDay21Understanding(rich2);
    expect(synth.majorPatterns.length + synth.whatWorked.length).toBeGreaterThan(0);
  });
});

describe("Go21 Premium Coaching Brain — generation behavior", () => {
  it("system prompt stays unscripted and mentions longitudinal understanding", () => {
    const prompt = buildCoachingAiV2SystemPrompt();
    expect(coachingBrainLooksUnscripted(prompt)).toBe(true);
    expect(prompt).toMatch(/長期理解|shareableInsights|越來越懂/);
    expect(prompt).not.toMatch(/acknowledge\s*→\s*advice\s*→\s*question/i);
    expect(COACHING_AI_V2_PROMPT_VERSION).toMatch(
      /premium_brain|natural_conversation|human_coach_voice|daily_targets|coach_plan/,
    );
  });

  it("user prompt injects longitudinalUnderstanding block", () => {
    const record = simulateMultiDayLunchEvening(3);
    const compact = compactGo21UnderstandingForAi({
      record,
      utteranceMode: "reporting",
      lifecycleDay: 5,
      lifecycleStage: "find_patterns",
    });
    const user = buildCoachingAiV2UserPrompt({
      generationInput: baseGenerationInput("2026-08-05"),
      decisionContext: emptyDecision(),
      memory: memoryForDay(5),
      channel: "free_message",
      freeMessage: "晚上又餓爆了",
      longitudinalUnderstanding: compact,
    });
    const parsed = JSON.parse(user);
    expect(parsed.longitudinalUnderstanding).toBeTruthy();
    expect(parsed.longitudinalUnderstanding.utteranceMode).toBe("reporting");
    expect(parsed.longitudinalUnderstanding.shareableInsights.length).toBeGreaterThan(0);
  });

  it("Day 1 meal report stays short and does not claim a pattern", () => {
    const day1Understanding = compactGo21UnderstandingForAi({
      record: updateGo21UnderstandingFromTurn({
        prior: null,
        freeMessage: "午餐吃了燒餅油條",
        logDate: "2026-08-01",
        lifecycleDay: 1,
        lifecycleStage: "understand",
      }).record,
      utteranceMode: "reporting",
      lifecycleDay: 1,
      lifecycleStage: "understand",
    });
    const draft = generateFixtureV2Draft({
      generationInput: baseGenerationInput("2026-08-01"),
      decisionContext: emptyDecision(),
      finalInterventionLevel: "normal",
      memory: memoryForDay(1),
      channel: "free_message",
      freeMessage: "午餐吃了燒餅油條",
      longitudinalUnderstanding: day1Understanding,
    });
    expect(draft.coachMessage.length).toBeLessThan(40);
    expect(draft.coachMessage).not.toMatch(/抓到|模式|意志力/);
  });

  it("after enough evidence, shares the lunch→evening longitudinal insight", () => {
    const record = simulateMultiDayLunchEvening(3);
    const compact = compactGo21UnderstandingForAi({
      record,
      utteranceMode: "reporting",
      lifecycleDay: 5,
      lifecycleStage: "find_patterns",
    });
    const draft = generateFixtureV2Draft({
      generationInput: {
        ...baseGenerationInput("2026-08-05"),
        profileMemory: {
          ...baseGenerationInput("2026-08-05").profileMemory,
          daysSinceEnrollmentStart: 5,
        },
      },
      decisionContext: emptyDecision(),
      finalInterventionLevel: "normal",
      memory: memoryForDay(5),
      channel: "free_message",
      freeMessage: "今天中午又只吃一點，晚上又餓爆了",
      longitudinalUnderstanding: compact,
    });
    expect(draft.coachMessage).toMatch(/中午都吃太少|不是你晚上意志力差/);
    expect(draft.coachMessage).toMatch(/午餐吃完整/);
  });

  it("different customers get different coaching from different preferences", () => {
    const aRecord = updateGo21UnderstandingFromTurn({
      prior: null,
      freeMessage: "我不喜歡雞胸肉",
      logDate: "2026-08-01",
      lifecycleDay: 4,
      lifecycleStage: "find_patterns",
    }).record;
    const bRecord = updateGo21UnderstandingFromTurn({
      prior: null,
      freeMessage: "我超愛牛肉麵",
      logDate: "2026-08-01",
      lifecycleDay: 4,
      lifecycleStage: "find_patterns",
    }).record;

    const draftA = generateFixtureV2Draft({
      generationInput: baseGenerationInput("2026-08-04"),
      decisionContext: emptyDecision(),
      finalInterventionLevel: "normal",
      memory: memoryForDay(4),
      channel: "free_message",
      freeMessage: "晚餐給我菜單",
      longitudinalUnderstanding: compactGo21UnderstandingForAi({
        record: aRecord,
        utteranceMode: "asking_advice",
        lifecycleDay: 4,
        lifecycleStage: "find_patterns",
      }),
    });
    const draftB = generateFixtureV2Draft({
      generationInput: baseGenerationInput("2026-08-04"),
      decisionContext: emptyDecision(),
      finalInterventionLevel: "normal",
      memory: memoryForDay(4),
      channel: "free_message",
      freeMessage: "晚餐給我菜單",
      longitudinalUnderstanding: compactGo21UnderstandingForAi({
        record: bRecord,
        utteranceMode: "asking_advice",
        lifecycleDay: 4,
        lifecycleStage: "find_patterns",
      }),
    });
    expect(draftA.coachMessage).toMatch(/雞胸/);
    expect(draftB.coachMessage).toMatch(/牛肉麵/);
    expect(draftA.coachMessage).not.toEqual(draftB.coachMessage);
  });

  it("fixture can disagree / challenge on goal-conflict plans", () => {
    const draft = generateFixtureV2Draft({
      generationInput: baseGenerationInput("2026-08-04"),
      decisionContext: {
        ...emptyDecision(),
        mealObservations: [
          {
            mealSlot: "lunch",
            observedFoods: ["炸麵"],
            signals: ["fried_food"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: 0.8,
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "coach_attention",
      memory: memoryForDay(4),
      channel: "free_message",
      freeMessage: "等一下想吃漢堡",
      go21Goal: {
        primaryDirection: "fat_loss_body",
        primaryDirectionLabel: "減脂／體態改善",
        personalGoal: "減脂並減少晚上亂吃",
        targetWeightKg: 60,
        originalPersonalGoal: null,
        wasRefined: false,
        guidance: "Protect the live goal.",
      },
      longitudinalUnderstanding: compactGo21UnderstandingForAi({
        record: emptyGo21UnderstandingRecord(),
        utteranceMode: "making_plan",
        lifecycleDay: 4,
        lifecycleStage: "find_patterns",
      }),
    });
    expect(draft.coachMessage).toMatch(/不推|漢堡|炸|輕/);
    expect(draft.meta.intention).toBe("challenge");
  });

  it("Day 1 and later-stage coaching feel different on the same evening report", () => {
    const msg = "中午只吃水果，晚上又餓爆了";
    const early = updateGo21UnderstandingFromTurn({
      prior: null,
      freeMessage: msg,
      logDate: "2026-08-01",
      lifecycleDay: 1,
      lifecycleStage: "understand",
    });
    const earlyDraft = generateFixtureV2Draft({
      generationInput: baseGenerationInput("2026-08-01"),
      decisionContext: emptyDecision(),
      finalInterventionLevel: "normal",
      memory: memoryForDay(1),
      channel: "free_message",
      freeMessage: msg,
      longitudinalUnderstanding: compactGo21UnderstandingForAi({
        record: early.record,
        utteranceMode: early.utteranceMode,
        lifecycleDay: 1,
        lifecycleStage: "understand",
      }),
    });

    const laterRecord = simulateMultiDayLunchEvening(3);
    const laterDraft = generateFixtureV2Draft({
      generationInput: {
        ...baseGenerationInput("2026-08-05"),
        profileMemory: {
          ...baseGenerationInput("2026-08-05").profileMemory,
          daysSinceEnrollmentStart: 5,
        },
      },
      decisionContext: emptyDecision(),
      finalInterventionLevel: "normal",
      memory: memoryForDay(5),
      channel: "free_message",
      freeMessage: msg,
      longitudinalUnderstanding: compactGo21UnderstandingForAi({
        record: laterRecord,
        utteranceMode: "reporting",
        lifecycleDay: 5,
        lifecycleStage: "find_patterns",
      }),
    });

    expect(earlyDraft.coachMessage).not.toMatch(/抓到你最近晚上/);
    expect(laterDraft.coachMessage).toMatch(/中午都吃太少|意志力/);
    expect(earlyDraft.coachMessage.length).toBeLessThan(laterDraft.coachMessage.length);
  });

  it("Day21 reflection includes what worked for this person when evidence exists", () => {
    let record = simulateMultiDayLunchEvening(3);
    record = updateGo21UnderstandingFromTurn({
      prior: record,
      freeMessage: "照你說的試了，晚上真的比較穩好像有用",
      logDate: "2026-08-10",
      lifecycleDay: 10,
      lifecycleStage: "experiment",
    }).record;
    const compact = compactGo21UnderstandingForAi({
      record,
      utteranceMode: "other",
      lifecycleDay: 21,
      lifecycleStage: "day21_ending",
    });
    const draft = generateFixtureV2Draft({
      generationInput: {
        ...baseGenerationInput("2026-08-21"),
        profileMemory: {
          ...baseGenerationInput("2026-08-21").profileMemory,
          daysSinceEnrollmentStart: 21,
        },
      },
      decisionContext: emptyDecision(),
      finalInterventionLevel: "normal",
      memory: memoryForDay(21),
      channel: "day21",
      freeMessage: "今天第 21 天了",
      go21Goal: {
        primaryDirection: "reduce_chaos_eating",
        primaryDirectionLabel: "改善容易失控／亂吃的狀況",
        personalGoal: "晚上少失控",
        targetWeightKg: null,
        originalPersonalGoal: "晚上少失控",
        wasRefined: false,
        guidance: "Protect the live goal.",
      },
      longitudinalUnderstanding: compact,
    });
    expect(draft.coachMessage).toMatch(/21 天/);
    expect(draft.coachMessage).toMatch(/有用的做法|主要模式/);
    expect(draft.meta.day21Reflection?.whatWorked?.length).toBeGreaterThan(0);
  });

  it("extracts signals conservatively", () => {
    expect(extractGo21TurnSignals({ freeMessage: "今天天氣不錯", logDate: "2026-08-01" })).toEqual(
      [],
    );
    expect(
      extractGo21TurnSignals({
        freeMessage: "壓力大到想吃宵夜",
        logDate: "2026-08-01",
      }).some((s) => s.signal === "stress_eating" || s.signal === "late_night_eating"),
    ).toBe(true);
  });
});
