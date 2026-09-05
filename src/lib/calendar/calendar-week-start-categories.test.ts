import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDefaultFormValues,
  eventToFormValues,
  formValuesToPayload,
} from "@/components/calendar/EventFormModal";
import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_KEYS,
  getCalendarCategoryDefaultColor,
  getCalendarCategoryLabel,
  normalizeCalendarCategoryKeyForSave,
  resolveCalendarCategoryKey,
} from "@/lib/calendar/calendar-categories";
import { isRecordableCalendarActivityKey } from "@/lib/calendar/calendar-baki-event-sync";
import {
  CALENDAR_WEEK_STARTS,
  DEFAULT_CALENDAR_WEEK_START,
  getCalendarWeekdayLabels,
  loadCalendarWeekStart,
  saveCalendarWeekStart,
  weekStartToJsDay,
} from "@/lib/calendar/calendar-week-start-preferences";
import { getMonthGridDates, getWeekDates } from "@/lib/calendar/recurrence";
import { createCalendarEventRepository } from "@/lib/repositories/calendar-event-repository";
import { STORAGE_KEYS } from "@/lib/repositories/storage-keys";
import type { StorageAdapter } from "@/lib/repositories/storage-adapter";

class MemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("WEEK-START preference", () => {
  it("defaults to monday (production legacy) when unset", () => {
    const storage = new MemoryStorage();
    expect(loadCalendarWeekStart(storage)).toBe(CALENDAR_WEEK_STARTS.MONDAY);
    expect(DEFAULT_CALENDAR_WEEK_START).toBe("monday");
    expect(weekStartToJsDay("monday")).toBe(1);
    expect(weekStartToJsDay("sunday")).toBe(0);
  });

  it("persists monday/sunday across reload", () => {
    const storage = new MemoryStorage();
    saveCalendarWeekStart(storage, CALENDAR_WEEK_STARTS.SUNDAY);
    expect(storage.getItem(STORAGE_KEYS.calendarWeekStart)).toBe("sunday");
    expect(loadCalendarWeekStart(storage)).toBe("sunday");
    saveCalendarWeekStart(storage, CALENDAR_WEEK_STARTS.MONDAY);
    expect(loadCalendarWeekStart(storage)).toBe("monday");
  });

  it("monday week: labels 一二三四五六日 and Sunday anchor starts previous Monday", () => {
    expect(getCalendarWeekdayLabels("monday")).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
    expect(getWeekDates("2026-09-06", 1)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });

  it("sunday week: labels 日一二三四五六 and Sunday anchor starts that Sunday", () => {
    expect(getCalendarWeekdayLabels("sunday")).toEqual(["日", "一", "二", "三", "四", "五", "六"]);
    expect(getWeekDates("2026-09-06", 0)).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("switching week-start keeps absolute dates present in the containing week", () => {
    const wednesday = "2026-09-02";
    expect(getWeekDates(wednesday, 1)).toContain(wednesday);
    expect(getWeekDates(wednesday, 0)).toContain(wednesday);
  });

  it("month grid first cell aligns with week-start across month boundary", () => {
    expect(getMonthGridDates("2026-09-15", 1)[0]).toBe("2026-08-31");
    expect(getMonthGridDates("2026-09-15", 0)[0]).toBe("2026-08-30");
    expect(getMonthGridDates("2026-09-15", 1)).toHaveLength(42);
    expect(getMonthGridDates("2026-09-15", 0)).toHaveLength(42);
  });

  it("CalendarPage wires preference into grids and settings UI", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("每週開始日");
    expect(page).toContain("星期一");
    expect(page).toContain("星期日");
    expect(page).toContain("loadCalendarWeekStart");
    expect(page).toContain("getWeekDates(selectedDate, weekStartsOn)");
    expect(page).toContain("getMonthGridDates(monthAnchor, weekStartsOn)");
  });
});

describe("CATEGORY — 私人時間 / 其他", () => {
  it("appear in selector list with correct keys/colors", () => {
    expect(CALENDAR_CATEGORIES.map((c) => c.label)).toContain("私人時間");
    expect(CALENDAR_CATEGORIES.map((c) => c.label)).toContain("其他");
    expect(CALENDAR_CATEGORY_KEYS.PRIVATE_TIME).toBe("private_time");
    expect(CALENDAR_CATEGORY_KEYS.OTHER).toBe("other");
    expect(getCalendarCategoryLabel("private_time")).toBe("私人時間");
    expect(getCalendarCategoryLabel("other")).toBe("其他");
    expect(getCalendarCategoryDefaultColor("private_time")).toBe("lavender");
    expect(getCalendarCategoryDefaultColor("other")).toBe("gray");
  });

  it("saves and reloads both new categories", () => {
    const storage = new MemoryStorage();
    const repo = createCalendarEventRepository(storage);
    for (const key of [CALENDAR_CATEGORY_KEYS.PRIVATE_TIME, CALENDAR_CATEGORY_KEYS.OTHER] as const) {
      const values = {
        ...buildDefaultFormValues("2026-09-05", "11:00"),
        title: `Smoke ${key}`,
        activityTypeKey: key,
        color: getCalendarCategoryDefaultColor(key),
      };
      const payload = formValuesToPayload(values);
      expect(payload.activityTypeKey).toBe(key);
      const created = repo.create({ memberId: "m1", ...payload });
      const reloaded = repo.getById(created.id)!;
      expect(reloaded.activityTypeKey).toBe(key);
      expect(eventToFormValues(reloaded).activityTypeKey).toBe(key);
      expect(normalizeCalendarCategoryKeyForSave(key)).toBe(key);
      expect(resolveCalendarCategoryKey(key)).toBe(key);
    }
  });

  it("does not count as consultation/measurement KPI", () => {
    expect(isRecordableCalendarActivityKey(CALENDAR_CATEGORY_KEYS.PRIVATE_TIME)).toBe(false);
    expect(isRecordableCalendarActivityKey(CALENDAR_CATEGORY_KEYS.OTHER)).toBe(false);
  });

  it("preserves existing category keys and labels", () => {
    expect(CALENDAR_CATEGORY_KEYS.MEETING).toBe("meeting");
    expect(CALENDAR_CATEGORY_KEYS.CONSULTATION).toBe("consultation");
    expect(CALENDAR_CATEGORY_KEYS.COACH_CLASS).toBe("coach_class");
    expect(CALENDAR_CATEGORY_KEYS.MEASUREMENT).toBe("measurement");
    expect(CALENDAR_CATEGORY_KEYS.DEVELOPMENT).toBe("development");
    expect(getCalendarCategoryLabel("consultation")).toBe("諮詢");
    expect(getCalendarCategoryLabel("development")).toBe("開發");
    expect(resolveCalendarCategoryKey("calendar_other")).toBe(CALENDAR_CATEGORY_KEYS.MEETING);
  });
});
