import { describe, expect, it } from "vitest";
import {
  resolveGo21PendingCoachReply,
  shouldShowGo21CoachFailedCard,
  go21CoachTurnAnswersCustomer,
} from "@/lib/go21/pending-coach-reply";
import {
  selectGo21HistoricalVisionForGeneration,
  go21VisionSummaryLooksStructured,
} from "@/lib/go21/historical-vision";
import { interpretGo21ChatSendResult } from "@/lib/go21/conversation-quality";
import {
  assessGo21VisionFoodRelevance,
  pickGo21VisionVisibleHint,
} from "@/lib/go21/vision-food-relevance";
import { gateGo21VisionObservations } from "@/lib/go21/realtime-vision";
import {
  buildGo21CurrentTurnEvidence,
  go21CurrentTurnBlocksNutritionMutation,
} from "@/lib/go21/current-turn-evidence";
import { buildMinimalDecisionContextForFreeMessage } from "@/lib/coaching/ai/v2/minimal-decision-context";
import { buildGo21TemporalTimeline } from "@/lib/go21/temporal-meal-state";
import { generateCoachingAiV2 } from "@/lib/coaching/ai/v2/generate-v2";
import { buildCoachingAiV2UserPrompt } from "@/lib/coaching/ai/v2/v2-prompts";
import type { CoachingGenerationInput } from "@/types/coaching-ai";
import type { CoachingAiV2MemoryBundle } from "@/types/coaching-ai-v2";
import type { CoachingMealObservation } from "@/types/coaching-signals";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Go21 pending coach reply reconciliation", () => {
  it("clears pending when coach reply exists via replyToCustomerTurnId", () => {
    const turns = [
      {
        id: "c1",
        role: "customer",
        content: "是不是不能開玩笑？",
        createdAt: "2026-08-29T10:00:00.000Z",
        channel: "free_message",
        clientRequestId: "req-1",
      },
      {
        id: "a1",
        role: "coach",
        content: "可以啊 😂",
        createdAt: "2026-08-29T10:00:01.000Z",
        channel: "free_message",
        clientRequestId: "req-1",
        replyToCustomerTurnId: "c1",
      },
    ];
    expect(resolveGo21PendingCoachReply(turns)).toBeNull();
    expect(
      shouldShowGo21CoachFailedCard({
        pendingCoachReply: {
          customerTurnId: "c1",
          clientRequestId: "req-1",
          content: "是不是不能開玩笑？",
          logDate: "2026-08-29",
        },
        turns,
      }),
    ).toBe(false);
  });

  it("clears pending when coach shares clientRequestId even if replyTo missing", () => {
    const turns = [
      {
        id: "c1",
        role: "customer",
        content: "嗨",
        createdAt: "2026-08-29T10:00:00.000Z",
        channel: "free_message",
        clientRequestId: "req-2",
      },
      {
        id: "a1",
        role: "coach",
        content: "嗨～",
        createdAt: "2026-08-29T10:00:01.000Z",
        channel: "free_message",
        clientRequestId: "req-2",
      },
    ];
    expect(go21CoachTurnAnswersCustomer(turns[1]!, turns[0]!)).toBe(true);
    expect(resolveGo21PendingCoachReply(turns)).toBeNull();
  });

  it("keeps pending only when latest customer truly has no coach reply", () => {
    const turns = [
      {
        id: "c1",
        role: "customer",
        content: "午餐飯糰",
        createdAt: "2026-08-29T09:00:00.000Z",
        channel: "free_message",
        clientRequestId: "req-old",
      },
      {
        id: "a1",
        role: "coach",
        content: "收到",
        createdAt: "2026-08-29T09:00:01.000Z",
        channel: "free_message",
        clientRequestId: "req-old",
        replyToCustomerTurnId: "c1",
      },
      {
        id: "c2",
        role: "customer",
        content: "是不是不能開玩笑？",
        createdAt: "2026-08-29T10:00:00.000Z",
        channel: "free_message",
        clientRequestId: "req-new",
      },
    ];
    const pending = resolveGo21PendingCoachReply(turns);
    expect(pending?.customerTurnId).toBe("c2");
    expect(pending?.clientRequestId).toBe("req-new");
  });

  it("ignores system reminder coach rows when deciding last meaningful turn", () => {
    const turns = [
      {
        id: "c1",
        role: "customer",
        content: "測試",
        createdAt: "2026-08-29T10:00:00.000Z",
        channel: "free_message",
        clientRequestId: "req-3",
      },
      {
        id: "a1",
        role: "coach",
        content: "正常回覆",
        createdAt: "2026-08-29T10:00:01.000Z",
        channel: "free_message",
        clientRequestId: "req-3",
        replyToCustomerTurnId: "c1",
      },
      {
        id: "sys1",
        role: "coach",
        content: "提醒喝水",
        createdAt: "2026-08-29T11:00:00.000Z",
        channel: "system",
        clientRequestId: null,
      },
    ];
    expect(resolveGo21PendingCoachReply(turns)).toBeNull();
  });

  it("usable coach_message clears failed interpretation", () => {
    const r = interpretGo21ChatSendResult({
      ok: true,
      customerAccepted: true,
      assistantStatus: "failed",
      coachMessage: "可以啊 😂",
    });
    expect(r.coachFailed).toBe(false);
    expect(r.coachOk).toBe(true);
  });

  it("context route loads latest turns and reconciles pending", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/app/api/coaching/portal/[token]/go21/context/route.ts"),
      "utf8",
    );
    expect(src).toContain('order("created_at", { ascending: false })');
    expect(src).toContain("resolveGo21PendingCoachReply");
    expect(src).toContain("findGo21TurnsByClientRequestId");
  });
});

