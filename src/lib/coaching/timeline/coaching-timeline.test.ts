import { describe, expect, it } from "vitest";
import {
  buildCoachingTimelineEvents,
  compareTimelineEventsNewestFirst,
  filterTimelineEvents,
  paginateTimelineEvents,
} from "@/lib/coaching/timeline/build-timeline-events";
import { buildTimeline28DayFixture } from "@/lib/coaching/timeline/timeline-fixtures";
import { assembleCommandCenter } from "@/lib/coaching/attention/assemble-command-center";
import { buildCommandCenter30Fixture } from "@/lib/coaching/attention/command-center-fixtures";

describe("Phase 3c Coaching Timeline", () => {
  const fixture = buildTimeline28DayFixture("2026-08-12");
  const events = buildCoachingTimelineEvents(fixture);

  it("TL-A — chronology newest→oldest and stable", () => {
    for (let i = 1; i < events.length; i += 1) {
      expect(compareTimelineEventsNewestFirst(events[i - 1]!, events[i]!)).toBeLessThanOrEqual(0);
    }
    const again = buildCoachingTimelineEvents(fixture);
    expect(again.map((event) => event.id)).toEqual(events.map((event) => event.id));
  });

  it("TL-B — Customer note 還是會很餓 remains in customer report", () => {
    const hungerDay = events.find(
      (event) =>
        event.type === "daily_report" &&
        event.payload.kind === "daily_report" &&
        event.payload.customerReport?.customerNote === "還是會很餓",
    );
    expect(hungerDay).toBeTruthy();
  });

  it("TL-C — second measurement uses Phase 2f improving outcome", () => {
    const comparisons = events.filter(
      (event): event is Extract<(typeof events)[number], { type: "body_measurement" }> =>
        event.type === "body_measurement" && event.payload.kind === "comparison",
    );
    expect(comparisons.length).toBeGreaterThanOrEqual(1);
    expect(comparisons[0]!.payload.outcomeStatus).toBe("improving");
    expect(comparisons[0]!.payload.summary).not.toMatch(/flat|0 change/i);
  });

  it("TL-D — baseline is baseline, not flat/0 change", () => {
    const baseline = events.find(
      (event): event is Extract<(typeof events)[number], { type: "body_measurement" }> =>
        event.type === "body_measurement" && event.payload.kind === "baseline",
    );
    expect(baseline).toBeTruthy();
    expect(baseline!.payload.outcomeStatus).toBe("not_yet_measurable");
    expect(baseline!.summary).toMatch(/起始|Baseline|回測/);
    expect(baseline!.payload.metrics.every((metric) => metric.delta == null)).toBe(true);
  });

  it("TL-E — attention evidence dates are marked attentionLinked", () => {
    const linked = events.filter((event) => event.attentionLinked);
    expect(linked.length).toBeGreaterThan(0);
    for (const date of fixture.focusDates ?? []) {
      expect(
        events.some(
          (event) =>
            event.attentionLinked &&
            (event.logDate === date ||
              (event.type === "daily_report" &&
                event.payload.kind === "missing_streak" &&
                event.payload.missingDates?.includes(date))),
        ),
      ).toBe(true);
    }
  });

  it("TL-F — missing streak consolidated but keeps 7 dates", () => {
    const streak = events.find(
      (event): event is Extract<(typeof events)[number], { type: "daily_report" }> =>
        event.type === "daily_report" && event.payload.kind === "missing_streak",
    );
    expect(streak).toBeTruthy();
    expect(streak!.payload.missingDates?.length).toBe(7);
    expect(streak!.evidenceRefs.filter((ref) => ref.kind === "missing_day")).toHaveLength(7);
  });

  it("TL-G — pagination has no duplicate / skip", () => {
    const page1 = paginateTimelineEvents({ events, cursor: null, limit: 5 });
    const page2 = paginateTimelineEvents({ events, cursor: page1.nextCursor, limit: 5 });
    const ids = [...page1.events, ...page2.events].map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(events.slice(0, ids.length).map((event) => event.id));
  });

  it("TL-H — filter measurement only", () => {
    const filtered = filterTimelineEvents(events, "body_measurement");
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((event) => event.type === "body_measurement")).toBe(true);
  });

  it("TL-I — attention filter only evidence-linked events (no fake history snapshots)", () => {
    const filtered = filterTimelineEvents(events, "attention");
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((event) => event.attentionLinked)).toBe(true);
  });

  it("TL-J — collapsed meal payload has storage path but no signed URL", () => {
    const withPhoto = events.find(
      (event) =>
        event.type === "daily_report" &&
        event.payload.kind === "daily_report" &&
        event.payload.customerReport?.meals.some((meal) => meal.hasPhoto),
    );
    expect(withPhoto).toBeTruthy();
    if (withPhoto?.type === "daily_report" && withPhoto.payload.kind === "daily_report") {
      const meal = withPhoto.payload.customerReport!.meals.find((item) => item.hasPhoto)!;
      expect(meal.photoStoragePath).toBeTruthy();
      expect(meal.signedUrl ?? null).toBeNull();
    }
  });

  it("TL-K — ownership is enforced by loader contract (assemble filters other owner)", () => {
    const result = assembleCommandCenter({
      ownerMemberId: "owner-a",
      asOfLogDate: "2026-08-12",
      asOfHourTaipei: 15,
      customers: buildCommandCenter30Fixture(),
    });
    expect(result.sections.allActive.some((card) => card.enrollmentId === "other-owner")).toBe(false);
  });

  it("TL-L — same-day measurement + daily report stable order", () => {
    const secondMeasureDate = fixture.bodyRecords[1]!.recordDate;
    const sameDay = events.filter((event) => event.logDate === secondMeasureDate);
    expect(sameDay.length).toBeGreaterThanOrEqual(2);
    const ids = sameDay.map((event) => event.id);
    const again = buildCoachingTimelineEvents(fixture)
      .filter((event) => event.logDate === secondMeasureDate)
      .map((event) => event.id);
    expect(again).toEqual(ids);
    // measurement should rank above daily_report on same day (newer-first within day by sortRank)
    const measureIdx = sameDay.findIndex((event) => event.type === "body_measurement");
    const dailyIdx = sameDay.findIndex((event) => event.type === "daily_report");
    expect(measureIdx).toBeGreaterThanOrEqual(0);
    expect(dailyIdx).toBeGreaterThanOrEqual(0);
    expect(measureIdx).toBeLessThan(dailyIdx);
  });

  it("TL-M — AI failure day still shows customer report", () => {
    const failed = events.find(
      (event): event is Extract<(typeof events)[number], { type: "daily_report" }> =>
        event.type === "daily_report" &&
        event.payload.kind === "daily_report" &&
        event.payload.aiStatus === "failed",
    );
    expect(failed).toBeTruthy();
    expect(failed!.payload.customerReport).toBeTruthy();
    expect(failed!.payload.customerReport?.meals.length).toBeGreaterThan(0);
  });

  it("60-second UX fixture covers required story arcs", () => {
    expect(fixture.logs.length).toBeGreaterThanOrEqual(18);
    expect(events.some((event) => event.type === "body_measurement")).toBe(true);
    expect(events.some((event) => event.type === "intervention_change")).toBe(true);
    expect(
      events.some(
        (event) => event.type === "daily_report" && event.payload.kind === "missing_streak",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "daily_report" &&
          event.payload.kind === "daily_report" &&
          event.payload.customerReport?.customerNote?.includes("餓"),
      ),
    ).toBe(true);
  });
});
