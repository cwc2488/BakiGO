import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  loadSnapshotGeneratedAt,
  recoverySucceeded,
  snapshotWasRecomputed,
  summarizeRecoveryEvidence,
  type SnapshotEvidenceRow,
} from "./recovery-evidence";
import { runMemberRankRebuild } from "./run-member-rank-rebuild";
import type { WorkerContext } from "./workers/dispatch";
import { ONE_TIME_RECOVERY_0901 } from "./one-time-recovery-0901-constants";

export type OneTimeRecovery0901Status = {
  completed: boolean;
  completion_job_id: string | null;
  completed_at: string | null;
  snapshots_updated: number | null;
};

export async function loadOneTimeRecovery0901Status(
  client: SupabaseClient,
): Promise<OneTimeRecovery0901Status> {
  const { data } = await client
    .from("radar_jobs")
    .select("id, status, finished_at, metrics")
    .eq("idempotency_key", ONE_TIME_RECOVERY_0901.completion_idempotency_key)
    .maybeSingle();

  if (!data || data.status !== "succeeded") {
    return {
      completed: false,
      completion_job_id: null,
      completed_at: null,
      snapshots_updated: null,
    };
  }

  const metrics = (data.metrics as Record<string, unknown> | null) ?? {};
  return {
    completed: true,
    completion_job_id: String(data.id),
    completed_at: data.finished_at ? String(data.finished_at) : null,
    snapshots_updated:
      typeof metrics.snapshots_updated === "number" ? metrics.snapshots_updated : null,
  };
}

export async function markOneTimeRecovery0901Completed(
  client: SupabaseClient,
  input: {
    snapshots_updated: number;
    members_requested: number;
    members_rebuilt: number;
    members_failed: number;
    now: Date;
  },
): Promise<void> {
  const row = {
    id: randomUUID(),
    pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
    job_type: "daily_pipeline",
    idempotency_key: ONE_TIME_RECOVERY_0901.completion_idempotency_key,
    status: "succeeded",
    payload: {
      one_time_recovery: ONE_TIME_RECOVERY_0901.recovery_label,
      snapshot_date: ONE_TIME_RECOVERY_0901.snapshot_date,
      pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
    },
    priority: 0,
    attempt_count: 1,
    max_attempts: 1,
    scheduled_at: input.now.toISOString(),
    available_at: input.now.toISOString(),
    started_at: input.now.toISOString(),
    finished_at: input.now.toISOString(),
    metrics: {
      snapshots_updated: input.snapshots_updated,
      members_requested: input.members_requested,
      members_rebuilt: input.members_rebuilt,
      members_failed: input.members_failed,
    },
  };

  const { error } = await client.from("radar_jobs").insert(row);
  if (error && error.code !== "23505") {
    throw new Error(error.message);
  }
}

export type OneTimeRecovery0901Result = {
  ok: boolean;
  inert: boolean;
  dry_run: boolean;
  snapshot_date: string;
  pipeline_run_id: string;
  supabase_project: string;
  before_empty_count: number;
  after_empty_count: number;
  before_nonempty_count: number;
  after_nonempty_count: number;
  members_requested: number;
  members_rebuilt: number;
  members_failed: number;
  snapshots_updated: number;
  affected_member: {
    member_id: string;
    previous_generated_at: string | null;
    new_generated_at: string | null;
    generated_at_changed: boolean;
    item_count: number | null;
    metrics: Record<string, unknown> | null;
  } | null;
  evidence: SnapshotEvidenceRow[];
  failure_reason: string | null;
};

