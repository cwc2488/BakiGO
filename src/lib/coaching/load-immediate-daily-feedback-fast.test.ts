import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service-client", () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.limit = async () => ({ data: [], error: null });
        return chain;
      },
    }),
  }),
}));

describe("loadImmediateDailyFeedbackForSubmit", () => {
  it("builds Layer1 from today log without historical loads", async () => {
    const { loadImmediateDailyFeedbackForSubmit } = await import(
      "@/lib/coaching/load-immediate-daily-feedback-fast"
    );
    const feedback = await loadImmediateDailyFeedbackForSubmit({
      enrollmentId: "enr-1",
      logDate: "2026-08-12",
      dailyLog: {
        id: "log-1",
        enrollmentId: "enr-1",
        logDate: "2026-08-12",
        waterMl: 1500,
        exerciseNote: "walk",
        bowelMovementCount: 1,
        sleepDuration: "7小時",
        sleepBedtime: "23:00",
        sleepWakeTime: "07:00",
        customerNote: null,
        submittedAt: "2026-08-12T10:00:00.000Z",
        meals: [
          { mealSlot: "breakfast", textNote: "eggs", eatenAt: null, photo: null },
          { mealSlot: "lunch", textNote: "rice", eatenAt: null, photo: null },
          { mealSlot: "dinner", textNote: "soup", eatenAt: null, photo: null },
        ],
      } as never,
    });
    expect(feedback.title).toBeTruthy();
    expect(feedback.lines.length).toBeGreaterThan(0);
    expect(feedback.primaryMealsDone).toBe(3);
    expect(feedback.waterMl).toBe(1500);
  });
});
