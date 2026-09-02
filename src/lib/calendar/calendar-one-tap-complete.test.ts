import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("CalendarPage scheduled consultation one-tap UX", () => {
  it("completes consultation without opening QuickActivityModal for consultation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/calendar/CalendarPage.tsx"),
      "utf8",
    );
    expect(source).toMatch(/completeCalendarActivityEvent/);
    expect(source).toMatch(/ensureScheduledConsultationCalendarEvent/);
    expect(source).toMatch(/isConsultationActivity\(formValues\.activityTypeKey\)/);
    // Measurement may still use QuickActivityModal; consultation must not share that gate.
    expect(source).not.toContain('kind === "measurement" || kind === "consultation"');
    expect(source).toContain('completionResultOpen && personalActivityKind === "measurement"');
  });

  it("uses 完成諮詢 button copy for consultation", () => {
    const modal = readFileSync(
      resolve(process.cwd(), "src/components/calendar/EventFormModal.tsx"),
      "utf8",
    );
    expect(modal).toMatch(/完成諮詢/);
    expect(modal).not.toMatch(/完成活動 · 記錄諮詢/);
  });
});
