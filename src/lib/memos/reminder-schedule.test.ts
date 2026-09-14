import { describe, expect, it } from "vitest";
import {
  advanceNextReminderAfterNotify,
  computeNextReminderAt,
} from "@/lib/memos/reminder-schedule";
import { MEMO_REMINDER_TYPES } from "@/lib/memos/types";

describe("memo reminder schedule (Asia/Taipei)", () => {
  it("DAILY: before wall time → same Taipei day; after → next day (Case C)", () => {
    // 2026-09-14 00:30 UTC = 08:30 Taipei
    const morning = new Date("2026-09-14T00:30:00.000Z");
    const sameDay = computeNextReminderAt(
      {
        reminderType: MEMO_REMINDER_TYPES.DAILY,
        reminderTime: "09:00",
        reminderWeekday: null,
        reminderDate: null,
      },
      morning,
    );
    expect(sameDay).toBe("2026-09-14T01:00:00.000Z"); // 09:00 +08

    const next = advanceNextReminderAfterNotify(
      MEMO_REMINDER_TYPES.DAILY,
      "09:00",
      null,
      null,
      "2026-09-14T01:00:00.000Z",
    );
    expect(next).toBe("2026-09-15T01:00:00.000Z");
  });

  it("WEEKLY: Monday 10:00 → next Monday after fire (Case D)", () => {
    const mondayMorning = new Date("2026-09-14T00:00:00.000Z"); // 08:00 Taipei Monday
    const first = computeNextReminderAt(
      {
        reminderType: MEMO_REMINDER_TYPES.WEEKLY,
        reminderTime: "10:00",
        reminderWeekday: 1,
        reminderDate: null,
      },
      mondayMorning,
    );
    expect(first).toBe("2026-09-14T02:00:00.000Z"); // Mon 10:00 +08

    const next = advanceNextReminderAfterNotify(
      MEMO_REMINDER_TYPES.WEEKLY,
      "10:00",
      1,
      null,
      "2026-09-14T02:00:00.000Z",
    );
    expect(next).toBe("2026-09-21T02:00:00.000Z");
  });

  it("SPECIFIC_DATE: one-shot then clears (Case E)", () => {
    const before = new Date("2026-09-19T00:00:00.000Z");
    const first = computeNextReminderAt(
      {
        reminderType: MEMO_REMINDER_TYPES.SPECIFIC_DATE,
        reminderTime: "15:00",
        reminderWeekday: null,
        reminderDate: "2026-09-20",
      },
      before,
    );
    expect(first).toBe("2026-09-20T07:00:00.000Z"); // 15:00 +08

    const after = advanceNextReminderAfterNotify(
      MEMO_REMINDER_TYPES.SPECIFIC_DATE,
      "15:00",
      null,
      "2026-09-20",
      "2026-09-20T07:00:00.000Z",
    );
    expect(after).toBeNull();
  });

  it("completed → no next reminder (Case F)", () => {
    const next = computeNextReminderAt(
      {
        reminderType: MEMO_REMINDER_TYPES.DAILY,
        reminderTime: "09:00",
        reminderWeekday: null,
        reminderDate: null,
        completed: true,
      },
      new Date("2026-09-14T00:00:00.000Z"),
    );
    expect(next).toBeNull();
  });

  it("re-open recurring → recomputes next legal time (Case G)", () => {
    const tuesdayNoonUtc = new Date("2026-09-15T04:00:00.000Z"); // 12:00 Taipei Tue
    const next = computeNextReminderAt(
      {
        reminderType: MEMO_REMINDER_TYPES.WEEKLY,
        reminderTime: "10:00",
        reminderWeekday: 1,
        reminderDate: null,
        completed: false,
      },
      tuesdayNoonUtc,
    );
    expect(next).toBe("2026-09-21T02:00:00.000Z");
  });

  it("NONE → null", () => {
    expect(
      computeNextReminderAt(
        {
          reminderType: MEMO_REMINDER_TYPES.NONE,
          reminderTime: null,
          reminderWeekday: null,
          reminderDate: null,
        },
        new Date("2026-09-14T00:00:00.000Z"),
      ),
    ).toBeNull();
  });
});
