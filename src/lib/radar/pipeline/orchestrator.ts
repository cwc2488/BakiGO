import { randomUUID } from "node:crypto";
import type { RadarJobQueue } from "../jobs/queue";
import { buildOrgKeywordPool } from "../keywords/build-org-keyword-pool";
import {
  allocateDailyQuota,
  DEFAULT_DAILY_QUOTA_BUDGET,
} from "./quota-allocator";
import type { PipelineOrchestratorResult, RunDailyPipelineInput } from "./types";
import type { PipelineStore } from "./store";

export type DailyPipelineOrchestratorDeps = {
  store: PipelineStore;
  queue: RadarJobQueue;
};

function jobKey(run_date: string, parts: string[]): string {
  return `pipeline:${run_date}:${parts.join(":")}`;
}

export async function runDailyPipelineOrchestrator(
  deps: DailyPipelineOrchestratorDeps,
  input: RunDailyPipelineInput,
): Promise<PipelineOrchestratorResult> {
  const now = input.now ?? new Date();
  const timezone = input.timezone ?? "Asia/Taipei";
  const triggered_by = input.triggered_by ?? "cron";

  const existing = await deps.store.findPipelineRunByDate(input.run_date);
  if (existing?.counts.enqueued) {
    return {
      pipeline_run_id: existing.id,
      run_date: input.run_date,
      rerun: true,
      discovery_jobs_enqueued: existing.counts.discovery_jobs ?? 0,
      refresh_candidates_selected: existing.counts.refresh_candidates ?? 0,
      enrich_jobs_enqueued: existing.counts.enrich_jobs ?? 0,
      normalize_jobs_enqueued: existing.counts.normalize_jobs ?? 0,
      skipped_duplicate_jobs: 0,
    };
  }

  const pipelineRun =
    existing ??
    (await deps.store.createPipelineRun({
      id: randomUUID(),
      run_date: input.run_date,
      timezone,
      triggered_by,
      now,
    }));

  let discoveryJobsEnqueued = 0;
  let enrichJobsEnqueued = 0;
  let skippedDuplicateJobs = 0;

  const members = await deps.store.listActiveMembers();
  const keywordsByMember = await deps.store.loadKeywordsByMember(
    members.map((member) => member.member_id),
  );

  const orgKeywordPool = buildOrgKeywordPool(keywordsByMember);
  const refreshCandidates = await deps.store.listRefreshCandidates(input.run_date, now);
  const quotaBudget = await deps.store.getDailyQuotaBudget();

  const allocation = allocateDailyQuota({
    org_keywords: orgKeywordPool,
    refresh_candidates: refreshCandidates,
    budgets: quotaBudget ?? DEFAULT_DAILY_QUOTA_BUDGET,
    now,
  });

  for (const keyword of allocation.keyword_jobs) {
    const { created } = await deps.queue.enqueue(
      {
        pipeline_run_id: pipelineRun.id,
        job_type: "discover",
        idempotency_key: jobKey(input.run_date, ["discover", keyword.normalized_phrase]),
        payload: {
          phrase: keyword.display_phrase,
          normalized_phrase: keyword.normalized_phrase,
          attributions: keyword.attributions,
          run_date: input.run_date,
          artifact_refs: {},
        },
        priority: keyword.priority_score,
        trace_id: input.trace_id,
      },
      now,
    );
    if (created) discoveryJobsEnqueued++;
    else skippedDuplicateJobs++;
  }

  const refreshQueue = allocation.refresh_jobs;

  await deps.store.saveRefreshQueue({
    queue_date: input.run_date,
    pipeline_run_id: pipelineRun.id,
    items: refreshQueue,
  });

  for (const item of refreshQueue) {
    const enrich = await deps.queue.enqueue(
      {
        pipeline_run_id: pipelineRun.id,
        job_type: "enrich",
        idempotency_key: jobKey(input.run_date, ["enrich", item.candidate_id]),
        payload: {
          candidate_id: item.candidate_id,
          reason_codes: item.reason_codes,
          run_date: input.run_date,
          enrich_reason: "refresh",
          artifact_refs: {},
        },
        priority: item.priority_score,
        trace_id: input.trace_id,
      },
      now,
    );
    if (enrich.created) enrichJobsEnqueued++;
    else skippedDuplicateJobs++;
  }

  await deps.store.markPipelineEnqueued({
    pipeline_run_id: pipelineRun.id,
    counts: {
      enqueued: true,
      discovery_jobs: discoveryJobsEnqueued,
      refresh_candidates: refreshQueue.length,
      enrich_jobs: enrichJobsEnqueued,
      normalize_jobs: 0,
      quota_allocation: allocation.effective,
    },
  });

  return {
    pipeline_run_id: pipelineRun.id,
    run_date: input.run_date,
    rerun: false,
    discovery_jobs_enqueued: discoveryJobsEnqueued,
    refresh_candidates_selected: refreshQueue.length,
    enrich_jobs_enqueued: enrichJobsEnqueued,
    normalize_jobs_enqueued: 0,
    skipped_duplicate_jobs: skippedDuplicateJobs,
  };
}
