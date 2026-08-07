import { refreshGoogleAccessToken } from "@/lib/calendar/google-calendar";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { refreshToken?: string };
    if (!body.refreshToken) {
      return NextResponse.json({ error: "缺少 refresh token" }, { status: 400 });
    }

    const refreshed = await refreshGoogleAccessToken({
      accessToken: "",
      refreshToken: body.refreshToken,
      expiresAt: 0,
    });

    return NextResponse.json({
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "無法更新 Google 授權";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
