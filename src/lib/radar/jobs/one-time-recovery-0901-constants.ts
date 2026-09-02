/**
 * One-time Production recovery for 2026-09-01 — hardcoded scope only.
 * Rank rebuild from existing score artifacts; no upstream AI.
 */

export const ONE_TIME_RECOVERY_0901 = {
  snapshot_date: "2026-09-01",
  pipeline_run_id: "9e484340-4ccd-4c8c-9271-430705cae699",
  supabase_project: "ubdrkrvyyrqdvlehzhsz",
  recovery_label: "ONE_TIME_RECOVERY_2026-09-01",
  affected_member_id: "f8359859-b5f7-4c97-b0b1-7a5a2ab9fd92",
  affected_member_baseline_generated_at: "2026-09-01 03:42:33.938+00",
  completion_idempotency_key:
    "one_time_recovery_2026_09_01:9e484340-4ccd-4c8c-9271-430705cae699:COMPLETED",
} as const;

export function isApprovedOneTimeRecoverySupabaseUrl(url: string): boolean {
  return url.includes(ONE_TIME_RECOVERY_0901.supabase_project);
}