describe("Go21 historical / corrupted Vision tolerance", () => {
  const CORRUPTED = "今天是會議午餐吃飯糰";

  it("detects structured vs corrupted vision summaries", () => {
    expect(go21VisionSummaryLooksStructured("非餐點｜可見：貓｜不建立飲食紀錄")).toBe(true);
    expect(go21VisionSummaryLooksStructured("午餐｜可見：炒麵｜信心：high")).toBe(true);
    expect(go21VisionSummaryLooksStructured(CORRUPTED)).toBe(false);
  });

  it("excludes corrupted meal-note vision when fresh photo turn runs", () => {
    const selected = selectGo21HistoricalVisionForGeneration({
      prior: [
        { summary: CORRUPTED, correction: null, foodRelevant: null },
        {
          summary: "午餐｜可見：炒麵｜信心：medium",
          correction: null,
          foodRelevant: true,
        },
      ],
      currentTurnHasPhoto: true,
      currentTurnNonFood: true,
    });
    expect(selected.every((s) => !s.summary.includes("飯糰") || /歷史影像/.test(s.summary))).toBe(
      true,
    );
    expect(selected.some((s) => s.summary.includes(CORRUPTED))).toBe(false);
    expect(selected.some((s) => /歷史影像/.test(s.summary) && /炒麵/.test(s.summary))).toBe(true);
  });

  it("fresh cat turn: corrupted history cannot become currentTurnEvidence", () => {
    const catObs: CoachingMealObservation = {
      mealSlot: "lunch",
      observedFoods: ["橘貓"],
      signals: [],
      evidenceText: ["一隻橘貓"],
      isFoodRelevant: false,
      subjectKind: "non_food",
      confidence: "high",
    };
    expect(assessGo21VisionFoodRelevance(catObs).isFoodRelevant).toBe(false);
    expect(pickGo21VisionVisibleHint(catObs)).toMatch(/貓/);

    const gated = gateGo21VisionObservations({
      observations: [catObs],
      mealSlotUnresolved: true,
      mealSlotResolved: null,
    });
    expect(gated.foodRelevant).toBe(false);

    const evidence = buildGo21CurrentTurnEvidence({
      hasPhoto: true,
      customerMessage: "",
      foodRelevant: false,
      imageDescription: "橘貓",
      visionSummary: gated.evidenceSummary,
      confidence: "high",
    });
    expect(evidence.kind).toBe("image_non_food");
    expect(evidence.imageDescription).toMatch(/貓/);
    expect(evidence.imageDescription).not.toMatch(/飯糰/);
    expect(go21CurrentTurnBlocksNutritionMutation(evidence)).toBe(true);

    const historical = selectGo21HistoricalVisionForGeneration({
      prior: [{ summary: CORRUPTED, correction: null, foodRelevant: null }],
      currentTurnHasPhoto: true,
      currentTurnNonFood: true,
    });
    expect(historical).toEqual([]);

    const gi = {
      enrollmentId: "enr",
      customerId: "cus",
      logDate: "2026-08-29",
      profileMemory: {
        displayName: "小美",
        goal: "減脂",
        daysSinceEnrollmentStart: 8,
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
          { mealSlot: "lunch", textNote: "會議午餐吃飯糰", storagePath: null },
          { mealSlot: "dinner", textNote: null, storagePath: null },
        ],
        secondaryMealNotes: [{ mealSlot: "snacks", textNote: "考慮晚餐沙拉", storagePath: null }],
        waterMl: 1200,
        sleepBedtime: null,
        sleepWakeTime: null,
        sleepDurationLabel: null,
        exerciseNote: null,
        bowelMovementCount: null,
        customerNote: "中午炒麵也考慮過",
      },
      rollingMemory: { recurringPatterns: [], recentWins: [], openConcerns: [] },
      recentCoachActionMemory: [],
    } as unknown as CoachingGenerationInput;

    const decision = buildMinimalDecisionContextForFreeMessage({
      generationInput: gi,
      freeMessage: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：橘貓",
      mealObservations: [],
      currentTurnNonFoodPhoto: true,
    });
    expect(decision.mealObservations).toEqual([]);

    const timeline = buildGo21TemporalTimeline({
      generationLogDate: "2026-08-29",
      todayMealNotes: [
        { slot: "lunch", note: "會議午餐吃飯糰" },
        { slot: "snacks", note: "考慮晚餐沙拉" },
      ],
      recentTurns: [],
      visionSummaries: [
        { summary: CORRUPTED, correction: null },
        { summary: "非餐點｜可見：橘貓｜不建立飲食紀錄", correction: null },
      ],
    });
    expect(timeline.todayEaten.some((e) => /貓/.test(e.label))).toBe(false);
    // Corrupted vision row must not invent an extra eaten entry from the cat turn
    expect(
      timeline.todayEaten.filter((e) => e.source === "vision" && /飯糰/.test(e.label)).length,
    ).toBe(0);

    const prompt = buildCoachingAiV2UserPrompt({
      generationInput: gi,
      decisionContext: decision,
      memory: {
        recentTurns: [],
        durableMemory: [],
        openLoops: [],
        hypotheses: [],
        lifecycle: {
          cycle: null,
          dayNumber: 8,
          stage: "find_patterns",
          intensiveActive: true,
          daysRemaining: 13,
        },
      } as CoachingAiV2MemoryBundle,
      channel: "free_message",
      freeMessage: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：橘貓",
      currentTurnEvidence: evidence,
      visionNonFood: true,
      recentVisionObservations: historical,
      coachDailyPlan: {
        items: [
          {
            id: "i1",
            period: "lunch",
            periodLabel: "午餐",
            name: "正常餐",
            amount: null,
            instruction: null,
          },
        ],
        today: [],
        guidance: "coachDailyPlan 是教練開的處方安排",
      },
    });
    expect(prompt).toMatch(/currentTurnEvidence|image_non_food|橘貓|非餐點/);
    expect(prompt).not.toMatch(/這張照片.*飯糰/);
  });

  it("TURN social — 是不是不能開玩笑？ usable reply, no nutrition force", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-should-not-be-called";
    try {
      const result = await generateCoachingAiV2({
        generationInput: {
          enrollmentId: "enr",
          customerId: "cus",
          logDate: "2026-08-29",
          profileMemory: {
            displayName: "小美",
            goal: "減脂",
            daysSinceEnrollmentStart: 8,
            planSnapshot: null,
            sex: null,
            heightCm: null,
            latestWeightKg: null,
            latestBodyFatPercent: null,
          },
          todayContext: {
            submitted: true,
            primaryMeals: [
              { mealSlot: "lunch", textNote: "飯糰", storagePath: null },
              { mealSlot: "breakfast", textNote: null, storagePath: null },
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
          rollingMemory: { recurringPatterns: [], recentWins: [], openConcerns: [] },
          recentCoachActionMemory: [],
        } as unknown as CoachingGenerationInput,
        decisionContext: buildMinimalDecisionContextForFreeMessage({
          generationInput: {
            enrollmentId: "enr",
            customerId: "cus",
            logDate: "2026-08-29",
            profileMemory: {
              displayName: "小美",
              goal: "減脂",
              daysSinceEnrollmentStart: 8,
              planSnapshot: null,
              sex: null,
              heightCm: null,
              latestWeightKg: null,
              latestBodyFatPercent: null,
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
            rollingMemory: { recurringPatterns: [], recentWins: [], openConcerns: [] },
            recentCoachActionMemory: [],
          } as unknown as CoachingGenerationInput,
          freeMessage: "是不是不能開玩笑？",
          mealObservations: [],
        }),
        finalInterventionLevel: "normal",
        memory: {
          recentTurns: [
            {
              id: "t1",
              role: "customer",
              content: "（傳了一張照片）\n\n[影像觀察｜非餐點]\n非餐點｜可見：橘貓",
              createdAt: "2026-08-29T09:00:00.000Z",
              logDate: "2026-08-29",
              channel: "free_message",
              intention: null,
              metadata: {},
            },
            {
              id: "t2",
              role: "coach",
              content: "這個不能吃啦 😂",
              createdAt: "2026-08-29T09:00:01.000Z",
              logDate: "2026-08-29",
              channel: "free_message",
              intention: "acknowledge",
              metadata: {},
            },
          ],
          durableMemory: [],
          openLoops: [],
          hypotheses: [],
          lifecycle: {
            cycle: null,
            dayNumber: 8,
            stage: "find_patterns",
            intensiveActive: true,
            daysRemaining: 13,
          },
        } as unknown as CoachingAiV2MemoryBundle,
        channel: "free_message",
        freeMessage: "是不是不能開玩笑？",
      });
      expect(result.draft.coachMessage.trim().length).toBeGreaterThan(0);
      expect(result.draft.coachMessage).not.toMatch(/蛋白質|熱量|奶昔|減脂目標/);
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  it("fresh real-food vision still foodRelevant", () => {
    const food: CoachingMealObservation = {
      mealSlot: "dinner",
      observedFoods: ["雞胸肉", "青花菜"],
      signals: [],
      evidenceText: ["盤中有雞胸與青花菜"],
      isFoodRelevant: true,
      subjectKind: "food",
      confidence: "high",
      visibleProteinSource: true,
      visibleVegetables: true,
    };
    expect(assessGo21VisionFoodRelevance(food).isFoodRelevant).toBe(true);
    const gated = gateGo21VisionObservations({
      observations: [food],
      mealSlotUnresolved: false,
      mealSlotResolved: "dinner",
    });
    expect(gated.foodRelevant).toBe(true);
    expect(gated.observations.length).toBe(1);
    const evidence = buildGo21CurrentTurnEvidence({
      hasPhoto: true,
      customerMessage: "",
      foodRelevant: true,
      imageDescription: "雞胸肉",
      visionSummary: gated.evidenceSummary,
    });
    expect(evidence.kind).toBe("image_food");
    expect(go21CurrentTurnBlocksNutritionMutation(evidence)).toBe(false);
  });
});

describe("Go21 Coach Daily Plan mobile layout", () => {
  it("activation + customer editors stack on mobile (no fixed 3-col only)", () => {
    const activation = readFileSync(
      resolve(process.cwd(), "src/components/quiz/Experience21dStartPage.tsx"),
      "utf8",
    );
    const customer = readFileSync(
      resolve(process.cwd(), "src/components/coaching/CoachingCustomerSection.tsx"),
      "utf8",
    );
    expect(activation).not.toMatch(/grid-cols-\[4\.5rem_1fr_5\.5rem\]/);
    expect(customer).not.toMatch(/grid-cols-\[3\.5rem_1fr_4\.5rem\]/);
    expect(activation).toContain("min-w-0");
    expect(customer).toContain("min-w-0");
    expect(activation).toMatch(/sm:grid/);
    expect(customer).toMatch(/sm:grid/);
  });
});
