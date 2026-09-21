import { extractIcalCalendarTimeZone, parseIcalEvents } from "@/lib/calendar/ical";
import { SHARED_GOOGLE_CALENDARS } from "@/lib/calendar/shared-calendars";
import { NextResponse } from "next/server";

/** In-memory ICS text cache — avoids Next Data Cache 2MB limit on ~4MB Google ICS. */
const ICS_TTL_MS = 5 * 60 * 1000;
const icsTextCache = new Map<string, { text: string; expiresAt: number }>();

async function fetchSharedIcalText(icalUrl: string): Promise<string> {
  const cached = icsTextCache.get(icalUrl);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.text;
  }
  // Do not use next: { revalidate } — payloads >2MB fail Next Data Cache.
  const response = await fetch(icalUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ICS fetch failed: ${response.status}`);
  }
  const text = await response.text();
  icsTextCache.set(icalUrl, { text, expiresAt: Date.now() + ICS_TTL_MS });
  return text;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeStart = searchParams.get("start");
  const rangeEnd = searchParams.get("end");

  if (!rangeStart || !rangeEnd) {
    return NextResponse.json({ error: "缺少 start 或 end 參數" }, { status: 400 });
  }

  try {
    const calendars = await Promise.all(
      SHARED_GOOGLE_CALENDARS.map(async (calendar) => {
        const text = await fetchSharedIcalText(calendar.icalUrl).catch(() => {
          throw new Error(`無法讀取 ${calendar.shortName}`);
        });
        const timeZone = extractIcalCalendarTimeZone(text) ?? calendar.timezone;
        const events = parseIcalEvents(text, rangeStart, rangeEnd, { defaultTimeZone: timeZone }).map(
          (event) => ({
            ...event,
            calendarId: calendar.id,
            calendarName: calendar.name,
            color: calendar.color,
          }),
        );

        return {
          calendarId: calendar.id,
          calendarName: calendar.name,
          events,
        };
      }),
    );

    return NextResponse.json(
      { calendars },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "無法同步共用行事曆";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
