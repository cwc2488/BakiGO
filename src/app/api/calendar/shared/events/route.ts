import { extractIcalCalendarTimeZone, parseIcalEvents } from "@/lib/calendar/ical";
import { SHARED_GOOGLE_CALENDARS } from "@/lib/calendar/shared-calendars";
import { NextResponse } from "next/server";

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
        const response = await fetch(calendar.icalUrl, {
          next: { revalidate: 300 },
        });

        if (!response.ok) {
          throw new Error(`無法讀取 ${calendar.shortName}`);
        }

        const text = await response.text();
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
