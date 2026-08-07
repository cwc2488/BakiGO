import { buildGoogleAuthUrl, isGoogleCalendarConfigured } from "@/lib/calendar/google-calendar";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.redirect(new URL("/calendar?google_error=not_configured", origin));
  }

  return NextResponse.redirect(buildGoogleAuthUrl(origin));
}
