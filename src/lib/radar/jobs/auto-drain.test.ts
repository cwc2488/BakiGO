import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ALLOCATION_RULES } from "@/lib/radar/allocation/allocation-rules";
import { previewRadarLiveGuard } from "@/lib/radar/live/preview-auth";
import { shouldUseRadarFixtureAdapters } from "@/lib/radar/sources/live-mode";
import {
  RADAR_ABANDONED_RECLAIM_MINUTES,
  RADAR_HOBBY_DAILY_CRONS,
  RADAR_JOB_HARD_TIMEOUT_MS,
  RADAR_PROCESS_BUDGET_MS,
  RADAR_PROCESS_CLAIM_LIMIT,
  nextRadarDrainAction,
  parseRadarProcessMode,
  resolveRadarInternalOrigin,
} from "./auto-drain";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "./queue";
import { GET as processGet, POST as processPost } from "@/app/api/radar/jobs/process/route";
import { GET as dailyGet } from "@/app/api/radar/jobs/daily-pipeline/route";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("RADAR-AUTO-01 process mode", () => {
  it("GET and continue=true drain in-request for 180s without relying on after()", () => {
    expect(RADAR_PROCESS_CLAIM_LIMIT).toBe(1);
    expect(RADAR_PROCESS_BUDGET_MS).toBe(180_000);
    expect(RADAR_PROCESS_BUDGET_MS + RADAR_JOB_HARD_TIMEOUT_MS).toBeLessThan(300_000);
    expect(RADAR_JOB_HARD_TIMEOUT_MS).toBe(90_000);
    expect(RADAR_ABANDONED_RECLAIM_MINUTES).toBe(30);

    expect(parseRadarProcessMode({ method: "GET" })).toEqual({
      continueDrain: true,
      claimLimit: 1,
      budgetMs: 180_000,
      pipeline_run_id: null,
    });
    expect(
      parseRadarProcessMode({
        method: "POST",
        body: { continue: true, limit: 25, pipeline_run_id: "run-1" },
      }),
    ).toEqual({
      continueDrain: true,
      claimLimit: 1,
      budgetMs: 180_000,
      pipeline_run_id: "run-1",
    });
  });

  it("one-shot POST keeps existing limit semantics and does not auto-continue", () => {
    expect(parseRadarProcessMode({ method: "POST", body: { limit: 1 } })).toEqual({
      continueDrain: false,
      claimLimit: 1,
      budgetMs: Number.POSITIVE_INFINITY,
      pipeline_run_id: null,
    });
    expect(parseRadarProcessMode({ method: "POST" }).claimLimit).toBe(25);
  });

  it("continues while work was processed and finalizes when the queue is empty", () => {
    expect(nextRadarDrainAction({ processed: 2, pipeline_run_id: "run-1" })).toEqual({
      kind: "continue",
      pipeline_run_id: "run-1",
    });
    expect(nextRadarDrainAction({ processed: 0, pipeline_run_id: "run-1" })).toEqual({
      kind: "finalize",
      pipeline_run_id: "run-1",
    });
  });

  it("resolves Production worker calls to bakigo.tw", () => {
    const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
    const previousVercel = process.env.VERCEL;
    const previousEnv = process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    expect(resolveRadarInternalOrigin()).toBe("https://bakigo.tw");
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  });
});

describe("RADAR-AUTO-01 queue continuation", () => {
  it("a later invocation claims remaining pending jobs without duplicating the running one", async () => {
    const store = new InMemoryRadarJobQueueStore();
    const queue = new RadarJobQueue(store);
    const now = new Date("2026-08-22T03:00:00.000Z");

    await queue.enqueue({ job_type: "enrich", idempotency_key: "e:1", pipeline_run_id: "run-a" }, now);
    await queue.enqueue({ job_type: "enrich", idempotency_key: "e:2", pipeline_run_id: "run-a" }, now);
    await queue.enqueue({ job_type: "enrich", idempotency_key: "e:3", pipeline_run_id: "run-a" }, now);

    const first = await queue.claim({ limit: 1, now });
    const second = await queue.claim({ limit: 1, now });
    const third = await queue.claim({ limit: 1, now });
    const none = await queue.claim({ limit: 1, now });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(third).toHaveLength(1);
    expect(none).toHaveLength(0);
    expect(new Set([first[0].id, second[0].id, third[0].id]).size).toBe(3);
  });
});

