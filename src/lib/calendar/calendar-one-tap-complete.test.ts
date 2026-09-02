import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("CalendarPage scheduled consultation UX boundary", () => {
  it("does not mount QuickActivityModal for calendar completion", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/calendar/CalendarPage.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/QuickActivityModal/);
    expect(source).not.toMatch(/completionResultOpen/);
    expect(source).toMatch(/completeCalendarActivityEvent/);
  });
});
