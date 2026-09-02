import { after } from "next/server";
import { getPublicAppOrigin } from "@/lib/app/public-origin";
import { readRadarCronSecret } from "@/lib/supabase/service-client";
import { runWorkerBatch, type WorkerContext } from "./workers/dispatch";

/** One job per claim — proven safe under Fluid Hobby 300s. */
export const RADAR_PROCESS_CLAIM_LIMIT = 1;
/** In-request drain. Stay under Fluid 300s after one last job + hop schedule. */
export const RADAR_PROCESS_BUDGET_MS = 180_000;
/** Hard cap one claimed job so a hang cannot consume maxDuration before the next kick. */
export const RADAR_JOB_HARD_TIMEOUT_MS = 90_000;
export const RADAR_ABANDONED_RECLAIM_MINUTES = 30;
/** Chained jobs can lag claim visibility after enqueue. */
export const RADAR_CLAIM_RETRY_DELAYS_MS = [400, 1500, 4000] as const;

/**
 * Hobby can only fire each cron once per day. Stagger process wakes so a
 * dead after() chain cannot sleep until the next 06:00 orchestrate.
 */
export const RADAR_HOBBY_DAILY_CRONS = [
  { path: "/api/radar/jobs/daily-pipeline", schedule: "0 22 * * *" },
  { path: "/api/radar/jobs/process", schedule: "30 23 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 0 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 1 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 2 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 3 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 4 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 5 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 6 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 7 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 8 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 9 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 10 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 11 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 12 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 13 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 14 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 15 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 16 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 17 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 18 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 19 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 20 * * *" },
  { path: "/api/radar/jobs/process", schedule: "0 21 * * *" },
] as const;

export function noStoreJson(body: unknown, init?: { status?: number }) {
  return Response.json(body, {
    status: init?.status ?? 200,
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RadarProcessMode = {
  continueDrain: boolean;
  claimLimit: number;
  budgetMs: number;
  pipeline_run_id: string | null;
};

export type RadarDrainAction =
  | { kind: "continue"; pipeline_run_id: string | null }
  | { kind: "finalize"; pipeline_run_id: string | null };

type ProcessBody = {
  limit?: unknown;
  continue?: unknown;
  pipeline_run_id?: unknown;
};

export function parseRadarProcessMode(input: {
  method: string;
  body?: ProcessBody;
}): RadarProcessMode {
  const continueDrain = input.method === "GET" || input.body?.continue === true;
  const rawLimit = typeof input.body?.limit === "number" ? input.body.limit : undefined;
  const oneShotLimit = Math.max(1, Math.min(25, Math.floor(rawLimit ?? 25)));
  const pipeline_run_id =
    typeof input.body?.pipeline_run_id === "string" && input.body.pipeline_run_id.trim()
      ? input.body.pipeline_run_id.trim()
      : null;

  return {
    continueDrain,
    claimLimit: continueDrain ? RADAR_PROCESS_CLAIM_LIMIT : oneShotLimit,
    budgetMs: continueDrain ? RADAR_PROCESS_BUDGET_MS : Number.POSITIVE_INFINITY,
    pipeline_run_id,
  };
}

export function nextRadarDrainAction(input: {
  processed: number;
  pipeline_run_id: string | null;
}): RadarDrainAction {
  if (input.processed > 0) {
    return { kind: "continue", pipeline_run_id: input.pipeline_run_id };
  }
  return { kind: "finalize", pipeline_run_id: input.pipeline_run_id };
}

async function withHardTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runWorkerUntilBudget(
  ctx: WorkerContext,
  budgetMs: number,
): Promise<number> {
  const started = Date.now();
  let processed = 0;
  let emptyAttempts = 0;
  while (Date.now() - started < budgetMs) {
    if (Date.now() - started > budgetMs - 5_000) break;
    const count = await withHardTimeout(
      runWorkerBatch(ctx, RADAR_PROCESS_CLAIM_LIMIT),
      RADAR_JOB_HARD_TIMEOUT_MS,
    );
    if (count === "timeout") {
      // Keep the chain alive. The claimed job stays running until reclaim.
      return processed + 1;
    }
    processed += count;
    if (count > 0) {
      emptyAttempts = 0;
      continue;
    }
    if (processed > 0) break;
    if (emptyAttempts >= RADAR_CLAIM_RETRY_DELAYS_MS.length) break;
    await sleep(RADAR_CLAIM_RETRY_DELAYS_MS[emptyAttempts]);
    emptyAttempts += 1;
  }
  return processed;
}

export function resolveRadarInternalOrigin(): string {
  return getPublicAppOrigin();
}

export function scheduleRadarProcessContinuation(input?: {
  pipeline_run_id?: string | null;
}): void {
  const origin = resolveRadarInternalOrigin();
  kickAfter(() =>
    fireAndForget(`${origin}/api/radar/jobs/process`, {
      continue: true,
      limit: RADAR_PROCESS_CLAIM_LIMIT,
      ...(input?.pipeline_run_id ? { pipeline_run_id: input.pipeline_run_id } : {}),
    }),
  );
}

export function scheduleRadarFinalize(input?: { pipeline_run_id?: string | null }): void {
  const origin = resolveRadarInternalOrigin();
  kickAfter(() =>
    fireAndForget(
      `${origin}/api/radar/jobs/finalize`,
      input?.pipeline_run_id ? { pipeline_run_id: input.pipeline_run_id } : {},
    ),
  );
}

function kickAfter(run: () => Promise<void>): void {
  // Production proved `after()` can register and never run. Start the next
  // hop while this isolate is still alive; after() is only a backup.
  void run();
  try {
    after(() => {
      void run();
    });
  } catch {
    // already started above
  }
}

async function fireAndForget(url: string, body: Record<string, unknown>): Promise<void> {
  const secret = readRadarCronSecret();
  if (!secret) {
    console.error(JSON.stringify({ type: "radar_auto_continue_failed", error_class: "missing_secret" }));
    return;
  }

  // Do not abort or cancel the body. The child drains in-request for up to
  // 180s before 202; a 15s abort / body.cancel() tears that isolate down
  // and the next hop never schedules. Detach immediately; hourly cron is
  // the correctness wake if this fetch is frozen with the parent isolate.
  void fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch((error) => {
    console.error(
      JSON.stringify({
        type: "radar_auto_continue_failed",
        error_class: error instanceof Error ? error.name : "unknown",
      }),
    );
  });
}
