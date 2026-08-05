import { buildGoogleAuthUrl, isGoogleCalendarConfigured } from "@/lib/calendar/google-calendar";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      { error: "請在環境變數設定 GOOGLE_CLIENT_ID 與 GOOGLE_CLIENT_SECRET" },
      { status: 503 },
    );
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(buildGoogleAuthUrl(origin));
}
