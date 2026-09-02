/** Shared same-day filter for radar_candidate_score_snapshots (Taipei run_date). */

export function nextIsoDate(date: string): string {
  const base = new Date(`${date}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

export function scoreSnapshotRowMatchesDate(
  row: {
    extraction_snapshot?: unknown;
    analyzed_at?: unknown;
  },
  snapshot_date: string,
): boolean {
  const snapshot = row.extraction_snapshot as { snapshot_date?: unknown } | null;
  if (snapshot?.snapshot_date === snapshot_date) {
    return true;
  }
  const analyzed = String(row.analyzed_at ?? "");
  return analyzed.slice(0, 10) === snapshot_date;
}

/** PostgREST `or` filter: JSON snapshot_date OR legacy analyzed_at on run day. */
export function scoreSnapshotDateOrFilter(snapshot_date: string): string {
  const next = nextIsoDate(snapshot_date);
  return [
    `extraction_snapshot->>snapshot_date.eq.${snapshot_date}`,
    `and(extraction_snapshot->>snapshot_date.is.null,analyzed_at.gte.${snapshot_date}T00:00:00.000Z,analyzed_at.lt.${next}T00:00:00.000Z)`,
  ].join(",");
}