describe("RADAR-AUTO-01 route contracts", () => {
  const previousSecret = process.env.RADAR_CRON_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.RADAR_CRON_SECRET;
    else process.env.RADAR_CRON_SECRET = previousSecret;
  });

  it("cron endpoints reject missing Authorization", async () => {
    delete process.env.RADAR_CRON_SECRET;
    const processRes = await processGet(new Request("https://bakigo.tw/api/radar/jobs/process"));
    const dailyRes = await dailyGet(new Request("https://bakigo.tw/api/radar/jobs/daily-pipeline"));
    const postRes = await processPost(
      new Request("https://bakigo.tw/api/radar/jobs/process", { method: "POST" }),
    );
    expect(processRes.status).toBe(401);
    expect(dailyRes.status).toBe(401);
    expect(postRes.status).toBe(401);
  });

  it("cron endpoints reject a bearer that is not RADAR_CRON_SECRET", async () => {
    process.env.RADAR_CRON_SECRET = "radar-secret";
    const res = await processGet(
      new Request("https://bakigo.tw/api/radar/jobs/process", {
        headers: { authorization: "Bearer other-secret" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("auth helper still compares only RADAR_CRON_SECRET", () => {
    const auth = src("src/lib/supabase/service-client.ts");
    expect(auth).toContain("export function isRadarCronAuthorized");
    expect(auth).toMatch(/function isRadarCronAuthorized[\s\S]*readRadarCronSecret/);
    const radarFn = auth.slice(auth.indexOf("export function isRadarCronAuthorized"));
    const nextFn = radarFn.indexOf("export function readCoachingCronSecret");
    const body = nextFn === -1 ? radarFn : radarFn.slice(0, nextFn);
    expect(body).not.toContain("CRON_SECRET");
    expect(body).not.toContain("isCoachingCronAuthorized");
  });

  it("Production live pipeline stays blocked", () => {
    const previous = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    const gate = previewRadarLiveGuard(new Request("https://bakigo.tw/api/radar/live/pipeline"));
    expect(gate).toEqual({
      ok: false,
      status: 403,
      error: "RADAR-LIVE-01 is blocked on Production.",
    });
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  });

  it("does not enable fixture adapters in live mode", () => {
    const previous = process.env.RADAR_SOURCE_MODE;
    process.env.RADAR_SOURCE_MODE = "live";
    expect(shouldUseRadarFixtureAdapters()).toBe(false);
    if (previous === undefined) delete process.env.RADAR_SOURCE_MODE;
    else process.env.RADAR_SOURCE_MODE = previous;
  });

  it("does not change score 40 or Top20 cap 20", () => {
    expect(DEFAULT_ALLOCATION_RULES.minimum_qualified_score).toBe(40);
    expect(DEFAULT_ALLOCATION_RULES.daily_recommendation_cap).toBe(20);
  });

  it("vercel Hobby crons stay daily and stagger process wakes", () => {
    const vercel = JSON.parse(src("vercel.json")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const radarCrons = vercel.crons.filter((cron) => cron.path.startsWith("/api/radar/"));
    expect(radarCrons).toEqual([...RADAR_HOBBY_DAILY_CRONS]);
    expect(vercel.crons[0]).toEqual({
      path: "/api/radar/jobs/daily-pipeline",
      schedule: "0 22 * * *",
    });
    expect(vercel.crons.some((cron) => cron.path === "/api/radar/jobs/process" && cron.schedule === "30 23 * * *")).toBe(
      true,
    );
    expect(vercel.crons.filter((cron) => cron.path === "/api/radar/jobs/process").length).toBeGreaterThanOrEqual(23);
    expect(
      vercel.crons.some((cron) => cron.path === "/api/coaching/go21/reminders/process"),
    ).toBe(true);
    for (const cron of vercel.crons) {
      const parts = cron.schedule.split(" ");
      expect(parts).toHaveLength(5);
      expect(parts[2]).toBe("*");
      expect(parts[3]).toBe("*");
      expect(parts[4]).toBe("*");
      expect(parts[0].includes("/") || parts[1].includes("/")).toBe(false);
    }
  });

  it("retries empty claims before finalize and pages pipeline job lists past 1000", () => {
    const drain = src("src/lib/radar/jobs/auto-drain.ts");
    expect(drain).toContain("RADAR_CLAIM_RETRY_DELAYS_MS");
    expect(drain).toContain("4000");
    const store = src("src/lib/radar/pipeline/supabase-pipeline-store.ts");
    expect(store).toContain(".range(from, from + pageSize - 1)");
    expect(store).toContain("const pageSize = 1000");
  });

  it("process and daily-pipeline expose GET for Vercel Cron and keep continue semantics", () => {
    const processSrc = src("src/app/api/radar/jobs/process/route.ts");
    const dailySrc = src("src/app/api/radar/jobs/daily-pipeline/route.ts");
    expect(processSrc).toContain("export async function GET");
    expect(processSrc).toContain("isRadarCronAuthorized");
    expect(processSrc).toContain("scheduleRadarProcessContinuation");
    expect(processSrc).toContain("accepted: true");
    expect(processSrc).toContain("status: 202");
    expect(processSrc).toContain('export const dynamic = "force-dynamic"');
    expect(processSrc).toContain("loadRadarOpsStatus");
    expect(processSrc).toContain("runWorkerUntilBudget");
    expect(processSrc).toContain("radar_auto_continue_work");
    expect(processSrc).toContain("priority: 50_000");
    expect(processSrc).toContain("scheduleRadarFinalize");
    expect(processSrc).not.toContain("export const maxDuration");
    const drainSrc = src("src/lib/radar/jobs/auto-drain.ts");
    expect(drainSrc).toContain("void run();");
    expect(drainSrc).toContain("after(() =>");
    expect(drainSrc).toContain("void fetch(url");
    expect(drainSrc).not.toContain("AbortController");
    expect(drainSrc).not.toContain("body?.cancel");
    expect(drainSrc).not.toContain("RADAR_CONTINUE_FETCH_ABORT_MS");
    expect(dailySrc).toContain("export async function GET");
    expect(dailySrc).toContain("scheduleRadarProcessContinuation");
    expect(dailySrc).toContain("isRadarCronAuthorized");
    expect(dailySrc).toContain('export const dynamic = "force-dynamic"');
  });
});
