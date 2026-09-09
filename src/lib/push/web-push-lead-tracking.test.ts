import { describe, expect, it } from "vitest";
import {
  classifyLeadFollowUp,
  countLeadBadges,
  filterLeads,
  formatFollowUpLabel,
  sortLeadsForList,
  summarizeStatus,
} from "@/lib/lead-tracking/list-utils";
import { statusTextChanged } from "@/lib/lead-tracking/types";
import type { LeadTracking } from "@/lib/lead-tracking/types";
import { sanitizeNotificationUrl } from "@/lib/push/safe-notification-url";
import {
  collectDueCalendarRemindersForEvents,
  taipeiWallStartMs,
} from "@/lib/push/calendar-push-scheduler";
import type { CalendarEvent } from "@/types/calendar-event";

function lead(partial: Partial<LeadTracking> & Pick<LeadTracking, "id" | "name">): LeadTracking {
  return {
    ownerMemberId: "m1",
    phone: null,
    contactChannel: null,
    notes: null,
    currentStatus: null,
    nextFollowUpAt: null,
    reminderEnabled: false,
    lastFollowedUpAt: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

describe("lead tracking list utils", () => {
  const now = new Date("2026-09-09T04:00:00.000Z"); // Taipei 12:00

  it("classifies overdue / today / future / none", () => {
    expect(
      classifyLeadFollowUp(lead({ id: "1", name: "A", nextFollowUpAt: "2026-09-08T01:00:00.000Z" }), now),
    ).toBe("overdue");
    expect(
      classifyLeadFollowUp(lead({ id: "2", name: "B", nextFollowUpAt: "2026-09-09T10:00:00+08:00" }), now),
    ).toBe("today");
    expect(
      classifyLeadFollowUp(lead({ id: "3", name: "C", nextFollowUpAt: "2026-09-10T10:00:00+08:00" }), now),
    ).toBe("future");
    expect(classifyLeadFollowUp(lead({ id: "4", name: "D" }), now)).toBe("none");
  });

  it("sorts overdue first then today then future then undated", () => {
    const sorted = sortLeadsForList(
      [
        lead({ id: "u", name: "U" }),
        lead({ id: "f", name: "F", nextFollowUpAt: "2026-09-12T01:00:00.000Z" }),
        lead({ id: "o", name: "O", nextFollowUpAt: "2026-09-07T01:00:00.000Z" }),
        lead({ id: "t", name: "T", nextFollowUpAt: "2026-09-09T02:00:00.000Z" }),
      ],
      now,
    );
    expect(sorted.map((item) => item.id)).toEqual(["o", "t", "f", "u"]);
  });

  it("filters and badge counts", () => {
    const leads = [
      lead({ id: "o", name: "O", nextFollowUpAt: "2026-09-07T01:00:00.000Z" }),
      lead({ id: "t", name: "T", nextFollowUpAt: "2026-09-09T02:00:00.000Z" }),
      lead({ id: "f", name: "F", nextFollowUpAt: "2026-09-12T01:00:00.000Z" }),
    ];
    expect(filterLeads(leads, "overdue", now)).toHaveLength(1);
    expect(countLeadBadges(leads, now)).toEqual({ today: 1, overdue: 1 });
  });

  it("summarizes status and formats follow-up label", () => {
    expect(summarizeStatus("說月底領薪後再聊")).toContain("月底");
    expect(formatFollowUpLabel(null)).toBe("未設定");
  });

  it("only records history when status text meaningfully changes", () => {
    expect(statusTextChanged("a", "a")).toBe(false);
    expect(statusTextChanged("a", "b")).toBe(true);
    expect(statusTextChanged("a", "  ")).toBe(false);
    expect(statusTextChanged(null, "第一次認識")).toBe(true);
  });
});

describe("push url sanitize", () => {
  it("allows internal paths only", () => {
    expect(sanitizeNotificationUrl("/lead-tracking/abc")).toBe("/lead-tracking/abc");
    expect(sanitizeNotificationUrl("https://evil.example/x")).toBe("/");
    expect(sanitizeNotificationUrl("//evil.example")).toBe("/");
    expect(sanitizeNotificationUrl("javascript:alert(1)")).toBe("/");
  });
});

describe("calendar push due collection", () => {
  it("interprets Taipei wall clock", () => {
    expect(taipeiWallStartMs("2026-09-09T14:00", false)).toBe(
      Date.parse("2026-09-09T14:00:00+08:00"),
    );
  });

  it("collects due reminders idempotently by source key", () => {
    const startMs = Date.parse("2026-09-09T14:00:00+08:00");
    const fireMs = startMs - 15 * 60 * 1000;
    const event: CalendarEvent = {
      id: "evt1",
      memberId: "m1",
      title: "諮詢",
      startAt: "2026-09-09T14:00",
      endAt: "2026-09-09T15:00",
      allDay: false,
      color: "green",
      recurrence: { frequency: "none", interval: 1 },
      reminderMinutes: [15],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };

    const due = collectDueCalendarRemindersForEvents({
      memberId: "m1",
      events: [event],
      nowMs: fireMs + 30_000,
    });

    expect(due).toHaveLength(1);
    expect(due[0]?.sourceKey).toContain("evt1");
    expect(due[0]?.sourceKey).toContain(":15");
    expect(due[0]?.title).toBe("諮詢");
  });

  it("does not collect when outside lookback window", () => {
    const event: CalendarEvent = {
      id: "evt2",
      memberId: "m1",
      title: "舊行程",
      startAt: "2026-09-01T14:00",
      endAt: "2026-09-01T15:00",
      allDay: false,
      color: "green",
      recurrence: { frequency: "none", interval: 1 },
      reminderMinutes: [15],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const due = collectDueCalendarRemindersForEvents({
      memberId: "m1",
      events: [event],
      nowMs: Date.parse("2026-09-09T04:00:00.000Z"),
    });
    expect(due).toHaveLength(0);
  });
});
