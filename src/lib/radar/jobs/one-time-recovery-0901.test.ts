import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
import { InMemoryRadarRepository } from "../repository/in-memory-repository";
import { InMemoryRadarJobQueueStore, RadarJobQueue } from "./queue";
import { createSourceAdapterRegistry } from "../sources/registry";
import type { WorkerContext } from "./workers/dispatch";
import { ONE_TIME_RECOVERY_0901 } from "./one-time-recovery-0901-constants";
import {
  runOneTimeRecovery0901,
} from "./one-time-recovery-0901";
import { buildValidExtractionFixture } from "../extraction/test-fixtures";
import { normalizeCandidateContent } from "../normalization/normalize-candidate-content";
import { buildRawSnapshot } from "../normalization/test-fixtures";
import type { OverallScoreResult } from "../scoring/types";
import {
  isOneTimeRecovery0901Authorized,
  readOneTimeRecovery0901Token,
} from "@/lib/supabase/one-time-recovery-auth";
import { POST } from "@/app/api/radar/jobs/one-time-recovery-0901/route";

const MEMBER_A = ONE_TIME_RECOVERY_0901.affected_member_id;
const MEMBER_B = "bbbbbbbb-bbbb-cccc-dddd-111111111111";

function scoreResult(overall: number): OverallScoreResult {
  return {
    scoring_version: "v1",
    overall_score: overall,
    components: {
      change_window_score: 20,
      change_intent_score: 8,
      behavioral_change_score: 6,
      solution_gap_score: 6,
      needs_fit_score: 15,
      contactability_score: 10,
      natural_entry_score: 6,
      interaction_openness_score: 4,
      core_traits_score: 3,
      activity_score: 3,
      location_score: 2.5,
    },
    core_traits: {
      trait_scores: [],
      core_traits_score: 3,
      profile_observability: {
        profile_observability_level: "medium",
        analyzable_item_count: 10,
        excluded_repost_count: 0,
        excluded_duplicate_count: 0,
        excluded_empty_share_count: 0,
        excluded_no_expression_count: 0,
        excluded_unattributable_count: 0,
      },
      trait_observability: [],
    },
    needs: [],
  };
}

function baseCtx(repo: InMemoryRadarRepository, queue: RadarJobQueue): WorkerContext {
  return {
    repo,
    queue,
    sources: createSourceAdapterRegistry({
      record: (entry) => repo.recordSourceFetchAudit(entry),
    }),
    now: new Date("2026-09-01T08:00:00.000Z"),
  };
}

async function seedEligible(
  repo: InMemoryRadarRepository,
  member_id: string,
  candidate_id: string,
  score: number,
  now: Date,
) {
  const analysis_run_id = randomUUID();
  const normalization_run_id = `norm_${candidate_id}`;
  await repo.upsertCandidate({
    id: candidate_id,
    display_name: candidate_id,
    primary_platform: "threads",
    normalized_username: candidate_id.replace(/[^a-z0-9_]/gi, ""),
  });
  const corpus = normalizeCandidateContent({
    candidate_id,
    normalization_run_id,
    snapshots: [
      buildRawSnapshot({
        candidate_id,
        external_content_id: `${candidate_id}_1`,
      }),
    ],
  });
  await repo.persistNormalizationRun(corpus);
  const fingerprint = `fp_${candidate_id}`;
  await repo.insertAnalysisRun({
    id: analysis_run_id,
    candidate_id,
    status: "succeeded",
    analysis_input_fingerprint: fingerprint,
    corpus_fingerprint: corpus.normalization_run_id,
    profile_semantic_hash: null,
    normalization_run_id,
    extraction_json: buildValidExtractionFixture({ candidate_id }),
    prompt_version: "ai_radar_extraction_v1.0",
    model_id: "gpt-4.1-mini",
  });
  await repo.updateRefreshStateAfterNormalize({
    candidate_id,
    corpus_fingerprint: corpus.normalization_run_id,
    profile_semantic_hash: null,
    data_completeness: "full",
    current_analysis_run_id: analysis_run_id,
    validated_extraction_fingerprint: fingerprint,
    now,
  });
  await repo.updateRefreshStateAfterEnrich({
    candidate_id,
    succeeded: true,
    now,
  });
  await repo.insertMemberScoreSnapshot({
    id: randomUUID(),
    member_id,
    candidate_id,
    analysis_run_id,
    baseline_score_snapshot_id: randomUUID(),
    overall_score: score,
    component_scores: {},
    location_level: "unknown",
    snapshot_date: ONE_TIME_RECOVERY_0901.snapshot_date,
    result: scoreResult(score),
  });
}

