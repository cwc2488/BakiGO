import { addDays } from "@/lib/calendar/time-grid";
import {
  formValuesToPayload,
  type EventFormValues,
} from "@/components/calendar/EventFormModal";

function daySpan(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Copy event fields onto each target date; keep clock times / duration; clear recurrence. */
export function buildCopiedEventPayloads(source: EventFormValues, targetDates: string[]) {
  const uniqueDates = [...new Set(targetDates)].sort();
  const span = daySpan(source.date, source.endDate);

  return uniqueDates.map((date) =>
    formValuesToPayload({
      ...source,
      date,
      endDate: addDays(date, span),
      recurrenceFrequency: "none",
      recurrenceNeverEnds: true,
      recurrenceEndDate: "",
      recurrenceInterval: 1,
    }),
  );
}

export function formatSelectedCopyDatesZh(dates: string[]): string {
  if (dates.length === 0) {
    return "尚未選擇日期";
  }
  const labels = [...dates]
    .sort()
    .map((date) => {
      const [, month, day] = date.split("-");
      return `${Number(month)}月${Number(day)}日`;
    });
  return `已選擇：${labels.join(", ")}`;
}
