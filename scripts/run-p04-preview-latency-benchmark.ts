/**
 * P0.4 Preview latency squeeze benchmark — Scenarios A/B/C ×5.
 *
 * Usage:
 *   PREVIEW_BASE_URL=https://… \
 *   npx vercel env run --environment=preview -- npx tsx scripts/run-p04-preview-latency-benchmark.ts
 *
 * Never prints secrets / PII / prompt text / photo content.
 * Writes .tmp-p04-preview-latency-benchmark.json
 */
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  attachMealPhoto,
  createCoachingEnrollment,
  upsertCoachingDailyLog,
} from "../src/lib/coaching/coaching-service";
import { coachingTodayLogDate } from "../src/lib/coaching/coaching-time";
import { cloneDefaultCoachingPlanSnapshot } from "../src/lib/coaching/default-instructions";
import { defaultPlannedEndDate } from "../src/lib/coaching/enrollment-window";
import { enqueueDailyCoachGenerationFast } from "../src/lib/coaching/ai/enqueue-daily-coach-generation-fast";
import {
  claimCoachingGenerationJobs,
  getCoachingAiOutputForDay,
} from "../src/lib/coaching/ai/coaching-ai-store";
import { processCoachingGenerationJob } from "../src/lib/coaching/ai/process-coaching-generation-job";
import { createCoachDirective } from "../src/lib/coaching/coach-directives/coach-directive-service";
import { COACHING_AI_MEAL_PHOTO_BUCKET } from "../src/lib/coaching/ai/coaching-meal-photo-constants";
import type { CoachingAiLatencyBreakdownMs } from "../src/lib/coaching/ai/coaching-ai-latency";
import type { CoachingGenerationJobRecord } from "../src/types/coaching-ai";

type ScenarioId = "A_photos" | "B_text_only" | "C_photos_directive";

type RunRow = {
  scenario: ScenarioId;
  run: number;
  logDate: string;
  ok: boolean;
  error?: string;
  queue_wait_ms: number | null;
  context_load_ms: number | null;
  photo_prepare_ms: number | null;
  vision_total_ms: number | null;
  coach_ms: number | null;
  persist_ms: number | null;
  submit_to_complete_ms: number | null;
  worker_total_ms: number | null;
  wall_clock_ms: number | null;
  request_count_estimate: { vision: number; coach: number };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.includes("SENSITIVE")) {
    throw new Error(`missing_or_placeholder:${name}`);
  }
  return value;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

function summarize(values: Array<number | null | undefined>) {
  const nums = values
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);
  return {
    n: nums.length,
    min: nums[0] ?? null,
    max: nums[nums.length - 1] ?? null,
    p50: percentile(nums, 50),
    p95: percentile(nums, 95),
  };
}

async function uploadFixturePhoto(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { storage: any };
  customerId: string;
  enrollmentId: string;
  logDate: string;
  mealSlot: "breakfast" | "lunch" | "dinner";
  localFile: string;
}): Promise<string> {
  const buf = readFileSync(input.localFile);
  const storagePath = `${input.customerId}/${input.enrollmentId}/${input.logDate}/${input.mealSlot}/p02-${randomBytes(6).toString("hex")}.jpg`;
  const { error } = await input.supabase.storage
    .from(COACHING_AI_MEAL_PHOTO_BUCKET)
    .upload(storagePath, buf, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`upload_failed:${input.mealSlot}:${error.message}`);
  return storagePath;
}

async function claimJobForDay(input: {
  enrollmentId: string;
  logDate: string;
}): Promise<CoachingGenerationJobRecord> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const claimed = await claimCoachingGenerationJobs({
      limit: 5,
      lockedBy: `p04-bench-${randomBytes(4).toString("hex")}`,
    });
    const hit = claimed.find((j) => j.enrollmentId === input.enrollmentId && j.logDate === input.logDate);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  throw new Error("claim_missed");
}

