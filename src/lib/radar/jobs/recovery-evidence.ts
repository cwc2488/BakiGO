import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRankRebuildResult } from "./run-member-rank-rebuild";

export type SnapshotEvidenceRow = {
  member_id: string;
  previous_generated_at: string | null;
  new_generated_at: string | null;
  previous_item_count: number | null;
  new_item_count: number | null;
  snapshot_updated: boolean;
  rebuild: MemberRankRebuildResult;
};

export async function loadSnapshotGeneratedAt(
  client: SupabaseClient,
  member_id: string,
  snapshot_date: string,
): Promise<{
  generated_at: string | null;
  item_count: number | null;
}> {
  const { data } = await client
    .from("member_daily_top20")
    .select("generated_at, item_count")
    .eq("member_id", member_id)
    .eq("snapshot_date", snapshot_date)
    .maybeSingle();
  return {
    generated_at: data?.generated_at ? String(data.generated_at) : null,
    item_count: data?.item_count == null ? null : Number(data.item_count),
  };
}

export function snapshotWasRecomputed(
  previous_generated_at: string | null,
  new_generated_at: string | null,
): boolean {
  if (!new_generated_at) return false;
  if (!previous_generated_at) return true;
  return new_generated_at.localeCompare(previous_generated_at) > 0;
}

export function summarizeRecoveryEvidence(rows: SnapshotEvidenceRow[]): {
  members_requested: number;
  members_rebuilt: number;
  members_failed: number;
  snapshots_updated: number;
  visible_score_snapshot_count: number | null;
  eligible_count: number | null;
} {
  let visible_score_snapshot_count: number | null = null;
  let eligible_count: number | null = null;

  for (const row of rows) {
    if (row.rebuild.ok) {
      const visible = row.rebuild.metrics?.score_snapshots_visible;
      if (typeof visible === "number") {
        visible_score_snapshot_count = visible;
      }
      const eligible = row.rebuild.metrics?.eligible_after_threshold;
      if (typeof eligible === "number") {
        eligible_count = eligible;
      }
    }
  }

  return {
    members_requested: rows.length,
    members_rebuilt: rows.filter((row) => row.rebuild.ok).length,
    members_failed: rows.filter((row) => !row.rebuild.ok).length,
    snapshots_updated: rows.filter((row) => row.snapshot_updated).length,
    visible_score_snapshot_count,
    eligible_count,
  };
}

export function recoverySucceeded(summary: {
  members_requested: number;
  snapshots_updated: number;
  skipped?: boolean;
  dry_run?: boolean;
}): boolean {
  if (summary.dry_run || summary.skipped) return true;
  if (summary.members_requested === 0) return true;
  return summary.snapshots_updated > 0;
}
