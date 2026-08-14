import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shouldAttachMealImagesToDailyCoach } from "@/lib/coaching/ai/model-config";
import { resolveCustomerFacingAiProgress } from "@/lib/coaching/ai/customer-facing-ai-progress";

function readSrc(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("AI-PERF architecture (P0.2)", () => {
  it("AI-PERF-01 meal vision is not a sequential three-call waterfall", () => {
    const observe = readSrc("src/lib/coaching/ai/observe-coaching-meals.ts");
    // One batched multimodal OpenAI call — not breakfast→await→lunch→await→dinner.
    expect(observe).toContain("callOpenAiMealVisionObservation");
    expect(observe).not.toMatch(
      /for\s*\([^)]*mealSlot[\s\S]*?await\s+callOpenAiMealVisionObservation/,
    );
    const callCount = (observe.match(/await callOpenAiMealVisionObservation/g) ?? []).length;
    expect(callCount).toBeLessThanOrEqual(1);
  });

  it("AI-PERF-02 deterministic Layer1 does not call LLM", () => {
    const layer1 = readSrc("src/lib/coaching/immediate-daily-feedback.ts");
    expect(layer1).toMatch(/Never calls OpenAI|deterministic/i);
    expect(layer1).not.toContain("openai.com");
    expect(layer1).not.toContain("generateDailyCoach");
    expect(layer1).not.toContain("observeCoachingMeals");
  });

  it("AI-PERF-03 directive verification reuses meal vision results", () => {
    const job = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
    expect(job).toContain("mealObservations");
    expect(job).toContain("buildCoachingDecisionContext");
    // No second vision call dedicated to directives.
    expect(job).not.toMatch(/observeDirective|verifyDirectiveVision|directiveVision/);
    const signal = readSrc("src/lib/coaching/ai/coaching-signal-engine.ts");
    expect(signal).toContain("verifyCoachDirectivesAgainstMeals");
  });

  it("AI-PERF-04 worker reuses context daily log / directives (no duplicate fetches)", () => {
    const job = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
    expect(job).toContain("loaded.todayLog");
    expect(job).toContain("loaded.recentLogs");
    expect(job).toContain("loaded.activeStructuredDirectives");
    expect(job).not.toContain("getCoachingDailyLogDetail(");
    expect(job).not.toContain("listActiveStructuredDirectivesForDay(");
    expect(job).not.toContain("listCoachingDailyLogsForEnrollment(");
    const context = readSrc("src/lib/coaching/ai/load-coaching-generation-context.ts");
    expect(context).toContain("Promise.all");
  });

  it("AI-PERF-05 pending output stale recovery still wired", () => {
    const route = readSrc("src/app/api/coaching/portal/[token]/ai-output/route.ts");
    expect(route).toContain("recoverStalePendingCoachingAiOutput");
    expect(route).toContain("kickCoachingGenerationWorkerBestEffort");
    const recover = readSrc("src/lib/coaching/ai/recover-stale-coaching-ai-output.ts");
    expect(recover).toContain("COACHING_AI_STALE_PENDING_MS");
  });

  it("AI-PERF-06 AI failure Layer1 still exists independently", () => {
    const portal = readSrc("src/components/coaching/CoachingCustomerPortalPage.tsx");
    // Portal still loads immediate feedback path; Layer1 is not gated on AI completion.
    expect(portal).toMatch(/immediate|ImmediateDailyFeedback|loadImmediate/i);
    const layer1 = readSrc("src/lib/coaching/immediate-daily-feedback.ts");
    expect(layer1.length).toBeGreaterThan(100);
  });

  it("AI-PERF-07 supersede requeues instead of orphan pending", () => {
    const job = readSrc("src/lib/coaching/ai/process-coaching-generation-job.ts");
    expect(job).toContain("fingerprint_stale_superseded_requeued");
    expect(job).toContain("insertQueuedGenerationJob");
    expect(job).toContain("upsertPendingCoachingAiOutput");
  });

  it("AI-PERF-08 progress stage labels avoid internal terminology", () => {
    const view = readSrc("src/components/coaching/CoachingDailyCompleteView.tsx");
    const labelsBlock = view.match(/const PROGRESS_LABELS[\s\S]*?\};/)?.[0] ?? "";
    expect(labelsBlock).toContain("今天回報已收到");
    expect(labelsBlock).toContain("正在看看今天的飲食");
    expect(labelsBlock).toContain("正在整理今天的狀況");
    expect(labelsBlock).toContain("正在產生給你的建議");
    expect(labelsBlock).toContain("完成");
    expect(labelsBlock).not.toMatch(/pending|processing|queue_wait|vision_ms|coach_ms/);
    expect(labelsBlock).not.toMatch(/假百分比|63%|82%/);
    const progress = resolveCustomerFacingAiProgress("pending");
    expect(progress.activeStep).toBe("organizing_meals");
    expect(shouldAttachMealImagesToDailyCoach()).toBe(false);
  });

  it("P0.2 daily coach does not re-send photos by default", () => {
    const provider = readSrc("src/lib/coaching/ai/coaching-ai-provider.ts");
    expect(provider).toContain("shouldAttachMealImagesToDailyCoach");
    expect(shouldAttachMealImagesToDailyCoach()).toBe(false);
  });

  it("AI-PERF-09 P0.4 squeezes image edge / coach max_tokens / prior hash cap", () => {
    const constants = readSrc("src/lib/coaching/ai/coaching-meal-photo-constants.ts");
    const provider = readSrc("src/lib/coaching/ai/coaching-ai-provider.ts");
    const observe = readSrc("src/lib/coaching/ai/observe-coaching-meals.ts");
    const prompts = readSrc("src/lib/coaching/ai/coaching-daily-coach-prompts.ts");
    expect(constants).toContain("COACHING_AI_MEAL_IMAGE_MAX_LONG_EDGE = 768");
    expect(constants).toContain("COACHING_AI_MEAL_IMAGE_JPEG_QUALITY = 72");
    expect(constants).toContain("COACHING_AI_PRIOR_PHOTO_HASH_MAX_IMAGES = 6");
    expect(provider).toContain("max_tokens: 1400");
    expect(observe).toContain("max_tokens: 900");
    expect(prompts).toContain("P0.2/P0.4 compact payload");
    expect(prompts).toContain("compactPlan");
  });
});
