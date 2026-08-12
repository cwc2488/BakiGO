import { describe, expect, it } from "vitest";
import { applyCoachingDecisionContextToOutput } from "@/lib/coaching/ai/apply-coaching-decision-context";
import { buildCoachingGenerationInput } from "@/lib/coaching/ai/build-coaching-generation-input";
import { extractCustomerVoiceSignals } from "@/lib/coaching/ai/extract-customer-voice";
import { buildHeuristicMealObservations } from "@/lib/coaching/ai/observe-coaching-meals";
import { buildCoachingDecisionContext } from "@/lib/coaching/ai/coaching-signal-engine";
import { computeMealImageContentSha256, detectCoachingPhotoReuse } from "@/lib/coaching/ai/detect-photo-reuse";
import { cloneDefaultCoachingPlanSnapshot } from "@/lib/coaching/default-instructions";
import {
  COACHING_DAILY_GENERATION_OUTPUT_VERSION,
  type CoachingDailyGenerationOutputJson,
  type CoachingGenerationInput,
  type PreparedCoachingMealImage,
} from "@/types/coaching-ai";
import type { CoachingDailyLogDetail, CoachingEnrollment } from "@/types/coaching";

const ENROLLMENT: CoachingEnrollment = {
  id: "golden-enroll",
  customerId: "golden-cust",
  ownerMemberId: "golden-member",
  goal: "健康減脂",
  status: "active",
  startedAt: "2026-07-01T00:00:00.000Z",
  endedAt: null,
  onboardingCompletedAt: "2026-07-01T01:00:00.000Z",
  planSnapshot: {
    ...cloneDefaultCoachingPlanSnapshot(),
    dailyInstructions: {
      ...cloneDefaultCoachingPlanSnapshot().dailyInstructions,
      hydration: ["每天喝水 5000 ml"],
    },
  },
  baselineBodyRecordId: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

function meal(
  slot: CoachingDailyLogDetail["meals"][number]["mealSlot"],
  textNote: string | null,
  hasPhoto: boolean,
): CoachingDailyLogDetail["meals"][number] {
  return {
    id: `${slot}-entry`,
    dailyLogId: "golden-log",
    mealSlot: slot,
    textNote,
    eatenAt: null,
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T08:00:00.000Z",
    photo: hasPhoto
      ? {
          id: `${slot}-photo`,
          mealEntryId: `${slot}-entry`,
          storagePath: `golden/${slot}.jpg`,
          uploadedAt: "2026-08-11T08:00:00.000Z",
          createdAt: "2026-08-11T08:00:00.000Z",
        }
      : null,
  };
}

function buildGoldenGenerationInput(): CoachingGenerationInput {
  const todayLog: CoachingDailyLogDetail = {
    id: "golden-log",
    enrollmentId: ENROLLMENT.id,
    customerId: ENROLLMENT.customerId,
    ownerMemberId: ENROLLMENT.ownerMemberId,
    logDate: "2026-08-11",
    waterMl: 3000,
    exerciseNote: "1 小時",
    bowelMovementCount: 2,
    sleepDuration: "8小時",
    sleepBedtime: "00:24",
    sleepWakeTime: "08:24",
    customerNote: "還是會很餓",
    submittedAt: "2026-08-11T12:00:00.000Z",
    createdAt: "2026-08-11T08:00:00.000Z",
    updatedAt: "2026-08-11T12:00:00.000Z",
    meals: [
      meal("breakfast", "喝奶昔", true),
      meal("lunch", "炒飯", true),
      meal("dinner", "喝奶昔", true),
    ],
  };

  return buildCoachingGenerationInput({
    enrollment: ENROLLMENT,
    customer: { displayName: "測試客戶", heightCm: 165, sex: "female", region: "台北", occupation: undefined },
    logDate: "2026-08-11",
    todayLog,
    recentLogs: [todayLog],
    bodyRecords: [],
  });
}

function fakePrepared(slot: "breakfast" | "lunch" | "dinner", bytes: string): PreparedCoachingMealImage {
  const buffer = Buffer.from(bytes);
  return {
    mealSlot: slot,
    sourceStoragePath: `golden/${slot}.jpg`,
    mimeType: "image/jpeg",
    width: 64,
    height: 64,
    byteLength: buffer.byteLength,
    buffer,
    originalWidth: 64,
    originalHeight: 64,
    originalByteLength: buffer.byteLength,
  };
}

describe("golden production case — shake / fried rice / hunger", () => {
  it("builds deterministic intermediates that capture meals, hunger, and hydration plan authority", () => {
    const generationInput = buildGoldenGenerationInput();
    expect(generationInput.todayContext.customerNote).toBe("還是會很餓");
    expect(generationInput.todayContext.waterMl).toBe(3000);
    expect(generationInput.todayContext.primaryMeals.map((m) => m.textNote)).toEqual([
      "喝奶昔",
      "炒飯",
      "喝奶昔",
    ]);

    const customerVoice = extractCustomerVoiceSignals(generationInput.todayContext.customerNote);
    expect(customerVoice.some((item) => item.key === "hunger_reported")).toBe(true);

    const prepared = [
      fakePrepared("breakfast", "shake-a"),
      fakePrepared("lunch", "fried-rice-b"),
      fakePrepared("dinner", "shake-c"),
    ];
    const mealObservations = buildHeuristicMealObservations({
      generationInput,
      preparedMealImages: prepared,
    });

    expect(mealObservations.find((item) => item.mealSlot === "lunch")?.observedFoods.join(",")).toContain("炒飯");
    expect(mealObservations.find((item) => item.mealSlot === "lunch")?.signals).toContain("fried_food");

    const breakfast = mealObservations.find((item) => item.mealSlot === "breakfast");
    expect(breakfast?.shakeObserved).toBe(true);
    expect(breakfast?.noOtherFoodVisible).toBe(true);
    expect(breakfast?.uncertainties?.length).toBeGreaterThan(0);
    expect(breakfast?.followUpQuestion).toMatch(/照片裡目前只看到奶昔|除了奶昔/);

    const decision = buildCoachingDecisionContext({
      generationInput,
      mealObservations,
      customerVoice,
      photoReuse: [],
      pendingFollowUps: [],
    });

    expect(decision.priorities.length).toBeGreaterThan(0);
    expect(decision.priorities.length).toBeLessThanOrEqual(2);
    expect(decision.priorities.some((item) => item.signalKey.includes("hunger") || item.reason.includes("餓"))).toBe(
      true,
    );
    expect(decision.priorities.some((item) => item.signalKey === "hydration_below_plan")).toBe(true);
    // Must not invent a hydration target number in subject.
    for (const priority of decision.priorities) {
      expect(priority.tomorrowFocusSubject).not.toMatch(/\d{4}\s*ml/);
    }

    const draft: CoachingDailyGenerationOutputJson = {
      version: COACHING_DAILY_GENERATION_OUTPUT_VERSION,
      customer: {
        encouragement: "你今天有完整回報，先肯定這份誠實。",
        today_feedback: "午餐炒飯比較需要收一點，奶昔餐我們先確認有沒有搭配。",
        daily_food_summary: "早餐／晚餐主要回報奶昔，午餐是炒飯。",
        meal_feedback: {
          breakfast: {
            summary: "看起來主要是奶昔。",
            good_point: null,
            adjustment: null,
            follow_up_question: "除了奶昔還有吃別的嗎？",
          },
          lunch: {
            summary: "午餐是炒飯。",
            good_point: null,
            adjustment: "份量收一點，再補肉蛋青菜。",
            follow_up_question: null,
          },
          dinner: {
            summary: "晚餐同樣主要回報奶昔。",
            good_point: null,
            adjustment: null,
            follow_up_question: "晚餐除了奶昔還有搭配嗎？",
          },
        },
        lifestyle_feedback: {
          hydration: "水分有喝到，但還沒到計畫目標，明天再補一點。",
          sleep: "睡滿 8 小時，但躺床偏晚。",
          exercise: "有運動 1 小時，這點很棒。",
        },
        customer_voice_response: "",
        adjustment_priorities: ["亂寫主題"],
        tomorrow_focus: "亂寫焦點",
        follow_up_for_tomorrow: null,
      },
      coach: {
        daily_summary: "飢餓感受＋午餐炒飯＋水分未達計畫。",
        recurring_issue: null,
        improved_issue: null,
        proposed_intervention_level: "coach_attention",
        coach_attention_required: true,
        attention_reason: "should_be_overwritten",
        evidence: [],
        follow_ups: [],
        photo_reuse_flags: [],
      },
    };

    const applied = applyCoachingDecisionContextToOutput(draft, decision);
    expect(applied.customer.customer_voice_response).toMatch(/餓/);
    expect(applied.customer.adjustment_priorities.length).toBeLessThanOrEqual(2);
    expect(applied.customer.adjustment_priorities.join("")).not.toContain("亂寫主題");
    expect(applied.coach.proposed_intervention_level).toBe(decision.finalInterventionLevel);
    expect(applied.coach.follow_ups.some((item) => item.subject === "hunger")).toBe(true);
    expect(applied.customer.daily_food_summary).toMatch(/炒飯|奶昔/);
    expect(applied.customer.meal_feedback.lunch?.summary).toMatch(/炒飯/);
    expect(applied.customer.meal_feedback.breakfast?.follow_up_question).toMatch(/奶昔/);
  });

  it("detects exact photo reuse via sha256", async () => {
    const buffer = Buffer.from("same-bytes-photo");
    const prepared = [fakePrepared("lunch", "same-bytes-photo")];
    const prior = [
      {
        logDate: "2026-08-10",
        mealSlot: "lunch" as const,
        contentSha256: computeMealImageContentSha256(buffer),
        phash: null,
      },
    ];
    const reuse = await detectCoachingPhotoReuse({ preparedImages: prepared, priorHashes: prior });
    expect(reuse[0]?.suspected).toBe(true);
    expect(reuse[0]?.method).toBe("sha256");
    expect(reuse[0]?.matchedLogDate).toBe("2026-08-10");
  });
});
