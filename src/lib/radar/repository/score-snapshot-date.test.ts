import { describe, expect, it } from "vitest";
import {
  nextIsoDate,
  scoreSnapshotDateOrFilter,
  scoreSnapshotRowMatchesDate,
} from "./score-snapshot-date";

describe("scoreSnapshotDateOrFilter", () => {
  it("builds PostgREST or filter for JSON snapshot_date and legacy analyzed_at", () => {
    const filter = scoreSnapshotDateOrFilter("2026-09-01");
    expect(filter).toContain("extraction_snapshot->>snapshot_date.eq.2026-09-01");
    expect(filter).toContain("analyzed_at.gte.2026-09-01T00:00:00.000Z");
    expect(filter).toContain("analyzed_at.lt.2026-09-02T00:00:00.000Z");
  });

  it("nextIsoDate advances one calendar day", () => {
    expect(nextIsoDate("2026-09-01")).toBe("2026-09-02");
  });
});

describe("scoreSnapshotRowMatchesDate", () => {
  it("matches extraction_snapshot.snapshot_date", () => {
    expect(
      scoreSnapshotRowMatchesDate(
        { extraction_snapshot: { snapshot_date: "2026-09-01" } },
        "2026-09-01",
      ),
    ).toBe(true);
    expect(
      scoreSnapshotRowMatchesDate(
        { extraction_snapshot: { snapshot_date: "2026-08-31" } },
        "2026-09-01",
      ),
    ).toBe(false);
  });

  it("falls back to analyzed_at date prefix", () => {
    expect(
      scoreSnapshotRowMatchesDate({ analyzed_at: "2026-09-01T04:12:00.000Z" }, "2026-09-01"),
    ).toBe(true);
    expect(
      scoreSnapshotRowMatchesDate({ analyzed_at: "2026-08-31T23:59:59.000Z" }, "2026-09-01"),
    ).toBe(false);
  });
});
