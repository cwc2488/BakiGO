import { exchangeGoogleAuthCode } from "@/lib/calendar/google-calendar";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/calendar?google_error=1", url.origin));
  }

  try {
    const connection = await exchangeGoogleAuthCode(code, url.origin);
    const tokenPayload = Buffer.from(JSON.stringify(connection)).toString("base64url");
    return NextResponse.redirect(
      new URL(`/calendar/oauth-complete?payload=${tokenPayload}`, url.origin),
    );
  } catch {
    return NextResponse.redirect(new URL("/calendar?google_error=1", url.origin));
  }
}