export async function runOneTimeRecovery0901(
  client: SupabaseClient,
  ctx: WorkerContext,
  input: { dry_run?: boolean },
): Promise<OneTimeRecovery0901Result> {
  const status = await loadOneTimeRecovery0901Status(client);
  const snapshot_date = ONE_TIME_RECOVERY_0901.snapshot_date;
  const pipeline_run_id = ONE_TIME_RECOVERY_0901.pipeline_run_id;

  if (status.completed) {
    return {
      ok: true,
      inert: true,
      dry_run: Boolean(input.dry_run),
      snapshot_date,
      pipeline_run_id,
      supabase_project: ONE_TIME_RECOVERY_0901.supabase_project,
      before_empty_count: 0,
      after_empty_count: 0,
      before_nonempty_count: 0,
      after_nonempty_count: 0,
      members_requested: 0,
      members_rebuilt: 0,
      members_failed: 0,
      snapshots_updated: status.snapshots_updated ?? 0,
      affected_member: null,
      evidence: [],
      failure_reason: "one_time_recovery_already_completed",
    };
  }

  const { data: snapshots, error } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", snapshot_date);
  if (error) throw new Error(error.message);

  const emptyMembers = (snapshots ?? [])
    .filter((row) => Number(row.item_count ?? 0) === 0)
    .map((row) => String(row.member_id));

  const before_empty_count = emptyMembers.length;
  const before_nonempty_count = (snapshots ?? []).length - before_empty_count;

  if (input.dry_run) {
    return {
      ok: true,
      inert: false,
      dry_run: true,
      snapshot_date,
      pipeline_run_id,
      supabase_project: ONE_TIME_RECOVERY_0901.supabase_project,
      before_empty_count,
      after_empty_count: before_empty_count,
      before_nonempty_count,
      after_nonempty_count: before_nonempty_count,
      members_requested: emptyMembers.length,
      members_rebuilt: 0,
      members_failed: 0,
      snapshots_updated: 0,
      affected_member: null,
      evidence: [],
      failure_reason: null,
    };
  }

  const evidence: SnapshotEvidenceRow[] = [];
  for (const member_id of emptyMembers) {
    const beforeSnapshot = await loadSnapshotGeneratedAt(client, member_id, snapshot_date);
    const rebuild = await runMemberRankRebuild(ctx, {
      member_id,
      snapshot_date,
      pipeline_run_id,
      recovery_tag: ONE_TIME_RECOVERY_0901.recovery_label,
      force_new_job: true,
    });
    const afterSnapshot = await loadSnapshotGeneratedAt(client, member_id, snapshot_date);
    evidence.push({
      member_id,
      previous_generated_at: beforeSnapshot.generated_at,
      new_generated_at: afterSnapshot.generated_at,
      previous_item_count: beforeSnapshot.item_count,
      new_item_count: afterSnapshot.item_count,
      snapshot_updated: snapshotWasRecomputed(
        beforeSnapshot.generated_at,
        afterSnapshot.generated_at,
      ),
      rebuild,
    });
  }

  const { data: afterSnapshots } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", snapshot_date);

  let after_empty_count = 0;
  for (const row of afterSnapshots ?? []) {
    if (Number(row.item_count ?? 0) === 0) after_empty_count += 1;
  }
  const after_nonempty_count = (afterSnapshots ?? []).length - after_empty_count;

  const summary = summarizeRecoveryEvidence(evidence);
  const ok = recoverySucceeded({
    members_requested: summary.members_requested,
    snapshots_updated: summary.snapshots_updated,
  });

  const affectedRow = evidence.find(
    (row) => row.member_id === ONE_TIME_RECOVERY_0901.affected_member_id,
  );
  const affected_member = affectedRow
    ? {
        member_id: affectedRow.member_id,
        previous_generated_at: affectedRow.previous_generated_at,
        new_generated_at: affectedRow.new_generated_at,
        generated_at_changed: snapshotWasRecomputed(
          affectedRow.previous_generated_at,
          affectedRow.new_generated_at,
        ),
        item_count: affectedRow.new_item_count,
        metrics: affectedRow.rebuild.metrics,
      }
    : null;

  if (ok && summary.snapshots_updated > 0) {
    await markOneTimeRecovery0901Completed(client, {
      snapshots_updated: summary.snapshots_updated,
      members_requested: summary.members_requested,
      members_rebuilt: summary.members_rebuilt,
      members_failed: summary.members_failed,
      now: ctx.now ?? new Date(),
    });
  }

  return {
    ok,
    inert: false,
    dry_run: false,
    snapshot_date,
    pipeline_run_id,
    supabase_project: ONE_TIME_RECOVERY_0901.supabase_project,
    before_empty_count,
    after_empty_count,
    before_nonempty_count,
    after_nonempty_count,
    ...summary,
    affected_member,
    evidence,
    failure_reason: ok ? null : "zero_snapshots_recomputed",
  };
}

/** Runs the hardcoded one-time recovery once on Production when not yet completed. */
export async function tryOneTimeRecovery0901IfPending(
  client: SupabaseClient,
  ctx: WorkerContext,
): Promise<OneTimeRecovery0901Result | null> {
  if (process.env.VERCEL_ENV !== "production") {
    return null;
  }

  const status = await loadOneTimeRecovery0901Status(client);
  if (status.completed) {
    return null;
  }

  return runOneTimeRecovery0901(client, ctx, { dry_run: false });
}

export async function loadOneTimeRecovery0901PublicReport(client: SupabaseClient) {
  const status = await loadOneTimeRecovery0901Status(client);
  const snapshot_date = ONE_TIME_RECOVERY_0901.snapshot_date;

  const { data: memberRow } = await client
    .from("member_daily_top20")
    .select("generated_at, item_count, items")
    .eq("member_id", ONE_TIME_RECOVERY_0901.affected_member_id)
    .eq("snapshot_date", snapshot_date)
    .maybeSingle();

  const { data: allRows } = await client
    .from("member_daily_top20")
    .select("member_id, item_count")
    .eq("snapshot_date", snapshot_date);

  let empty = 0;
  let nonempty = 0;
  for (const row of allRows ?? []) {
    if (Number(row.item_count ?? 0) === 0) empty += 1;
    else nonempty += 1;
  }

  const newGeneratedAt = memberRow?.generated_at ? String(memberRow.generated_at) : null;
  const generated_at_changed =
    Boolean(newGeneratedAt) &&
    newGeneratedAt!.localeCompare(ONE_TIME_RECOVERY_0901.affected_member_baseline_generated_at) >
      0;

  return {
    read_only: true,
    recovery_completed: status.completed,
    completed_at: status.completed_at,
    snapshots_updated: status.snapshots_updated,
    snapshot_date,
    pipeline_run_id: ONE_TIME_RECOVERY_0901.pipeline_run_id,
    affected_member_id: ONE_TIME_RECOVERY_0901.affected_member_id,
    old_generated_at: ONE_TIME_RECOVERY_0901.affected_member_baseline_generated_at,
    new_generated_at: newGeneratedAt,
    generated_at_changed,
    item_count: memberRow?.item_count ?? null,
    items: memberRow?.items ?? [],
    empty_count: empty,
    nonempty_count: nonempty,
  };
}
