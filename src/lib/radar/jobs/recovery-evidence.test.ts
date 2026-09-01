import { describe, expect, it } from "vitest";
import {
  recoverySucceeded,
  snapshotWasRecomputed,
  summarizeRecoveryEvidence,
} from "./recovery-evidence";

describe("recovery evidence", () => {
  it("snapshotWasRecomputed detects later generated_at", () => {
    expect(
      snapshotWasRecomputed("2026-09-01T03:42:33.938+00:00", "2026-09-01T06:00:00.000+00:00"),
    ).toBe(true);
    expect(
      snapshotWasRecomputed("2026-09-01T06:00:00.000+00:00", "2026-09-01T03:42:33.938+00:00"),
    ).toBe(false);
    expect(snapshotWasRecomputed(null, "2026-09-01T06:00:00.000+00:00")).toBe(true);
  });

  it("recoverySucceeded is false when members requested but zero snapshots updated", () => {
    expect(
      recoverySucceeded({
        members_requested: 18,
        snapshots_updated: 0,
      }),
    ).toBe(false);
    expect(
      recoverySucceeded({
        members_requested: 0,
        snapshots_updated: 0,
      }),
    ).toBe(true);
    expect(
      recoverySucceeded({
        members_requested: 3,
        snapshots_updated: 3,
      }),
    ).toBe(true);
  });

  it("summarizeRecoveryEvidence aggregates rebuild metrics", () => {
    const summary = summarizeRecoveryEvidence([
      {
        member_id: "a",
        previous_generated_at: "2026-09-01T03:00:00+00:00",
        new_generated_at: "2026-09-01T06:00:00+00:00",
        previous_item_count: 0,
        new_item_count: 2,
        snapshot_updated: true,
        rebuild: {
          ok: true,
          item_count: 2,
          snapshot_id: "snap",
          metrics: {
            score_snapshots_visible: 50,
            eligible_after_threshold: 3,
          },
        },
      },
      {
        member_id: "b",
        previous_generated_at: "2026-09-01T03:00:00+00:00",
        new_generated_at: "2026-09-01T03:00:00+00:00",
        previous_item_count: 0,
        new_item_count: 0,
        snapshot_updated: false,
        rebuild: {
          ok: false,
          item_count: 0,
          snapshot_id: null,
          metrics: null,
          error_code: "SCORE_RANK_VISIBILITY_GAP",
        },
      },
    ]);

    expect(summary.members_requested).toBe(2);
    expect(summary.members_rebuilt).toBe(1);
    expect(summary.members_failed).toBe(1);
    expect(summary.snapshots_updated).toBe(1);
    expect(summary.visible_score_snapshot_count).toBe(50);
    expect(summary.eligible_count).toBe(3);
  });
});
