import { describe, expect, it } from "vitest";
import {
  buildGo21TemporalTimeline,
  classifyGo21UtteranceKind,
  resolveGo21EventDateWithFuture,
} from "@/lib/go21/temporal-meal-state";
import { extractGo21StructuredEvent } from "@/lib/go21/extract-structured-event";
import { generateFixtureV2Draft } from "@/lib/coaching/ai/v2/v2-fixture-provider";
import { buildCoachingAiV2UserPrompt, buildCoachingAiV2SystemPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import { DEFAULT_COACHING_PLAN_SNAPSHOT } from "@/lib/coaching/default-instructions";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingDecisionContext } from "@/types/coaching-signals";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";

describe("Go21 temporal continuity", () => {
  it("classifies eaten vs planned utterances", () => {
    expect(classifyGo21UtteranceKind("剛剛早餐吃燒餅油條")).toBe("eaten");
    expect(classifyGo21UtteranceKind("午餐吃炸雞")).toBe("eaten");
    expect(classifyGo21UtteranceKind("等一下想吃漢堡")).toBe("planned");
    expect(classifyGo21UtteranceKind("明天想吃漢堡")).toBe("planned");
    expect(classifyGo21UtteranceKind("你好")).toBe("other");
  });

  it("resolves tomorrow / yesterday relative to message day", () => {
    expect(resolveGo21EventDateWithFuture("明天想吃漢堡", "2026-08-29")).toBe("2026-08-30");
    expect(resolveGo21EventDateWithFuture("昨天晚餐火鍋", "2026-08-29")).toBe("2026-08-28");
    expect(resolveGo21EventDateWithFuture("剛剛早餐吃燒餅", "2026-08-29")).toBe("2026-08-29");
  });

  it("extract marks utteranceKind and tomorrow dates", () => {
    const eaten = extractGo21StructuredEvent({
      message: "剛剛早餐吃燒餅油條",
      messageLogDate: "2026-08-29",
    });
    expect(eaten.utteranceKind).toBe("eaten");
    expect(eaten.mealSlot).toBe("breakfast");
    expect(eaten.eventDate).toBe("2026-08-29");

    const planned = extractGo21StructuredEvent({
      message: "等一下想吃漢堡",
      messageLogDate: "2026-08-29",
    });
    expect(planned.utteranceKind).toBe("planned");

    const tomorrow = extractGo21StructuredEvent({
      message: "明天想吃漢堡",
      messageLogDate: "2026-08-29",
    });
    expect(tomorrow.eventDate).toBe("2026-08-30");
    expect(tomorrow.utteranceKind).toBe("planned");
  });

  it("timeline keeps today eaten separate from stale hamburger plans", () => {
    const timeline = buildGo21TemporalTimeline({
      generationLogDate: "2026-08-29",
      todayMealNotes: [
        { slot: "breakfast", note: "剛剛早餐吃燒餅油條" },
        { slot: "lunch", note: "午餐吃炸雞" },
      ],
      recentTurns: [
        {
          role: "customer",
          content: "等一下想吃漢堡",
          logDate: "2026-08-28",
          metadata: {
            temporal: {
              utteranceKind: "planned",
              eventDate: "2026-08-28",
              mealSlot: null,
              relativeLabel: null,
            },
          },
        },
        {
          role: "customer",
          content: "剛剛早餐吃燒餅油條",
          logDate: "2026-08-29",
          metadata: {
            temporal: {
              utteranceKind: "eaten",
              eventDate: "2026-08-29",
              mealSlot: "breakfast",
              relativeLabel: "剛剛",
            },
          },
        },
        {
          role: "customer",
          content: "午餐吃炸雞",
          logDate: "2026-08-29",
          metadata: {
            temporal: {
              utteranceKind: "eaten",
              eventDate: "2026-08-29",
              mealSlot: "lunch",
              relativeLabel: null,
            },
          },
        },
      ],
      currentMessage: "午餐吃炸雞",
    });

    const todayLabels = timeline.todayEaten.map((e) => e.label).join(" ");
    expect(todayLabels).toMatch(/燒餅|油條/);
    expect(todayLabels).toMatch(/炸雞/);
    expect(timeline.openPlansForToday.some((p) => /漢堡/.test(p.label))).toBe(false);
    expect(timeline.promptBlock.doNotTreatAsCurrent.some((h) => /漢堡/.test(h.label))).toBe(true);
  });

  it("same-day plan is superseded when that slot is later eaten", () => {
    const timeline = buildGo21TemporalTimeline({
      generationLogDate: "2026-08-29",
      todayMealNotes: [{ slot: "dinner", note: "晚餐吃了沙拉" }],
      recentTurns: [
        {
          role: "customer",
          content: "等一下想吃漢堡",
          logDate: "2026-08-29",
          metadata: {
            temporal: {
              utteranceKind: "planned",
              eventDate: "2026-08-29",
              mealSlot: "dinner",
              relativeLabel: null,
            },
          },
        },
      ],
    });
    expect(timeline.openPlansForToday.some((p) => /漢堡/.test(p.label))).toBe(false);
    expect(timeline.todayEaten.some((e) => /沙拉/.test(e.label))).toBe(true);
  });

  it("fixture after breakfast+lunch does not invent tonight hamburger from old plan", () => {
    const memory = emptyMemory(9);
    memory.recentTurns = [
      customerTurn("等一下想吃漢堡", "2026-08-28", {
        utteranceKind: "planned",
        eventDate: "2026-08-28",
        mealSlot: null,
      }),
      customerTurn("剛剛早餐吃燒餅油條", "2026-08-29", {
        utteranceKind: "eaten",
        eventDate: "2026-08-29",
        mealSlot: "breakfast",
      }),
    ];

    const draft = generateFixtureV2Draft({
      generationInput: {
        ...minimalGi("2026-08-29"),
        todayContext: {
          ...minimalGi("2026-08-29").todayContext,
          primaryMeals: [
            { mealSlot: "breakfast", storagePath: null, textNote: "剛剛早餐吃燒餅油條" },
            { mealSlot: "lunch", storagePath: null, textNote: "午餐吃炸雞" },
          ],
        },
      },
      decisionContext: {
        ...minimalDecision(),
        mealObservations: [
          {
            mealSlot: "lunch",
            observedFoods: ["炸雞"],
            signals: ["fried_food"],
            evidenceText: ["炸雞"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "medium",
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory,
      channel: "free_message",
      freeMessage: "午餐吃炸雞",
      go21Goal: fatLossGoal(),
    });

    expect(draft.coachMessage).not.toMatch(/今晚.*漢堡|待會.*漢堡|今晚的漢堡/);
    expect(draft.coachMessage).toMatch(/炸雞|兇|收一點|下一餐/);
  });

  it("same-day dinner plan stays open after lunch and steers without inventing extra meals", () => {
    const timeline = buildGo21TemporalTimeline({
      generationLogDate: "2026-08-29",
      todayMealNotes: [
        { slot: "breakfast", note: "早餐吃燒餅油條" },
        { slot: "lunch", note: "午餐吃炸雞" },
      ],
      recentTurns: [
        {
          role: "customer",
          content: "等一下想吃漢堡",
          logDate: "2026-08-29",
          metadata: {
            temporal: {
              utteranceKind: "planned",
              eventDate: "2026-08-29",
              mealSlot: "dinner",
              relativeLabel: null,
            },
          },
        },
      ],
      currentMessage: "午餐吃炸雞",
    });
    expect(timeline.openPlansForToday.some((p) => /漢堡/.test(p.label))).toBe(true);
    expect(timeline.todayEaten.map((e) => e.label).join(" ")).toMatch(/炸雞/);

    const memory = emptyMemory(9);
    memory.recentTurns = [
      customerTurn("等一下想吃漢堡", "2026-08-29", {
        utteranceKind: "planned",
        eventDate: "2026-08-29",
        mealSlot: "dinner",
      }),
      customerTurn("剛剛早餐吃燒餅油條", "2026-08-29", {
        utteranceKind: "eaten",
        eventDate: "2026-08-29",
        mealSlot: "breakfast",
      }),
    ];
    const draft = generateFixtureV2Draft({
      generationInput: {
        ...minimalGi("2026-08-29"),
        todayContext: {
          ...minimalGi("2026-08-29").todayContext,
          primaryMeals: [
            { mealSlot: "breakfast", storagePath: null, textNote: "早餐吃燒餅油條" },
            { mealSlot: "lunch", storagePath: null, textNote: "午餐吃炸雞" },
          ],
        },
      },
      decisionContext: {
        ...minimalDecision(),
        mealObservations: [
          {
            mealSlot: "lunch",
            observedFoods: ["炸雞"],
            signals: ["fried_food"],
            evidenceText: ["炸雞"],
            shakeObserved: false,
            solidFoodObserved: true,
            confidence: "medium",
          },
        ],
      } as unknown as CoachingDecisionContext,
      finalInterventionLevel: "normal",
      memory,
      channel: "free_message",
      freeMessage: "等一下想吃漢堡",
      go21Goal: fatLossGoal(),
    });
    expect(draft.coachMessage).toMatch(/漢堡|不推|炸/);
    expect(draft.coachMessage).not.toMatch(/今晚的漢堡/);
  });

  it("tomorrow plan lands on next day, not today's open plans", () => {
    const timeline = buildGo21TemporalTimeline({
      generationLogDate: "2026-08-29",
      recentTurns: [],
      currentMessage: "明天想吃漢堡",
    });
    expect(timeline.openPlansForToday.some((p) => /漢堡/.test(p.label))).toBe(false);
    expect(
      timeline.historical.some((h) => h.logDate === "2026-08-30" && /漢堡/.test(h.label)) ||
        timeline.promptBlock.doNotTreatAsCurrent.some(
          (h) => h.logDate === "2026-08-30" && /漢堡/.test(h.label),
        ),
    ).toBe(true);
  });

  it("prompt includes temporalTimeline grounding", () => {
    const sys = buildCoachingAiV2SystemPrompt();
    expect(sys).toMatch(/時間線|todayEaten|openPlansForToday|doNotTreatAsCurrent/);

    const memory = emptyMemory(5);
    memory.recentTurns = [
      customerTurn("等一下想吃漢堡", "2026-08-28", {
        utteranceKind: "planned",
        eventDate: "2026-08-28",
        mealSlot: null,
      }),
    ];
    const user = buildCoachingAiV2UserPrompt({
      generationInput: minimalGi("2026-08-29"),
      decisionContext: minimalDecision(),
      memory,
      channel: "free_message",
      freeMessage: "剛剛早餐吃燒餅油條",
      go21Goal: fatLossGoal(),
    });
    expect(user).toContain("temporalTimeline");
    expect(user).toContain("doNotTreatAsCurrent");
    expect(user).toMatch(/禁止把舊的食物|doNotTreatAsCurrent/);
  });
});

function fatLossGoal() {
  return {
    primaryDirection: "fat_loss_body",
    primaryDirectionLabel: "減脂／體態改善",
    personalGoal: "三週減體脂",
    targetWeightKg: 68,
    originalPersonalGoal: null,
    wasRefined: false,
    guidance: "protect goal",
  };
}

function emptyMemory(dayNumber: number): CoachingAiV2MemoryBundle {
  return {
    recentTurns: [],
    durableMemory: [],
    openLoops: [],
    hypotheses: [],
    lifecycle: {
      cycle: null,
      dayNumber,
      stage: "find_patterns",
      intensiveActive: true,
      daysRemaining: Math.max(0, 21 - dayNumber),
    },
  };
}

function customerTurn(
  content: string,
  logDate: string,
  temporal: {
    utteranceKind: string;
    eventDate: string;
    mealSlot: string | null;
  },
) {
  return {
    id: `c-${content.slice(0, 8)}`,
    enrollmentId: "enr",
    customerId: "cus",
    ownerMemberId: "own",
    cycleId: null,
    logDate,
    turnIndex: 1,
    role: "customer" as const,
    channel: "free_message" as const,
    content,
    contentSummary: null,
    aiOutputId: null,
    intention: null,
    metadata: { temporal },
    createdAt: `${logDate}T04:00:00.000Z`,
  };
}

function minimalGi(logDate = "2026-08-29"): CoachingGenerationInput {
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    logDate,
    enrollmentId: "enr-temporal",
    customerId: "cus-temporal",
    profileMemory: {
      displayName: "測試",
      goal: "減脂",
      daysSinceEnrollmentStart: 9,
      planSnapshot: DEFAULT_COACHING_PLAN_SNAPSHOT,
      sex: null,
      birthYear: null,
      heightCm: null,
      customerContext: {},
    },
    todayContext: {
      submitted: true,
      primaryMeals: [],
      secondaryMealNotes: [],
      waterMl: null,
      sleepBedtime: null,
      sleepWakeTime: null,
      sleepDurationLabel: null,
      exerciseNote: null,
      bowelMovementCount: null,
      customerNote: null,
    },
    rollingMemory: { recurringPatterns: [] },
    photoContext: { meals: [] },
  } as unknown as CoachingGenerationInput;
}

function minimalDecision(): CoachingDecisionContext {
  return {
    finalInterventionLevel: "normal",
    dailyNutritionAssessment: {
      level: "insufficient_data",
      reasons: [],
      positiveFactors: [],
      adjustmentSubjects: [],
      confidence: "low",
    },
    priorities: [],
    mealObservations: [],
    customerVoice: [],
    recurringIssue: null,
    improvedIssue: null,
    outcomeAssessment: { outcomeStatus: "insufficient_data", customerSummary: "" },
    coachAttention: { required: false, reason: null },
  } as unknown as CoachingDecisionContext;
}