describe("one-time recovery 0901 auth", () => {
  const prev = process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN;

  afterEach(() => {
    if (prev === undefined) delete process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN;
    else process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN = prev;
  });

  it("uses RADAR_ONE_TIME_RECOVERY_0901_TOKEN only", () => {
    delete process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN;
    expect(readOneTimeRecovery0901Token()).toBe("");
    process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN = "one-time-recovery-token-16";
    expect(
      isOneTimeRecovery0901Authorized(
        new Request("https://bakigo.tw/api/radar/jobs/one-time-recovery-0901", {
          headers: { authorization: "Bearer one-time-recovery-token-16" },
        }),
      ),
    ).toBe(true);
    expect(
      isOneTimeRecovery0901Authorized(
        new Request("https://bakigo.tw/api/radar/jobs/one-time-recovery-0901", {
          headers: { authorization: "Bearer wrong-token-value" },
        }),
      ),
    ).toBe(false);
  });
});

describe("one-time recovery 0901 route security", () => {
  const prevToken = process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (prevToken === undefined) delete process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN;
    else process.env.RADAR_ONE_TIME_RECOVERY_0901_TOKEN = prevToken;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  });

  it("rejects scope mutation in body", async () => {
    vi.stubEnv("RADAR_ONE_TIME_RECOVERY_0901_TOKEN", "one-time-recovery-token-16");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ubdrkrvyyrqdvlehzhsz.supabase.co");
    vi.stubEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QifQ.test",
    );
    const res = await POST(
      new Request("https://bakigo.tw/api/radar/jobs/one-time-recovery-0901", {
        method: "POST",
        headers: {
          authorization: "Bearer one-time-recovery-token-16",
          "content-type": "application/json",
        },
        body: JSON.stringify({ snapshot_date: "2026-09-02" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects missing authorization", async () => {
    vi.stubEnv("RADAR_ONE_TIME_RECOVERY_0901_TOKEN", "one-time-recovery-token-16");
    const res = await POST(
      new Request("https://bakigo.tw/api/radar/jobs/one-time-recovery-0901", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("one-time recovery 0901 in-memory", () => {
  it("rebuilds empty snapshots and becomes inert after completion marker", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    await seedEligible(repo, MEMBER_A, "cand_threads_zhangbh__06", 68.5, now);
    await repo.upsertMemberDailyTop20({
      member_id: MEMBER_A,
      pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
      snapshot_date: ONE_TIME_RECOVERY_0901.snapshot_date,
      generated_at: new Date(ONE_TIME_RECOVERY_0901.affected_member_baseline_generated_at),
      items: [],
    });
    await repo.upsertMemberDailyTop20({
      member_id: MEMBER_B,
      pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
      snapshot_date: ONE_TIME_RECOVERY_0901.snapshot_date,
      generated_at: now,
      items: [],
    });

    const fakeClient = {
      from(table: string) {
        if (table === "member_daily_top20") {
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { member_id: MEMBER_A, item_count: 0 },
                  { member_id: MEMBER_B, item_count: 0 },
                  { member_id: "cccccccc-cccc-dddd-eeee-222222222222", item_count: 5 },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === "radar_jobs") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: async () => ({ error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const first = await runOneTimeRecovery0901(fakeClient as never, ctx, { dry_run: true });
    expect(first.dry_run).toBe(true);
    expect(first.before_empty_count).toBe(2);

    const second = await runOneTimeRecovery0901(
      {
        from(table: string) {
          if (table === "radar_jobs") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "done",
                      status: "succeeded",
                      finished_at: now.toISOString(),
                      metrics: { snapshots_updated: 2 },
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          throw new Error(`unexpected ${table}`);
        },
      } as never,
      ctx,
      { dry_run: false },
    );
    expect(second.inert).toBe(true);
    expect(second.failure_reason).toBe("one_time_recovery_already_completed");
  });

  it("rebuild replaces empty top20 for affected member", async () => {
    const repo = new InMemoryRadarRepository();
    const queue = new RadarJobQueue(new InMemoryRadarJobQueueStore());
    const ctx = baseCtx(repo, queue);
    const now = ctx.now!;

    await seedEligible(repo, MEMBER_A, "cand_threads_zhangbh__06", 68.5, now);
    await repo.upsertMemberDailyTop20({
      member_id: MEMBER_A,
      pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
      snapshot_date: ONE_TIME_RECOVERY_0901.snapshot_date,
      generated_at: new Date(ONE_TIME_RECOVERY_0901.affected_member_baseline_generated_at),
      items: [],
    });

    const rebuild = await runMemberRankRebuildLocal(ctx, MEMBER_A);
    expect(rebuild.ok).toBe(true);
    expect(rebuild.item_count).toBeGreaterThan(0);
  });
});

async function runMemberRankRebuildLocal(ctx: WorkerContext, member_id: string) {
  const { runMemberRankRebuild } = await import("./run-member-rank-rebuild");
  return runMemberRankRebuild(ctx, {
    member_id,
    snapshot_date: ONE_TIME_RECOVERY_0901.snapshot_date,
    pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
    recovery_tag: ONE_TIME_RECOVERY_0901.recovery_label,
    force_new_job: true,
  });
}
