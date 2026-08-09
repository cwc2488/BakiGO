import { NextResponse } from "next/server";
import { isMetaReviewConfigured } from "@/lib/meta-review/config";
import { sanitizeThreadsApiError } from "@/lib/meta-review/sanitize-error";
import { buildSessionFromOAuth } from "@/lib/meta-review/threads-client";
import { consumeOAuthState, setMetaReviewSession } from "@/lib/meta-review/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  if (!isMetaReviewConfigured()) {
    return NextResponse.redirect(new URL("/meta-review?error=not_configured", origin));
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/meta-review?error=${encodeURIComponent(oauthError)}`, origin),
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) {
    return NextResponse.redirect(new URL("/meta-review?error=missing_code", origin));
  }

  const stateValid = await consumeOAuthState(state);
  if (!stateValid) {
    return NextResponse.redirect(new URL("/meta-review?error=invalid_state", origin));
  }

  try {
    const session = await buildSessionFromOAuth(code, origin);
    await setMetaReviewSession(session);
    return NextResponse.redirect(new URL("/meta-review?connected=1", origin));
  } catch (error) {
    const message = sanitizeThreadsApiError(error);
    return NextResponse.redirect(
      new URL(`/meta-review?error=${encodeURIComponent(message)}`, origin),
    );
  }
}
