import { isGoogleCalendarConfigured } from "@/lib/calendar/google-calendar";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ configured: isGoogleCalendarConfigured() });
}