async function main() {
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const openai = process.env.OPENAI_API_KEY?.trim();
  if (!openai || openai.includes("SENSITIVE")) {
    throw new Error("missing_or_placeholder:OPENAI_API_KEY");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = coachingTodayLogDate();

  const { data: member, error: memberError } = await supabase.from("members").select("id").limit(1).maybeSingle();
  if (memberError || !member?.id) throw new Error(`no_member:${memberError?.message ?? "empty"}`);
  const ownerMemberId = String(member.id);

  const startDate = addDays(today, -14);
  const fixturesDir = resolve(process.cwd(), "test-fixtures/coaching-meals");
  const fixtureFiles = {
    breakfast: resolve(fixturesDir, "breakfast-shake.jpg"),
    lunch: resolve(fixturesDir, "lunch-fried-rice.jpg"),
    dinner: resolve(fixturesDir, "dinner-shake-veg.jpg"),
  };
  for (const path of Object.values(fixtureFiles)) {
    if (!existsSync(path)) throw new Error(`missing_fixture:${path}`);
  }

  const runs: RunRow[] = [];
  const scenarios: Array<{ id: ScenarioId; withPhotos: boolean; withDirective: boolean }> = [
    { id: "A_photos", withPhotos: true, withDirective: false },
    { id: "B_text_only", withPhotos: false, withDirective: false },
    { id: "C_photos_directive", withPhotos: true, withDirective: true },
  ];

  for (const scenario of scenarios) {
    const scenarioCustomerId = randomUUID();
    const scenarioDisplayName = `P04-${scenario.id}-${today.slice(5)}`;
    const { error: scenarioCustErr } = await supabase.from("customers").insert({
      id: scenarioCustomerId,
      owner_member_id: ownerMemberId,
      display_name: scenarioDisplayName,
    });
    if (scenarioCustErr) throw new Error(`customer_insert:${scenarioCustErr.message}`);

    const scenarioEnrollment = await createCoachingEnrollment({
      customerId: scenarioCustomerId,
      ownerMemberId,
      goal: "健康減脂",
      startDate,
      plannedEndAt: defaultPlannedEndDate(startDate),
      planSnapshot: cloneDefaultCoachingPlanSnapshot(),
    });

    const portal = {
      customerId: scenarioCustomerId,
      enrollmentId: scenarioEnrollment.id,
      ownerMemberId,
      displayName: scenarioDisplayName,
    };

    if (scenario.withDirective) {
      await createCoachDirective({
        enrollmentId: scenarioEnrollment.id,
        customerId: scenarioCustomerId,
        ownerMemberId,
        mealSlot: "breakfast",
        instructionText: "早餐喝奶昔",
        effectiveFrom: addDays(today, -2),
        effectiveUntil: addDays(today, 30),
        customerVisible: true,
      });
    }

    for (let run = 1; run <= 5; run += 1) {
      const logDate = addDays(today, -(run - 1));
      const wallStart = Date.now();
      try {
        const submittedAt = new Date().toISOString();
        await upsertCoachingDailyLog({
          portal,
          logDate,
          waterMl: scenario.id === "B_text_only" ? 2500 : 3200,
          bowelMovementCount: 1,
          customerNote: scenario.id === "B_text_only" ? "今天文字回報" : null,
          meals: {
            breakfast: { textNote: scenario.withPhotos ? "奶昔" : "燕麥＋蛋" },
            lunch: { textNote: scenario.withPhotos ? "炒飯" : "雞胸沙拉" },
            dinner: { textNote: scenario.withPhotos ? "奶昔＋青菜" : "清蒸魚" },
          },
          markSubmitted: true,
          sleepBedtime: "23:30",
          sleepWakeTime: "07:00",
          exerciseNote: "快走 20 分",
        });

        if (scenario.withPhotos) {
          for (const mealSlot of ["breakfast", "lunch", "dinner"] as const) {
            const storagePath = await uploadFixturePhoto({
              supabase,
              customerId: scenarioCustomerId,
              enrollmentId: scenarioEnrollment.id,
              logDate,
              mealSlot,
              localFile: fixtureFiles[mealSlot],
            });
            await attachMealPhoto({ portal, logDate, mealSlot, storagePath });
          }
        }

        const enqueueStarted = Date.now();
        const enqueued = await enqueueDailyCoachGenerationFast({
          enrollmentId: scenarioEnrollment.id,
          ownerMemberId,
          customerId: scenarioCustomerId,
          logDate,
          submittedAt,
        });
        if (enqueued.action === "skip") {
          throw new Error(`enqueue_skip:${enqueued.reason}`);
        }

        const job = await claimJobForDay({ enrollmentId: scenarioEnrollment.id, logDate });
        const claimAt = Date.now();
        const result = await processCoachingGenerationJob(job);
        const breakdown: Partial<CoachingAiLatencyBreakdownMs> =
          result.outcome === "completed" && "breakdown" in result && result.breakdown
            ? result.breakdown
            : {};
        const output = await getCoachingAiOutputForDay({
          enrollmentId: scenarioEnrollment.id,
          logDate,
        });
        const wall = Date.now() - wallStart;

        runs.push({
          scenario: scenario.id,
          run,
          logDate,
          ok: result.outcome === "completed" && output?.status === "completed",
          error:
            result.outcome !== "completed"
              ? String(result.outcome)
              : output?.status !== "completed"
                ? `output_${output?.status ?? "missing"}`
                : undefined,
          queue_wait_ms: breakdown.queue_wait_ms ?? Math.max(0, claimAt - enqueueStarted),
          context_load_ms: breakdown.context_load_ms ?? null,
          photo_prepare_ms: breakdown.photo_prepare_ms ?? null,
          vision_total_ms: breakdown.vision_ms ?? null,
          coach_ms: breakdown.coach_ms ?? null,
          persist_ms: breakdown.persist_ms ?? null,
          submit_to_complete_ms: breakdown.submit_to_complete_ms ?? wall,
          worker_total_ms: breakdown.worker_total_ms ?? null,
          wall_clock_ms: wall,
          request_count_estimate: {
            vision: scenario.withPhotos ? 1 : 0,
            coach: 1,
          },
        });
      } catch (error) {
        runs.push({
          scenario: scenario.id,
          run,
          logDate,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          queue_wait_ms: null,
          context_load_ms: null,
          photo_prepare_ms: null,
          vision_total_ms: null,
          coach_ms: null,
          persist_ms: null,
          submit_to_complete_ms: null,
          worker_total_ms: null,
          wall_clock_ms: Date.now() - wallStart,
          request_count_estimate: { vision: scenario.withPhotos ? 1 : 0, coach: 1 },
        });
      }
    }
  }

  const byScenario = Object.fromEntries(
    scenarios.map((s) => {
      const rows = runs.filter((r) => r.scenario === s.id);
      return [
        s.id,
        {
          runs: rows,
          submit_to_complete_ms: summarize(rows.map((r) => r.submit_to_complete_ms)),
          queue_wait_ms: summarize(rows.map((r) => r.queue_wait_ms)),
          context_load_ms: summarize(rows.map((r) => r.context_load_ms)),
          photo_prepare_ms: summarize(rows.map((r) => r.photo_prepare_ms)),
          vision_total_ms: summarize(rows.map((r) => r.vision_total_ms)),
          coach_ms: summarize(rows.map((r) => r.coach_ms)),
          persist_ms: summarize(rows.map((r) => r.persist_ms)),
          worker_total_ms: summarize(rows.map((r) => r.worker_total_ms)),
          okCount: rows.filter((r) => r.ok).length,
        },
      ];
    }),
  );

  const successful = runs.filter((r) => r.ok);
  const report = {
    type: "p04_preview_latency_benchmark",
    generatedAt: new Date().toISOString(),
    ownerMemberId,
    previewBaseUrl: process.env.PREVIEW_BASE_URL ?? null,
    visionArchitecture: "scheme_B_batched_multimodal_one_request",
    dailyCoachAttachesMealImages: process.env.COACHING_DAILY_COACH_ATTACH_MEAL_IMAGES === "1",
    successRate: runs.length === 0 ? 0 : successful.length / runs.length,
    successCount: successful.length,
    runCount: runs.length,
    orphanCount: runs.filter((r) => !r.ok && (r.error === "claim_missed" || r.error?.includes("orphan"))).length,
    overall: {
      queue_wait_ms: summarize(successful.map((r) => r.queue_wait_ms)),
      context_load_ms: summarize(successful.map((r) => r.context_load_ms)),
      photo_prepare_ms: summarize(successful.map((r) => r.photo_prepare_ms)),
      vision_total_ms: summarize(successful.map((r) => r.vision_total_ms)),
      coach_ms: summarize(successful.map((r) => r.coach_ms)),
      persist_ms: summarize(successful.map((r) => r.persist_ms)),
      worker_total_ms: summarize(successful.map((r) => r.worker_total_ms)),
      submit_to_complete_ms: summarize(successful.map((r) => r.submit_to_complete_ms)),
    },
    byScenario,
    runs,
  };

  writeFileSync(".tmp-p04-preview-latency-benchmark.json", JSON.stringify(report, null, 2));
  console.log(
    `P04_BENCH:${JSON.stringify({
      ok: runs.every((r) => r.ok),
      successRate: report.successRate,
      orphanCount: report.orphanCount,
      previewBaseUrl: report.previewBaseUrl,
      overall: report.overall,
      byScenario: Object.fromEntries(
        Object.entries(byScenario).map(([k, v]) => [
          k,
          {
            okCount: (v as { okCount: number }).okCount,
            submit_to_complete_ms: (v as { submit_to_complete_ms: unknown }).submit_to_complete_ms,
            queue_wait_ms: (v as { queue_wait_ms: unknown }).queue_wait_ms,
            vision_total_ms: (v as { vision_total_ms: unknown }).vision_total_ms,
            coach_ms: (v as { coach_ms: unknown }).coach_ms,
            worker_total_ms: summarize(
              (v as { runs: RunRow[] }).runs.filter((r) => r.ok).map((r) => r.worker_total_ms),
            ),
          },
        ]),
      ),
      runCount: runs.length,
    })}`,
  );
}

main().catch((error) => {
  console.error(
    `P04_BENCH:${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}`,
  );
  process.exit(1);
});
